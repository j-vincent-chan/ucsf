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
type XTweetPublicMetrics = {
  reply_count?: number;
  retweet_count?: number;
  like_count?: number;
  quote_count?: number;
  impression_count?: number;
};

type XTweetObj = {
  id: string;
  text?: string;
  created_at?: string;
  author_id?: string;
  conversation_id?: string;
  attachments?: { media_keys?: string[] };
  referenced_tweets?: XTweetRef[];
  public_metrics?: XTweetPublicMetrics;
};

function metricsFromX(m: XTweetPublicMetrics | undefined): {
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  viewCount?: number;
} {
  if (!m) return {};
  return {
    replyCount: m.reply_count,
    repostCount: m.retweet_count,
    likeCount: m.like_count,
    viewCount: m.impression_count,
  };
}

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
          // Engage (repost/like/reply) must target the original tweet, not the retweet wrapper.
          id: `x:${orig.id}`,
          platform: "x" as const,
          authorName: origAuthor?.name ?? handle,
          authorHandle: `@${handle}`,
          authorAvatarUrl: origAuthor?.profile_image_url,
          text: orig.text ?? "",
          url: `https://twitter.com/${handle}/status/${orig.id}`,
          postedAt: parseTwitterTime(orig.created_at),
          mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
          conversationId: conv,
          ...metricsFromX(orig.public_metrics),
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
      ...metricsFromX(t.public_metrics),
    };
  });
}

const X_TIMELINE_PARAMS = new URLSearchParams({
  max_results: "100",
  "tweet.fields":
    "created_at,author_id,attachments,referenced_tweets,conversation_id,public_metrics",
  expansions:
    "author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id,referenced_tweets.id.attachments.media_keys",
  "user.fields": "name,username,profile_image_url",
  "media.fields": "url,preview_image_url,type,media_key",
});

/** GET /2/tweets — same fields as timelines (no `max_results`). */
const X_TWEET_LOOKUP_PARAMS = new URLSearchParams({
  "tweet.fields":
    "created_at,author_id,attachments,referenced_tweets,conversation_id,public_metrics",
  expansions:
    "author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id,referenced_tweets.id.attachments.media_keys",
  "user.fields": "name,username,profile_image_url",
  "media.fields": "url,preview_image_url,type,media_key",
});

/**
 * Fetch tweets by id (e.g. conversation roots missing from search/timeline results).
 * Up to 100 ids per request; larger batches are chunked.
 */
export async function fetchXTweetsByIds(bearer: string, ids: string[]): Promise<XResult> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return { posts: [] };
  const all: SocialPost[] = [];
  let detail: string | undefined;
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const params = new URLSearchParams(X_TWEET_LOOKUP_PARAMS);
    params.set("ids", chunk.join(","));
    const res = await fetch(`${BASE}/tweets?${params}`, {
      headers: authHeaders(bearer),
    });
    const raw = (await res.json().catch(() => ({}))) as Parameters<typeof mapXTweetsResponse>[0] & {
      errors?: { detail?: string }[];
    };
    if (!res.ok) {
      detail = raw.errors?.[0]?.detail ?? res.statusText;
      continue;
    }
    all.push(...mapXTweetsResponse(raw));
  }
  return { posts: all, detail };
}

/**
 * X list timeline: watch a List the community curates (Bearer has access to the list).
 * Create a list in X, add accounts, put the list ID in X_LIST_ID.
 */
const X_LIST_TIMELINE_MAX_PAGES = 4;

export async function fetchXListTimeline(
  bearer: string,
  listId: string,
): Promise<XResult> {
  const all: SocialPost[] = [];
  let paginationToken: string | undefined;
  let detail: string | undefined;

  for (let page = 0; page < X_LIST_TIMELINE_MAX_PAGES; page++) {
    const params = new URLSearchParams(X_TIMELINE_PARAMS);
    if (paginationToken) params.set("pagination_token", paginationToken);

    const res = await fetch(`${BASE}/lists/${encodeURIComponent(listId)}/tweets?${params}`, {
      headers: authHeaders(bearer),
    });
    const raw = (await res.json().catch(() => ({}))) as Parameters<typeof mapXTweetsResponse>[0] & {
      errors?: { detail?: string }[];
      meta?: { next_token?: string };
    };
    if (!res.ok) {
      const msg = raw.errors?.[0]?.detail ?? res.statusText;
      detail = `X list timeline: ${msg}`;
      break;
    }
    const batch = mapXTweetsResponse(raw);
    all.push(...batch);
    paginationToken = raw.meta?.next_token;
    if (!paginationToken || batch.length === 0) break;
  }

  return { posts: all, detail };
}

const X_MENTION_QUERY_MAX_LEN = 512;

/** Recent posts matching an X recent-search query (e.g. `@lab OR @program`). */
export async function fetchXMentionSearchQuery(bearer: string, query: string): Promise<XResult> {
  const q = query.trim();
  if (!q) return { posts: [], detail: "X mentions: empty search query" };
  const params = new URLSearchParams({
    query: q.slice(0, X_MENTION_QUERY_MAX_LEN),
    max_results: "100",
    "tweet.fields":
      "created_at,author_id,attachments,referenced_tweets,conversation_id,public_metrics",
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

/**
 * Recent posts mentioning the community handle (without @ in env).
 */
export async function fetchXMentionSearch(
  bearer: string,
  communityHandle: string,
): Promise<XResult> {
  const handle = communityHandle.replace(/^@+/, "").trim();
  if (!handle) return { posts: [], detail: "X mentions: set X_COMMUNITY_HANDLE" };
  return fetchXMentionSearchQuery(bearer, `@${handle}`);
}

function chunkXMentionHandles(handles: string[]): string[][] {
  const normalized = handles.map((h) => h.replace(/^@+/, "").trim()).filter(Boolean);
  if (normalized.length === 0) return [];

  const chunks: string[][] = [];
  let current: string[] = [];
  let queryLen = 0;

  for (const handle of normalized) {
    const token = `@${handle}`;
    const added = current.length === 0 ? token.length : token.length + 4; // ` OR `
    if (current.length > 0 && queryLen + added > X_MENTION_QUERY_MAX_LEN) {
      chunks.push(current);
      current = [handle];
      queryLen = token.length;
    } else {
      current.push(handle);
      queryLen += added;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Mentions of the program handle plus watchlist investigator X handles. */
export async function fetchXMentionSearchForHandles(
  bearer: string,
  handles: string[],
): Promise<XResult> {
  const chunks = chunkXMentionHandles(handles);
  if (chunks.length === 0) {
    return { posts: [], detail: "X mentions: no handles configured" };
  }

  const posts: SocialPost[] = [];
  let detail: string | undefined;

  for (const chunk of chunks) {
    const query = chunk.map((h) => `@${h}`).join(" OR ");
    const r = await fetchXMentionSearchQuery(bearer, query);
    posts.push(...r.posts);
    if (r.detail && !detail) detail = r.detail;
  }

  return { posts, detail };
}
