import type { SocialPost } from "./types";

type XResult = { posts: SocialPost[]; detail?: string };

const BASE = "https://api.twitter.com/2";

type XUser = { id: string; name?: string; username?: string; profile_image_url?: string };
type XMedia = {
  media_key?: string;
  type?: string;
  url?: string;
  preview_image_url?: string;
};

function authHeaders(bearer: string): HeadersInit {
  return {
    Authorization: `Bearer ${bearer}`,
    "User-Agent": "CommunitySignal/1.0",
  };
}

/** Public profile for the configured community X handle (display name + avatar). */
export async function fetchXUserByUsername(
  bearer: string,
  username: string,
): Promise<{ name: string; username: string; profileImageUrl: string | null } | null> {
  const handle = username.replace(/^@+/, "").trim();
  if (!handle) return null;
  const params = new URLSearchParams({
    "user.fields": "name,username,profile_image_url",
  });
  const res = await fetch(`${BASE}/users/by/username/${encodeURIComponent(handle)}?${params}`, {
    headers: authHeaders(bearer),
  });
  const raw = (await res.json().catch(() => ({}))) as {
    data?: XUser;
    errors?: { detail?: string }[];
  };
  if (!res.ok || !raw.data?.username) {
    return null;
  }
  const u = raw.data;
  const screenName = u.username as string;
  return {
    name: (u.name ?? screenName) as string,
    username: screenName,
    profileImageUrl: u.profile_image_url ?? null,
  };
}

function mediaUrlsFromTweet(
  mediaKeys: string[] | undefined,
  mediaList: XMedia[] | undefined,
): string[] {
  if (!mediaKeys?.length || !mediaList?.length) return [];
  const byKey = new Map(mediaList.map((m) => [m.media_key ?? "", m]));
  const out: string[] = [];
  for (const key of mediaKeys) {
    const m = byKey.get(key);
    if (!m) continue;
    if (m.type === "photo" && m.url) out.push(m.url);
    else if (m.preview_image_url) out.push(m.preview_image_url);
    else if (m.url) out.push(m.url);
  }
  return out;
}

function parseTwitterTime(iso: string | undefined): string {
  if (!iso) return new Date().toISOString();
  const d = Date.parse(iso);
  return Number.isFinite(d) ? new Date(d).toISOString() : new Date().toISOString();
}

type XTweetRef = { type?: string; id?: string };
type XTweetObj = {
  id: string;
  text?: string;
  created_at?: string;
  author_id?: string;
  conversation_id?: string;
  attachments?: { media_keys?: string[] };
  referenced_tweets?: XTweetRef[];
};

function mapXTweetsResponse(raw: {
  data?: XTweetObj[];
  includes?: { users?: XUser[]; media?: XMedia[]; tweets?: XTweetObj[] };
  errors?: { detail?: string }[];
}): SocialPost[] {
  const users = new Map((raw.includes?.users ?? []).map((u) => [u.id, u]));
  const tweetIncludes = new Map((raw.includes?.tweets ?? []).map((t) => [t.id, t]));
  const mediaIncludes = raw.includes?.media ?? [];

  return (raw.data ?? []).map((t) => {
    const retweetRef = t.referenced_tweets?.find((r) => r.type === "retweeted" && r.id);
    if (retweetRef?.id) {
      const orig = tweetIncludes.get(retweetRef.id);
      if (orig) {
        const origAuthor = orig.author_id ? users.get(orig.author_id) : undefined;
        const rtAuthor = t.author_id ? users.get(t.author_id) : undefined;
        const handle = origAuthor?.username ?? "unknown";
        const mediaUrls = mediaUrlsFromTweet(orig.attachments?.media_keys, mediaIncludes);
        const conv = orig.conversation_id ?? t.conversation_id;
        return {
          id: `x:${t.id}`,
          platform: "x" as const,
          authorName: origAuthor?.name ?? handle,
          authorHandle: `@${handle}`,
          authorAvatarUrl: origAuthor?.profile_image_url,
          text: orig.text ?? "",
          url: `https://twitter.com/${handle}/status/${orig.id}`,
          postedAt: parseTwitterTime(orig.created_at),
          mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
          conversationId: conv,
          repostedBy: rtAuthor
            ? {
                displayName: rtAuthor.name ?? rtAuthor.username ?? "Unknown",
                handle: `@${rtAuthor.username ?? "unknown"}`,
              }
            : undefined,
        };
      }
    }

    const u = t.author_id ? users.get(t.author_id) : undefined;
    const handle = u?.username ?? "unknown";
    const mediaUrls = mediaUrlsFromTweet(t.attachments?.media_keys, mediaIncludes);
    return {
      id: `x:${t.id}`,
      platform: "x" as const,
      authorName: u?.name ?? handle,
      authorHandle: `@${handle}`,
      authorAvatarUrl: u?.profile_image_url,
      text: t.text ?? "",
      url: `https://twitter.com/${handle}/status/${t.id}`,
      postedAt: parseTwitterTime(t.created_at),
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      conversationId: t.conversation_id,
    };
  });
}

const X_TIMELINE_PARAMS = new URLSearchParams({
  max_results: "30",
  "tweet.fields": "created_at,author_id,attachments,referenced_tweets,conversation_id",
  expansions:
    "author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id,referenced_tweets.id.attachments.media_keys",
  "user.fields": "name,username,profile_image_url",
  "media.fields": "url,preview_image_url,type,media_key",
});

/**
 * X list timeline: watch a List the community curates (Bearer has access to the list).
 * Create a list in X, add accounts, put the list ID in X_LIST_ID.
 */
export async function fetchXListTimeline(
  bearer: string,
  listId: string,
): Promise<XResult> {
  const res = await fetch(`${BASE}/lists/${encodeURIComponent(listId)}/tweets?${X_TIMELINE_PARAMS}`, {
    headers: authHeaders(bearer),
  });
  const raw = (await res.json().catch(() => ({}))) as Parameters<typeof mapXTweetsResponse>[0] & {
    errors?: { detail?: string }[];
  };
  if (!res.ok) {
    const msg = raw.errors?.[0]?.detail ?? res.statusText;
    return { posts: [], detail: `X list timeline: ${msg}` };
  }
  return { posts: mapXTweetsResponse(raw) };
}

/**
 * Recent posts mentioning the community handle (without @ in env).
 */
export async function fetchXMentionSearch(
  bearer: string,
  communityHandle: string,
): Promise<XResult> {
  const handle = communityHandle.replace(/^@+/, "").trim();
  if (!handle) return { posts: [], detail: "X mentions: set X_COMMUNITY_HANDLE" };
  const query = `@${handle}`;
  const params = new URLSearchParams({
    query,
    max_results: "30",
    "tweet.fields": "created_at,author_id,attachments,referenced_tweets,conversation_id",
    expansions:
      "author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id,referenced_tweets.id.attachments.media_keys",
    "user.fields": "name,username,profile_image_url",
    "media.fields": "url,preview_image_url,type,media_key",
  });
  const res = await fetch(`${BASE}/tweets/search/recent?${params}`, {
    headers: authHeaders(bearer),
  });
  const raw = (await res.json().catch(() => ({}))) as Parameters<typeof mapXTweetsResponse>[0] & {
    errors?: { detail?: string }[];
    title?: string;
  };
  if (!res.ok) {
    const msg = raw.errors?.[0]?.detail ?? raw.title ?? res.statusText;
    return { posts: [], detail: `X search: ${msg}` };
  }
  return { posts: mapXTweetsResponse(raw) };
}
