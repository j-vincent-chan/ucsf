import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import {
  createTweet,
  describeXPostPermissionError,
  ensureFreshUserAccessToken,
  tweetTextWithSourceLink,
  uploadTwitterMedia,
} from "@/lib/x-post";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import {
  resolvePublishSourceUrlForItem,
  resolvePublishVisualForSourceItem,
} from "@/lib/publish-source-visual";

const bodySchema = z.object({
  /** Tweet body (UTF-8); length limits depend on X account tier — we validate a safe upper bound. */
  text: z.string().trim().min(1).max(25_000),
  /** When set, attach the item’s selected digest visual if resolvable (same community as the user). */
  source_item_id: z.string().uuid().optional(),
  attachment: z.enum(["digest_visual", "source_link"]).optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = tryCreateAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfigured (service role)" }, { status: 500 });
  }

  const { data: row, error: fetchErr } = await admin
    .from("profiles")
    .select("x_oauth")
    .eq("id", user.id)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  let bundle;
  try {
    bundle = await ensureFreshUserAccessToken(admin, user.id, row.x_oauth);
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    const msg = e instanceof Error ? e.message : "OAuth error";
    if (name === "XOauthNotConnected") {
      return NextResponse.json(
        { error: "Connect X in Settings → Post to X (OAuth 2.0) first." },
        { status: 403 },
      );
    }
    if (name === "XOauthExpiredNoRefresh") {
      return NextResponse.json(
        { error: "X session expired. Reconnect in Settings." },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const attachment = parsed.data.attachment ?? "digest_visual";

  let tweetText = parsed.data.text;
  let mediaIds: string[] | undefined;

  if (attachment === "source_link") {
    if (!parsed.data.source_item_id) {
      return NextResponse.json(
        { error: "source_item_id is required for link preview attachment." },
        { status: 400 },
      );
    }
    const url = await resolvePublishSourceUrlForItem(admin, user.id, parsed.data.source_item_id);
    if (!url) {
      return NextResponse.json(
        { error: "No http(s) article URL on this item — add a source URL or use digest image." },
        { status: 400 },
      );
    }
    tweetText = tweetTextWithSourceLink(parsed.data.text, url).text;
  } else if (parsed.data.source_item_id) {
    const visual = await resolvePublishVisualForSourceItem(
      admin,
      user.id,
      parsed.data.source_item_id,
    );
    if (visual && visual.buffer.length <= 5 * 1024 * 1024) {
      try {
        const id = await uploadTwitterMedia(bundle.access_token, visual.buffer, visual.mime);
        mediaIds = [id];
      } catch {
        // Post text-only if media upload fails (e.g. scope or format).
      }
    }
    if (attachment === "digest_visual") {
      const url = await resolvePublishSourceUrlForItem(admin, user.id, parsed.data.source_item_id);
      if (url) {
        tweetText = tweetTextWithSourceLink(tweetText, url).text;
      }
    }
  }

  try {
    const result = await createTweet(bundle.access_token, tweetText, {
      mediaIds,
    });
    return NextResponse.json(result);
  } catch (e) {
    const firstMsg = e instanceof Error ? e.message : "Post failed";
    // Many 403s are media-specific; retry once without attachments.
    if (mediaIds?.length) {
      try {
        const result = await createTweet(bundle.access_token, tweetText, {});
        return NextResponse.json({ ...result, posted_without_media: true as const });
      } catch (e2) {
        const msg = e2 instanceof Error ? e2.message : firstMsg;
        return NextResponse.json(
          { error: describeXPostPermissionError(msg, { textOnlyRetryAlsoFailed: true }) },
          { status: 502 },
        );
      }
    }
    return NextResponse.json({ error: describeXPostPermissionError(firstMsg) }, { status: 502 });
  }
}
