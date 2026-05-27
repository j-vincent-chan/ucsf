import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { articleUrlAlreadyInText } from "@/lib/social-article-url";
import { X_CHAR_LIMIT } from "@/lib/social-signals/workspace-types";
import {
  accessTokenLikelyExpired,
  bundleFromStored,
  refreshAccessToken,
  xOAuthCredentialsConfigured,
  type XOAuthTokenBundle,
} from "@/lib/x-oauth";

export type XPostResult = {
  tweetId: string;
  /** Canonical status URL (works without knowing handle). */
  url: string;
};

/** X API v2 base URL (matches docs.x.com; bearer tokens work here and on api.twitter.com). */
const X_API_V2_BASE = "https://api.x.com/2";

const MEDIA_CHUNK_BYTES = 1024 * 1024;

export type XPostPermissionErrorContext = {
  /** True when tweet-with-media failed and a second POST /2/tweets without media also failed. */
  textOnlyRetryAlsoFailed?: boolean;
};

/**
 * X often returns a generic 403 like "You are not permitted to perform this action."
 * Map it to something actionable for support / Settings.
 */
export function describeXPostPermissionError(
  message: string,
  context?: XPostPermissionErrorContext,
): string {
  const m = message.trim();
  const low = m.toLowerCase();
  const looksForbidden =
    low.includes("not permitted") ||
    low.includes("not allowed to perform") ||
    low.includes("forbidden");
  if (!looksForbidden) return m;

  if (low.includes("client-not-enrolled") || low.includes("reason: client-not-enrolled")) {
    return `${m} — X is blocking writes until this app is enrolled for the right API product/access (Developer Portal → your project → Products / access level). Complete any required signup or upgrade so “Post” / v2 write is enabled, then reconnect in Settings.`;
  }

  if (context?.textOnlyRetryAlsoFailed) {
    return `${m} — A text-only retry also failed: your project likely cannot post with user OAuth on your current X API plan, or the app is not enrolled for write access. Check Developer Portal product access and that deployment X_OAUTH_CLIENT_ID matches this app; then disconnect and reconnect in Settings.`;
  }

  return `${m} — In the X Developer Portal, confirm your app/project is enrolled for posting on your API product. In Settings, disconnect X and reconnect (tweet.write, like.write, media.write for images).`;
}

/**
 * Ensures a valid user access token, refreshing with `refresh_token` when near expiry
 * and persisting the new bundle to `profiles.x_oauth`.
 */
export async function ensureFreshUserAccessToken(
  admin: SupabaseClient<Database>,
  userId: string,
  stored: Json | null,
): Promise<XOAuthTokenBundle> {
  const bundle = bundleFromStored(stored);
  if (!bundle?.access_token) {
    const err = new Error("NOT_CONNECTED");
    err.name = "XOauthNotConnected";
    throw err;
  }

  if (!accessTokenLikelyExpired(bundle)) return bundle;

  if (!bundle.refresh_token) {
    const err = new Error("TOKEN_EXPIRED_RECONNECT");
    err.name = "XOauthExpiredNoRefresh";
    throw err;
  }

  if (!xOAuthCredentialsConfigured()) {
    const err = new Error("X_OAUTH_SERVER_MISCONFIGURED");
    err.name = "XOauthServerMisconfigured";
    throw err;
  }

  try {
    const next = await refreshAccessToken(bundle.refresh_token);
    const { error } = await admin
      .from("profiles")
      .update({
        x_oauth: JSON.parse(JSON.stringify(next)) as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      throw new Error(`Could not save refreshed X tokens: ${error.message}`);
    }

    return next;
  } catch (e) {
    // Refresh can fail while the access token is still within its lifetime — use it for this request.
    if (bundle.expires_at !== undefined && Date.now() < bundle.expires_at) {
      return bundle;
    }
    throw e;
  }
}

function normalizeMimeForXUpload(mime: string): string {
  const m = mime.trim().toLowerCase();
  if (m === "image/jpg") return "image/jpeg";
  return m;
}

/** Maps MIME to X `MediaCategory` for tweets. */
function mediaCategoryForMime(mediaType: string): "tweet_image" | "tweet_gif" {
  return mediaType.includes("gif") ? "tweet_gif" : "tweet_image";
}

function extractXProblemMessage(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const errors = o.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0];
    if (first && typeof first === "object") {
      const e = first as Record<string, unknown>;
      if (typeof e.detail === "string") return e.detail;
      if (typeof e.title === "string") return e.title;
      if (typeof e.message === "string") return e.message;
    }
  }
  if (typeof o.detail === "string") return o.detail;
  if (typeof o.title === "string") return o.title;
  if (typeof o.error === "string") return o.error;
  return null;
}

async function waitForMediaProcessing(accessToken: string, mediaId: string): Promise<void> {
  const maxAttempts = 40;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const url = new URL(`${X_API_V2_BASE}/media/upload`);
    url.searchParams.set("command", "STATUS");
    url.searchParams.set("media_id", mediaId);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const raw = (await res.json().catch(() => ({}))) as {
      data?: {
        processing_info?: {
          state?: string;
          check_after_secs?: number;
          error?: { message?: string };
        };
      };
    };

    const info = raw.data?.processing_info;
    if (!info) return;

    const state = info.state;
    if (state === "succeeded") return;
    if (state === "failed") {
      throw new Error(info.error?.message ?? "X media processing failed");
    }

    const waitSec = Math.min(Math.max(info.check_after_secs ?? 2, 1), 15);
    await new Promise((r) => setTimeout(r, waitSec * 1000));
  }
  throw new Error("X media processing timed out");
}

/**
 * Chunked upload via X API v2 (`POST /2/media/upload/initialize`, `append`, `finalize`).
 * Returns `media_id` string for `POST /2/tweets` → `media.media_ids`.
 *
 * @see https://docs.x.com/x-api/media/upload-media
 */
export async function uploadTwitterMedia(
  userAccessToken: string,
  buffer: Buffer,
  mime: string,
): Promise<string> {
  const mediaType = normalizeMimeForXUpload(mime);
  const media_category = mediaCategoryForMime(mediaType);

  const initRes = await fetch(`${X_API_V2_BASE}/media/upload/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      media_type: mediaType,
      total_bytes: buffer.length,
      media_category,
    }),
  });

  const initRaw = await initRes.json().catch(() => ({}));
  if (!initRes.ok) {
    const msg =
      extractXProblemMessage(initRaw) ??
      (typeof initRaw === "object" && initRaw && "message" in initRaw
        ? String((initRaw as { message?: unknown }).message)
        : null) ??
      initRes.statusText;
    throw new Error(`X media initialize: ${msg}`);
  }

  const mediaId = (initRaw as { data?: { id?: string } }).data?.id;
  if (!mediaId) throw new Error("X media initialize returned no media id");

  const chunks = Math.ceil(buffer.length / MEDIA_CHUNK_BYTES);
  for (let i = 0; i < chunks; i++) {
    const start = i * MEDIA_CHUNK_BYTES;
    const end = Math.min(start + MEDIA_CHUNK_BYTES, buffer.length);
    const chunk = buffer.subarray(start, end);

    const form = new FormData();
    form.append("segment_index", String(i));
    form.append(
      "media",
      new Blob([new Uint8Array(chunk)], { type: mediaType }),
      "media",
    );

    const appRes = await fetch(`${X_API_V2_BASE}/media/upload/${encodeURIComponent(mediaId)}/append`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
      body: form,
    });

    if (!appRes.ok) {
      const appRaw = await appRes.json().catch(() => ({}));
      const msg = extractXProblemMessage(appRaw) ?? appRes.statusText;
      throw new Error(`X media append: ${msg}`);
    }
  }

  const finRes = await fetch(
    `${X_API_V2_BASE}/media/upload/${encodeURIComponent(mediaId)}/finalize`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
    },
  );

  const finRaw = await finRes.json().catch(() => ({}));
  if (!finRes.ok) {
    const msg = extractXProblemMessage(finRaw) ?? finRes.statusText;
    throw new Error(`X media finalize: ${msg}`);
  }

  const processing = (finRaw as { data?: { processing_info?: { state?: string } } }).data?.processing_info;
  if (processing?.state === "pending" || processing?.state === "in_progress") {
    await waitForMediaProcessing(userAccessToken, mediaId);
  }

  return mediaId;
}

/** Human-readable line from POST /2/tweets error JSON (v2 errors + problem+json). */
function formatTweetCreateError(raw: unknown, httpStatus: number): string {
  if (!raw || typeof raw !== "object") {
    return `X API error (HTTP ${httpStatus})`;
  }
  const o = raw as Record<string, unknown>;
  const lines: string[] = [];

  const detail = typeof o.detail === "string" ? o.detail.trim() : "";
  const title = typeof o.title === "string" ? o.title.trim() : "";

  if (detail) lines.push(detail);
  else if (title) lines.push(title);

  const reason = typeof o.reason === "string" ? o.reason.trim() : "";
  if (reason && !detail.toLowerCase().includes(reason.toLowerCase())) {
    lines.push(`reason: ${reason}`);
  }

  const reg = typeof o.registration_url === "string" ? o.registration_url.trim() : "";
  if (reg) lines.push(reg);

  const ptype = typeof o.type === "string" ? o.type.trim() : "";
  if (ptype && ptype.includes("problem") && !lines.some((l) => l.includes(ptype))) {
    lines.push(ptype);
  }

  const errors = o.errors;
  if (Array.isArray(errors)) {
    for (const e of errors) {
      if (!e || typeof e !== "object") continue;
      const er = e as Record<string, unknown>;
      const d = typeof er.detail === "string" ? er.detail.trim() : "";
      const m = typeof er.message === "string" ? er.message.trim() : "";
      const t = typeof er.title === "string" ? er.title.trim() : "";
      const chunk = d || m || (t && t.toLowerCase() !== "forbidden" ? t : "");
      if (chunk && !lines.includes(chunk) && chunk !== detail) lines.push(chunk);
    }
  }

  if (!detail && title.toLowerCase() === "forbidden" && lines.length === 0) {
    lines.push(title);
  }

  return lines.length ? lines.join(" — ") : `X API error (HTTP ${httpStatus})`;
}

const TWEET_CREATE_URLS = [`${X_API_V2_BASE}/tweets`, "https://api.twitter.com/2/tweets"] as const;

export async function fetchXAuthenticatedUserId(accessToken: string): Promise<string> {
  const res = await fetch(`${X_API_V2_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(extractXProblemMessage(raw) ?? `X users/me failed (${res.status})`);
  }
  const id = (raw as { data?: { id?: string } }).data?.id;
  if (!id) throw new Error("X API returned no user id");
  return id;
}

const LIKE_POST_URLS = [
  `${X_API_V2_BASE}/users`,
  "https://api.twitter.com/2/users",
] as const;

export async function xLikeTweet(accessToken: string, userId: string, tweetId: string): Promise<void> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const body = JSON.stringify({ tweet_id: tweetId });

  let lastRaw: unknown = {};
  let lastStatus = 0;

  for (let i = 0; i < LIKE_POST_URLS.length; i++) {
    const base = LIKE_POST_URLS[i]!;
    const res = await fetch(`${base}/${encodeURIComponent(userId)}/likes`, {
      method: "POST",
      headers,
      body,
    });
    const raw = await res.json().catch(() => ({}));

    if (res.ok) return;

    lastRaw = raw;
    lastStatus = res.status;

    const retryable = res.status === 403 || res.status === 401;
    if (!retryable || i === LIKE_POST_URLS.length - 1) {
      break;
    }
  }

  throw new Error(formatTweetCreateError(lastRaw, lastStatus));
}

/** Undo like (DELETE /2/users/:id/likes/:tweet_id). Prefer dual-host retry like {@link xLikeTweet}. */
export async function xUnlikeTweet(accessToken: string, userId: string, tweetId: string): Promise<void> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  let lastRaw: unknown = {};
  let lastStatus = 0;

  for (let i = 0; i < LIKE_POST_URLS.length; i++) {
    const base = LIKE_POST_URLS[i]!;
    const res = await fetch(`${base}/${encodeURIComponent(userId)}/likes/${encodeURIComponent(tweetId)}`, {
      method: "DELETE",
      headers,
    });
    const raw = await res.json().catch(() => ({}));

    if (res.ok) return;

    lastRaw = raw;
    lastStatus = res.status;

    const retryable = res.status === 403 || res.status === 401;
    if (!retryable || i === LIKE_POST_URLS.length - 1) {
      break;
    }
  }

  throw new Error(formatTweetCreateError(lastRaw, lastStatus));
}

const RETWEET_POST_URLS = [
  `${X_API_V2_BASE}/users`,
  "https://api.twitter.com/2/users",
] as const;

export async function xRetweet(accessToken: string, userId: string, tweetId: string): Promise<void> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const body = JSON.stringify({ tweet_id: tweetId });

  let lastRaw: unknown = {};
  let lastStatus = 0;

  for (let i = 0; i < RETWEET_POST_URLS.length; i++) {
    const base = RETWEET_POST_URLS[i]!;
    const res = await fetch(`${base}/${encodeURIComponent(userId)}/retweets`, {
      method: "POST",
      headers,
      body,
    });
    const raw = await res.json().catch(() => ({}));

    if (res.ok) return;

    lastRaw = raw;
    lastStatus = res.status;

    const retryable = res.status === 403 || res.status === 401;
    if (!retryable || i === RETWEET_POST_URLS.length - 1) {
      break;
    }
  }

  throw new Error(formatTweetCreateError(lastRaw, lastStatus));
}

/** Undo repost (DELETE /2/users/:id/retweets/:source_tweet_id). Idempotent when not retweeted. */
export async function xUnretweet(accessToken: string, userId: string, tweetId: string): Promise<void> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  let lastRaw: unknown = {};
  let lastStatus = 0;

  for (let i = 0; i < RETWEET_POST_URLS.length; i++) {
    const base = RETWEET_POST_URLS[i]!;
    const res = await fetch(
      `${base}/${encodeURIComponent(userId)}/retweets/${encodeURIComponent(tweetId)}`,
      { method: "DELETE", headers },
    );
    const raw = await res.json().catch(() => ({}));

    if (res.ok) return;

    lastRaw = raw;
    lastStatus = res.status;

    const retryable = res.status === 403 || res.status === 401;
    if (!retryable || i === RETWEET_POST_URLS.length - 1) {
      break;
    }
  }

  throw new Error(formatTweetCreateError(lastRaw, lastStatus));
}

/** Create a tweet with OAuth 2.0 user context (not app-only Bearer). */
export async function createTweet(
  accessToken: string,
  text: string,
  options?: { mediaIds?: string[]; reply?: { in_reply_to_tweet_id: string } },
): Promise<XPostResult> {
  const payload: {
    text: string;
    media?: { media_ids: string[] };
    reply?: { in_reply_to_tweet_id: string };
  } = { text };
  if (options?.mediaIds?.length) {
    payload.media = { media_ids: options.mediaIds };
  }
  if (options?.reply?.in_reply_to_tweet_id) {
    payload.reply = { in_reply_to_tweet_id: options.reply.in_reply_to_tweet_id };
  }

  const body = JSON.stringify(payload);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  let lastRaw: unknown = {};
  let lastStatus = 0;

  for (let i = 0; i < TWEET_CREATE_URLS.length; i++) {
    const url = TWEET_CREATE_URLS[i]!;
    const res = await fetch(url, { method: "POST", headers, body });
    const raw = await res.json().catch(() => ({}));

    if (res.ok) {
      const id = (raw as { data?: { id?: string } }).data?.id;
      if (!id) throw new Error("X API returned no tweet id");
      return {
        tweetId: id,
        url: `https://twitter.com/i/web/status/${id}`,
      };
    }

    lastRaw = raw;
    lastStatus = res.status;

    const retryable = res.status === 403 || res.status === 401;
    if (!retryable || i === TWEET_CREATE_URLS.length - 1) {
      break;
    }
  }

  throw new Error(formatTweetCreateError(lastRaw, lastStatus));
}

/**
 * Append the article URL so X can unfurl a link card, staying within the character budget.
 */
export function tweetTextWithSourceLink(
  baseText: string,
  articleUrl: string,
  maxLen = X_CHAR_LIMIT,
): { text: string; truncated: boolean } {
  const url = articleUrl.trim();
  const base = baseText.trim();
  if (!url) {
    if (base.length <= maxLen) return { text: base, truncated: false };
    return { text: base.slice(0, Math.max(0, maxLen - 1)) + "…", truncated: true };
  }

  if (articleUrlAlreadyInText(base, url)) {
    if (base.length <= maxLen) return { text: base, truncated: false };
    return { text: base.slice(0, Math.max(0, maxLen - 1)) + "…", truncated: true };
  }

  const suffix = `\n\n${url}`;
  if (base.length + suffix.length <= maxLen) {
    return { text: base + suffix, truncated: false };
  }

  const budget = maxLen - suffix.length - 1;
  if (budget < 8) {
    return { text: url.slice(0, maxLen), truncated: true };
  }

  return { text: base.slice(0, budget - 1) + "…" + suffix, truncated: true };
}
