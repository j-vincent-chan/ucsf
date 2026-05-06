import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import {
  blueskyEngageLikeAllowDuplicate,
  blueskyEngageRepostAllowDuplicate,
  blueskyEngageReply,
  getBlueskyWorkspaceSession,
  resolveBskyPostStrongRef,
} from "@/lib/social-signals/bluesky";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { fetchGifFromAllowedCdnUrl } from "@/lib/giphy";
import {
  createTweet,
  describeXPostPermissionError,
  ensureFreshUserAccessToken,
  fetchXAuthenticatedUserId,
  uploadTwitterMedia,
  xLikeTweet,
  xRetweet,
} from "@/lib/x-post";

const bodySchema = z.object({
  postId: z.string().min(3),
  action: z.enum(["like", "repost", "reply"]),
  text: z.string().max(25_000).optional(),
  bskyRecordCid: z.string().optional(),
});

function parseEngageTarget(postId: string): { platform: "x" | "bluesky"; id: string; atUri?: string } {
  if (postId.startsWith("x:")) {
    return { platform: "x", id: postId.slice(2) };
  }
  if (postId.startsWith("bsky:")) {
    const atUri = postId.slice(5).trim();
    if (!atUri.startsWith("at://")) {
      throw new Error("Invalid Bluesky post id");
    }
    return { platform: "bluesky", id: atUri, atUri };
  }
  throw new Error("Unrecognized post id (expected x: or bsky: prefix)");
}

function xErrorLooksDuplicate(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("already favorited") ||
    m.includes("already liked") ||
    m.includes("duplicate") ||
    m.includes("you cannot retweet")
  );
}

const MAX_REPLY_MEDIA_BYTES = 5 * 1024 * 1024;

async function parseEngageBody(req: Request): Promise<{
  fields: z.infer<typeof bodySchema>;
  media: { buffer: Buffer; mime: string } | null;
}> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new Error("Invalid multipart body");
    }
    const postId = String(form.get("postId") ?? "").trim();
    const action = String(form.get("action") ?? "").trim();
    const textRaw = form.get("text");
    const text = textRaw != null ? String(textRaw) : undefined;
    const bskyRaw = form.get("bskyRecordCid");
    const bskyRecordCid = bskyRaw != null && String(bskyRaw).trim() ? String(bskyRaw).trim() : undefined;

    let media: { buffer: Buffer; mime: string } | null = null;
    const mediaEntry = form.get("media");
    const giphyUrlRaw = form.get("giphyUrl");
    const giphyTrim = typeof giphyUrlRaw === "string" ? giphyUrlRaw.trim() : "";

    if (mediaEntry instanceof File && mediaEntry.size > 0 && giphyTrim) {
      throw new Error("Attach either a file or one GIPHY GIF, not both.");
    }

    if (mediaEntry instanceof File && mediaEntry.size > 0) {
      const mime = (mediaEntry.type || "application/octet-stream").trim();
      if (!mime.startsWith("image/")) {
        throw new Error("Only image attachments are supported for replies.");
      }
      if (mediaEntry.size > MAX_REPLY_MEDIA_BYTES) {
        throw new Error("Image must be 5 MB or smaller.");
      }
      const buffer = Buffer.from(await mediaEntry.arrayBuffer());
      media = { buffer, mime };
    } else if (giphyTrim) {
      try {
        media = await fetchGifFromAllowedCdnUrl(giphyTrim, MAX_REPLY_MEDIA_BYTES);
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : "Could not load GIF.");
      }
    }

    const parsed = bodySchema.safeParse({ postId, action, text, bskyRecordCid });
    if (!parsed.success) {
      throw new Error("Invalid form fields");
    }
    return { fields: parsed.data, media };
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new Error("Invalid JSON");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Invalid body");
  }
  return { fields: parsed.data, media: null };
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let fields: z.infer<typeof bodySchema>;
  let media: { buffer: Buffer; mime: string } | null;
  try {
    const parsed = await parseEngageBody(req);
    fields = parsed.fields;
    media = parsed.media;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bad request";
    if (msg === "Invalid JSON") {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (msg === "Invalid multipart body") {
      return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
    }
    if (msg === "Invalid body" || msg === "Invalid form fields") {
      return NextResponse.json({ error: msg === "Invalid body" ? "Invalid body" : "Invalid form fields" }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (fields.action === "reply") {
    const t = fields.text?.trim() ?? "";
    if (!t && !media) {
      return NextResponse.json({ error: "Add text or attach an image." }, { status: 400 });
    }
  }
  if (fields.action !== "reply" && media) {
    return NextResponse.json({ error: "Media is only allowed for replies." }, { status: 400 });
  }

  let target: { platform: "x" | "bluesky"; id: string; atUri?: string };
  try {
    target = parseEngageTarget(fields.postId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid post id" },
      { status: 400 },
    );
  }

  if (target.platform === "x" && !/^\d+$/.test(target.id)) {
    return NextResponse.json({ error: "Invalid X post id" }, { status: 400 });
  }

  const admin = tryCreateAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfigured (service role)" }, { status: 500 });
  }

  if (target.platform === "x") {
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
      if (name === "XOauthNotConnected") {
        return NextResponse.json(
          { error: "Connect X in Settings (OAuth) to reply, repost, or like from the feed." },
          { status: 403 },
        );
      }
      if (name === "XOauthExpiredNoRefresh") {
        return NextResponse.json({ error: "X session expired. Reconnect in Settings." }, { status: 403 });
      }
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "OAuth error" },
        { status: 502 },
      );
    }

    let xUserId: string;
    try {
      xUserId = await fetchXAuthenticatedUserId(bundle.access_token);
    } catch (e) {
      return NextResponse.json(
        { error: describeXPostPermissionError(e instanceof Error ? e.message : "X auth failed") },
        { status: 502 },
      );
    }

    const tweetId = target.id;

    try {
      if (fields.action === "like") {
        await xLikeTweet(bundle.access_token, xUserId, tweetId);
        return NextResponse.json({ ok: true as const });
      }
      if (fields.action === "repost") {
        await xRetweet(bundle.access_token, xUserId, tweetId);
        return NextResponse.json({ ok: true as const });
      }
      const replyText = (fields.text ?? "").trim();
      let mediaIds: string[] | undefined;
      if (media) {
        const mediaId = await uploadTwitterMedia(bundle.access_token, media.buffer, media.mime);
        mediaIds = [mediaId];
      }
      const tweetBody = replyText || (mediaIds?.length ? "\u200c" : "");
      const result = await createTweet(bundle.access_token, tweetBody, {
        reply: { in_reply_to_tweet_id: tweetId },
        mediaIds,
      });
      return NextResponse.json({ ok: true as const, url: result.url });
    } catch (e) {
      const firstMsg = e instanceof Error ? e.message : "X action failed";
      if (fields.action !== "reply" && xErrorLooksDuplicate(firstMsg)) {
        return NextResponse.json({ ok: true as const, duplicate: true as const });
      }
      return NextResponse.json(
        { error: describeXPostPermissionError(firstMsg) },
        { status: 502 },
      );
    }
  }

  // Bluesky — workspace app password (same account that ingests the feed).
  let bsky: Awaited<ReturnType<typeof getBlueskyWorkspaceSession>>;
  try {
    bsky = await getBlueskyWorkspaceSession();
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "BlueskyNotConfigured") {
      return NextResponse.json(
        { error: "Bluesky is not configured for this workspace (server env credentials)." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bluesky session failed" },
      { status: 502 },
    );
  }

  try {
    const strong = await resolveBskyPostStrongRef(
      bsky.accessJwt,
      target.atUri!,
      fields.bskyRecordCid,
    );

    if (fields.action === "like") {
      const applied = await blueskyEngageLikeAllowDuplicate(bsky.accessJwt, bsky.repo, strong);
      return NextResponse.json({ ok: true as const, duplicate: applied ? undefined : true });
    }
    if (fields.action === "repost") {
      const applied = await blueskyEngageRepostAllowDuplicate(bsky.accessJwt, bsky.repo, strong);
      return NextResponse.json({ ok: true as const, duplicate: applied ? undefined : true });
    }
    const text = (fields.text ?? "").trim();
    const { url } = await blueskyEngageReply(
      bsky.accessJwt,
      bsky.repo,
      bsky.handleLabel,
      strong,
      text,
      media ? { image: { buffer: media.buffer, mime: media.mime } } : undefined,
    );
    return NextResponse.json({ ok: true as const, url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bluesky action failed" },
      { status: 502 },
    );
  }
}
