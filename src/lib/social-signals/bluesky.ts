import type { SocialPost } from "./types";

type BskyResult = { posts: SocialPost[]; detail?: string };

export type BlueskyProfileSummary = {
  handle: string;
  displayName?: string;
  avatarUrl?: string;
};

function collectBskyImageUrls(embed: unknown): string[] {
  if (embed === null || embed === undefined) return [];
  if (typeof embed !== "object" || Array.isArray(embed)) return [];
  const o = embed as Record<string, unknown>;
  if (o.$type === "app.bsky.embed.images#view" && Array.isArray(o.images)) {
    return (o.images as { fullsize?: string; thumb?: string }[])
      .map((im) => im.fullsize ?? im.thumb)
      .filter((u): u is string => typeof u === "string" && u.length > 0);
  }
  if (o.$type === "app.bsky.embed.recordWithMedia#view" && o.media && typeof o.media === "object") {
    return collectBskyImageUrls(o.media);
  }
  return [];
}

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

/** Identity for Social Signals workspace branding (display name + avatar). */
export async function fetchBlueskyProfileSummary(
  identifier: string,
  appPassword: string,
): Promise<BlueskyProfileSummary | null> {
  const session = await createSession(identifier, appPassword);
  if (!session?.accessJwt) return null;
  const params = new URLSearchParams({ actor: identifier.trim() });
  const res = await fetch(`${HOST}/xrpc/app.bsky.actor.getProfile?${params}`, {
    headers: { Authorization: `Bearer ${session.accessJwt}` },
  });
  const raw = (await res.json().catch(() => ({}))) as {
    handle?: string;
    displayName?: string;
    avatar?: string;
  };
  if (!res.ok || !raw.handle) return null;
  return {
    handle: raw.handle,
    displayName: raw.displayName,
    avatarUrl: raw.avatar,
  };
}

function parseBskyTime(iso: string | undefined): string {
  if (!iso) return new Date().toISOString();
  const d = Date.parse(iso);
  return Number.isFinite(d) ? new Date(d).toISOString() : new Date().toISOString();
}

function mapBskyFeedViewPost(item: {
  reason?: { $type?: string; by?: { displayName?: string; handle: string; avatar?: string } };
  post: {
    uri: string;
    indexedAt?: string;
    embed?: unknown;
    author: { displayName?: string; handle: string; avatar?: string };
    record?: { text?: string; createdAt?: string };
  };
}): SocialPost {
  const post = item.post;
  const handle = post.author.handle;
  const rkey = post.uri.split("/").pop() ?? "";
  const mediaUrls = collectBskyImageUrls(post.embed);
  const isRepost =
    item.reason?.$type === "app.bsky.feed.defs#reasonRepost" && Boolean(item.reason.by?.handle);
  const by = item.reason?.by;
  return {
    id: `bsky:${post.uri}`,
    platform: "bluesky",
    authorName: post.author.displayName ?? handle,
    authorHandle: `@${handle}`,
    authorAvatarUrl: post.author.avatar,
    text: post.record?.text ?? "",
    url: `https://bsky.app/profile/${handle}/post/${rkey}`,
    postedAt: parseBskyTime(post.indexedAt ?? post.record?.createdAt),
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
    repostedBy:
      isRepost && by
        ? {
            displayName: by.displayName ?? by.handle,
            handle: `@${by.handle}`,
          }
        : undefined,
  };
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
    feed?: Array<Parameters<typeof mapBskyFeedViewPost>[0]>;
    message?: string;
  };
  if (!res.ok) {
    return { posts: [], detail: `Bluesky timeline: ${raw.message ?? res.statusText}` };
  }
  const posts: SocialPost[] = (raw.feed ?? []).map((item) => mapBskyFeedViewPost(item));
  return { posts };
}

/** Posts from a Bluesky list (`at://…/app.bsky.graph.list/…`). */
export async function fetchBlueskyListFeed(
  identifier: string,
  appPassword: string,
  listAtUri: string,
): Promise<BskyResult> {
  const session = await createSession(identifier, appPassword);
  if (!session?.accessJwt) {
    return { posts: [], detail: "Bluesky: invalid credentials or session failed" };
  }
  const list = listAtUri.trim();
  if (!list.startsWith("at://") || !list.includes("/app.bsky.graph.list/")) {
    return { posts: [], detail: "Bluesky list: expected an at://…/app.bsky.graph.list/… URI" };
  }
  const params = new URLSearchParams({ list, limit: "40" });
  const res = await fetch(`${HOST}/xrpc/app.bsky.feed.getListFeed?${params}`, {
    headers: { Authorization: `Bearer ${session.accessJwt}` },
  });
  const raw = (await res.json().catch(() => ({}))) as {
    feed?: Array<Parameters<typeof mapBskyFeedViewPost>[0]>;
    message?: string;
  };
  if (!res.ok) {
    return { posts: [], detail: `Bluesky list feed: ${raw.message ?? res.statusText}` };
  }
  const posts: SocialPost[] = (raw.feed ?? []).map((item) => mapBskyFeedViewPost(item));
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
      embed?: unknown;
      author: { displayName?: string; handle: string; avatar?: string };
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
    const mediaUrls = collectBskyImageUrls(p.embed);
    return {
      id: `bsky:${p.uri}`,
      platform: "bluesky",
      authorName: p.author.displayName ?? handle,
      authorHandle: `@${handle}`,
      authorAvatarUrl: p.author.avatar,
      text: p.record?.text ?? "",
      url: `https://bsky.app/profile/${handle}/post/${rkey}`,
      postedAt: parseBskyTime(p.indexedAt ?? p.record?.createdAt),
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
    };
  });
  return { posts };
}
