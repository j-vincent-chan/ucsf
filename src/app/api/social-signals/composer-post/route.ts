import { NextResponse } from "next/server";
import { getProfile, getSessionUser } from "@/lib/auth";
import { fetchGifFromKlipyCdnUrl } from "@/lib/klipy";
import { publishBlueskyText } from "@/lib/social-signals/bluesky";
import { parseWorkspaceSocialSettings, workspaceBlueskyAppCredentials } from "@/lib/workspace-social-settings";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import {
  createTweet,
  describeXPostPermissionError,
  ensureFreshUserAccessToken,
  uploadTwitterMedia,
} from "@/lib/x-post";
import { substituteBlueskyHandlesForX } from "@/lib/x-mention-substitute";
import { parsePollFromFormData, validateSocialPoll } from "@/lib/social-poll";

export const dynamic = "force-dynamic";

const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

async function parseMedia(form: FormData): Promise<{ buffer: Buffer; mime: string } | null> {
  const mediaEntry = form.get("media");
  const gifUrlRaw = form.get("gifUrl");
  const gifTrim = typeof gifUrlRaw === "string" ? gifUrlRaw.trim() : "";

  if (mediaEntry instanceof File && mediaEntry.size > 0 && gifTrim) {
    throw new Error("Attach either a file or one GIF, not both.");
  }

  if (mediaEntry instanceof File && mediaEntry.size > 0) {
    const mime = (mediaEntry.type || "application/octet-stream").trim();
    if (!mime.startsWith("image/")) {
      throw new Error("Only image attachments are supported.");
    }
    if (mediaEntry.size > MAX_MEDIA_BYTES) {
      throw new Error("Image must be 5 MB or smaller.");
    }
    return { buffer: Buffer.from(await mediaEntry.arrayBuffer()), mime };
  }

  if (gifTrim) {
    return fetchGifFromKlipyCdnUrl(gifTrim, MAX_MEDIA_BYTES);
  }

  return null;
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form body" }, { status: 400 });
  }

  const text = String(form.get("text") ?? "").trim();
  const postToX = form.get("postToX") === "true" || form.get("postToX") === "1";
  const postToBluesky = form.get("postToBluesky") === "true" || form.get("postToBluesky") === "1";

  if (!postToX && !postToBluesky) {
    return NextResponse.json({ error: "Choose at least one platform." }, { status: 400 });
  }

  const pollDraft = parsePollFromFormData(form);
  let pollValidated: { options: string[]; durationMinutes: number } | null = null;
  if (pollDraft) {
    const checked = validateSocialPoll(pollDraft);
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }
    pollValidated = {
      options: checked.options,
      durationMinutes: Math.round(pollDraft.durationMinutes),
    };
  }

  let media: { buffer: Buffer; mime: string } | null;
  try {
    media = await parseMedia(form);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid attachment" },
      { status: 400 },
    );
  }

  if (pollValidated && media) {
    return NextResponse.json({ error: "Remove the image or GIF to post a poll." }, { status: 400 });
  }

  if (pollValidated && !postToX) {
    return NextResponse.json(
      { error: "Polls are only supported on X. Select X as a platform or remove the poll." },
      { status: 400 },
    );
  }

  if (!text && !media && !pollValidated) {
    return NextResponse.json({ error: "Add text, a poll, or an attachment." }, { status: 400 });
  }

  if (pollValidated && !text.trim()) {
    return NextResponse.json({ error: "Add a question above your poll choices." }, { status: 400 });
  }

  const bodyText = text || (media ? "\u200c" : "");

  type Done = { platform: "x" | "bluesky"; ok: boolean; url?: string; error?: string };
  const done: Done[] = [];

  if (postToX) {
    const admin = tryCreateAdminClient();
    if (!admin) {
      done.push({ platform: "x", ok: false, error: "Server misconfigured (service role)" });
    } else {
      try {
        const { data: row, error: fetchErr } = await admin
          .from("profiles")
          .select("x_oauth")
          .eq("id", user.id)
          .maybeSingle();

        if (fetchErr || !row) {
          done.push({ platform: "x", ok: false, error: "Profile not found" });
        } else {
          const bundle = await ensureFreshUserAccessToken(admin, user.id, row.x_oauth);
          let tweetText = bodyText;
          const profile = await getProfile();
          if (profile?.community_id) {
            const { data: handlePairs } = await admin
              .from("tracked_entities")
              .select("x_handle, bluesky_handle")
              .eq("community_id", profile.community_id)
              .not("x_handle", "is", null)
              .not("bluesky_handle", "is", null);
            if (handlePairs?.length) {
              tweetText = substituteBlueskyHandlesForX(tweetText, handlePairs);
            }
          }

          let mediaIds: string[] | undefined;
          if (media && media.buffer.length <= MAX_MEDIA_BYTES) {
            try {
              const id = await uploadTwitterMedia(bundle.access_token, media.buffer, media.mime);
              mediaIds = [id];
            } catch {
              // fall through text-only
            }
          }

          const result = await createTweet(bundle.access_token, tweetText, {
            mediaIds,
            ...(pollValidated
              ? {
                  poll: {
                    options: pollValidated.options,
                    duration_minutes: pollValidated.durationMinutes,
                  },
                }
              : {}),
          });
          done.push({ platform: "x", ok: true, url: result.url });
        }
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        if (name === "XOauthNotConnected") {
          done.push({
            platform: "x",
            ok: false,
            error: "Connect X in Settings → Post to X (OAuth 2.0) first.",
          });
        } else if (name === "XOauthExpiredNoRefresh") {
          done.push({ platform: "x", ok: false, error: "X session expired. Reconnect in Settings." });
        } else {
          const msg = e instanceof Error ? e.message : "X post failed";
          done.push({ platform: "x", ok: false, error: describeXPostPermissionError(msg) });
        }
      }
    }
  }

  if (postToBluesky) {
    try {
      const profile = await getProfile();
      const social = parseWorkspaceSocialSettings(profile?.community?.social_settings ?? null);
      const blueskyCredentials = workspaceBlueskyAppCredentials(social);
      if (!blueskyCredentials) {
        done.push({
          platform: "bluesky",
          ok: false,
          error:
            "Bluesky is not configured for this workspace — save your Bluesky handle and app password under Settings → Social publishing.",
        });
      } else if (pollValidated) {
        done.push({
          platform: "bluesky",
          ok: false,
          error:
            "Bluesky does not support polls — your poll was posted on X only. Turn off Bluesky or remove the poll to post there.",
        });
      } else {
        const result = await publishBlueskyText(bodyText, {
          ...(media ? { image: media } : {}),
          blueskyCredentials,
        });
        done.push({ platform: "bluesky", ok: true, url: result.url });
      }
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      const msg = e instanceof Error ? e.message : "Bluesky post failed";
      if (name === "BlueskyNotConfigured") {
        done.push({
          platform: "bluesky",
          ok: false,
          error:
            "Bluesky is not configured for this workspace — save your Bluesky handle and app password under Settings → Social publishing.",
        });
      } else {
        done.push({ platform: "bluesky", ok: false, error: msg });
      }
    }
  }

  const failed = done.filter((d) => !d.ok);
  const succeeded = done.filter((d) => d.ok && d.url);

  if (succeeded.length > 0) {
    return NextResponse.json({
      ok: true as const,
      partial: failed.length > 0,
      results: done,
      urls: succeeded.map((s) => ({ platform: s.platform, url: s.url! })),
    });
  }

  return NextResponse.json(
    {
      ok: false as const,
      results: done,
      error: failed.map((f) => `${f.platform === "x" ? "X" : "Bluesky"}: ${f.error}`).join(" · "),
    },
    { status: 502 },
  );
}
