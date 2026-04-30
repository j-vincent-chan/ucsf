import type { SocialPost } from "./types";

type BskyResult = { posts: SocialPost[]; detail?: string };

type SessionRes = {
  accessJwt?: string;
  handle?: string;
  did?: string;
};

const HOST = "https://bsky.social";

async function createSession(identifier: string, appPassword: string): Promise<SessionRes | null> {
  const res = await fetch(`${HOST}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password: appPassword }),
  });
  const data = (await res.json().catch(() => ({}))) as SessionRes & { message?: string };
  if (!res.ok || !data.accessJwt) {
    return null;
  }
  return data;
}

function parseBskyTime(iso: string | undefined): string {
  if (!iso) return new Date().toISOString();
  const d = Date.parse(iso);
  return Number.isFinite(d) ? new Date(d).toISOString() : new Date().toISOString();
}

/** Home timeline for the Bluesky account (what that account follows). */
export async function fetchBlueskyFollowing(
  identifier: string,
  appPassword: string,
): Promise<BskyResult> {
  const session = await createSession(identifier, appPassword);
  if (!session?.accessJwt) {
    return { posts: [], detail: "Bluesky: invalid credentials or session failed" };
  }
  const params = new URLSearchParams({ limit: "40" });
  const res = await fetch(`${HOST}/xrpc/app.bsky.feed.getTimeline?${params}`, {
    headers: { Authorization: `Bearer ${session.accessJwt}` },
  });
  const raw = (await res.json().catch(() => ({}))) as {
    feed?: {
      post: {
        uri: string;
        indexedAt?: string;
        author: { displayName?: string; handle: string };
        record?: { text?: string; createdAt?: string };
      };
    }[];
    message?: string;
  };
  if (!res.ok) {
    return { posts: [], detail: `Bluesky timeline: ${raw.message ?? res.statusText}` };
  }
  const posts: SocialPost[] = (raw.feed ?? []).map(({ post }) => {
    const handle = post.author.handle;
    const rkey = post.uri.split("/").pop() ?? "";
    return {
      id: `bsky:${post.uri}`,
      platform: "bluesky",
      authorName: post.author.displayName ?? handle,
      authorHandle: `@${handle}`,
      text: post.record?.text ?? "",
      url: `https://bsky.app/profile/${handle}/post/${rkey}`,
      postedAt: parseBskyTime(post.indexedAt ?? post.record?.createdAt),
    };
  });
  return { posts };
}

/** Posts that mention the community Bluesky handle (same account as login by default). */
export async function fetchBlueskyMentions(
  identifier: string,
  appPassword: string,
  mentionHandle: string,
): Promise<BskyResult> {
  const session = await createSession(identifier, appPassword);
  if (!session?.accessJwt) {
    return { posts: [], detail: "Bluesky: invalid credentials or session failed" };
  }
  const clean = mentionHandle.replace(/^@+/, "").trim();
  if (!clean) {
    return { posts: [], detail: "Bluesky mentions: set BSKY_MENTION_HANDLE or use BSKY_IDENTIFIER" };
  }
  const params = new URLSearchParams({
    q: `mentions:${clean}`,
    limit: "40",
  });
  const res = await fetch(`${HOST}/xrpc/app.bsky.feed.searchPosts?${params}`, {
    headers: { Authorization: `Bearer ${session.accessJwt}` },
  });
  const raw = (await res.json().catch(() => ({}))) as {
    posts?: {
      uri: string;
      indexedAt?: string;
      author: { displayName?: string; handle: string };
      record?: { text?: string; createdAt?: string };
    }[];
    message?: string;
  };
  if (!res.ok) {
    return { posts: [], detail: `Bluesky search: ${raw.message ?? res.statusText}` };
  }
  const posts: SocialPost[] = (raw.posts ?? []).map((p) => {
    const handle = p.author.handle;
    const rkey = p.uri.split("/").pop() ?? "";
    return {
      id: `bsky:${p.uri}`,
      platform: "bluesky",
      authorName: p.author.displayName ?? handle,
      authorHandle: `@${handle}`,
      text: p.record?.text ?? "",
      url: `https://bsky.app/profile/${handle}/post/${rkey}`,
      postedAt: parseBskyTime(p.indexedAt ?? p.record?.createdAt),
    };
  });
  return { posts };
}
