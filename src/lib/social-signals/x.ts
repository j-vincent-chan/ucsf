import type { SocialPost } from "./types";

type XResult = { posts: SocialPost[]; detail?: string };

const BASE = "https://api.twitter.com/2";

function authHeaders(bearer: string): HeadersInit {
  return {
    Authorization: `Bearer ${bearer}`,
    "User-Agent": "CommunitySignal/1.0",
  };
}

function parseTwitterTime(iso: string | undefined): string {
  if (!iso) return new Date().toISOString();
  const d = Date.parse(iso);
  return Number.isFinite(d) ? new Date(d).toISOString() : new Date().toISOString();
}

/**
 * “Following” on X: watch a List the community curates (Bearer has access to the list).
 * Create a list in X, add accounts, put the list ID in X_LIST_ID.
 */
export async function fetchXListTimeline(
  bearer: string,
  listId: string,
): Promise<XResult> {
  const params = new URLSearchParams({
    max_results: "30",
    "tweet.fields": "created_at,author_id",
    expansions: "author_id",
    "user.fields": "name,username",
  });
  const res = await fetch(`${BASE}/lists/${encodeURIComponent(listId)}/tweets?${params}`, {
    headers: authHeaders(bearer),
  });
  const raw = (await res.json().catch(() => ({}))) as {
    data?: { id: string; text?: string; created_at?: string; author_id?: string }[];
    includes?: { users?: { id: string; name?: string; username?: string }[] };
    errors?: { detail?: string }[];
  };
  if (!res.ok) {
    const msg = raw.errors?.[0]?.detail ?? res.statusText;
    return { posts: [], detail: `X list timeline: ${msg}` };
  }
  const users = new Map((raw.includes?.users ?? []).map((u) => [u.id, u]));
  const posts: SocialPost[] = (raw.data ?? []).map((t) => {
    const u = t.author_id ? users.get(t.author_id) : undefined;
    const handle = u?.username ?? "unknown";
    return {
      id: `x:${t.id}`,
      platform: "x" as const,
      authorName: u?.name ?? handle,
      authorHandle: `@${handle}`,
      text: t.text ?? "",
      url: `https://twitter.com/${handle}/status/${t.id}`,
      postedAt: parseTwitterTime(t.created_at),
    };
  });
  return { posts };
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
    "tweet.fields": "created_at,author_id",
    expansions: "author_id",
    "user.fields": "name,username",
  });
  const res = await fetch(`${BASE}/tweets/search/recent?${params}`, {
    headers: authHeaders(bearer),
  });
  const raw = (await res.json().catch(() => ({}))) as {
    data?: { id: string; text?: string; created_at?: string; author_id?: string }[];
    includes?: { users?: { id: string; name?: string; username?: string }[] };
    errors?: { detail?: string }[];
    title?: string;
  };
  if (!res.ok) {
    const msg = raw.errors?.[0]?.detail ?? raw.title ?? res.statusText;
    return { posts: [], detail: `X search: ${msg}` };
  }
  const users = new Map((raw.includes?.users ?? []).map((u) => [u.id, u]));
  const posts: SocialPost[] = (raw.data ?? []).map((t) => {
    const u = t.author_id ? users.get(t.author_id) : undefined;
    const uname = u?.username ?? "unknown";
    return {
      id: `x:${t.id}`,
      platform: "x" as const,
      authorName: u?.name ?? uname,
      authorHandle: `@${uname}`,
      text: t.text ?? "",
      url: `https://twitter.com/${uname}/status/${t.id}`,
      postedAt: parseTwitterTime(t.created_at),
    };
  });
  return { posts };
}
