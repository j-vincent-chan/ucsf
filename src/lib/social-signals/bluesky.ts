import { appendArticleUrlIfAbsent, articleUrlAlreadyInText } from "@/lib/social-article-url";
import { buildBlueskyMentionFacets } from "@/lib/bluesky-mention-facets";
import type { SocialPost } from "./types";
import { compressBufferForBlueskyEmbed } from "./bluesky-image-compress";
import { BLUESKY_CHAR_LIMIT } from "./workspace-types";

/** Bluesky `app.bsky.feed.post` record limits (graphemes + UTF-8 bytes). */
const BSKY_POST_MAX_BYTES = 3000;

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
    cid?: string;
    indexedAt?: string;
    embed?: unknown;
    author: { displayName?: string; handle: string; avatar?: string };
    record?: { text?: string; createdAt?: string };
    replyCount?: number;
    repostCount?: number;
    likeCount?: number;
    quoteCount?: number;
    viewer?: { repost?: string; like?: string };
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
    replyCount: post.replyCount,
    repostCount: post.repostCount,
    likeCount: post.likeCount,
    ...(post.cid ? { bskyRecordCid: post.cid } : {}),
    ...(typeof post.viewer?.repost === "string" && post.viewer.repost.startsWith("at://")
      ? { viewerReposted: true as const, bskyViewerRepostUri: post.viewer.repost }
      : {}),
    ...(typeof post.viewer?.like === "string" && post.viewer.like.startsWith("at://")
      ? { viewerLiked: true as const, bskyViewerLikeUri: post.viewer.like }
      : {}),
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
  const params = new URLSearchParams({ limit: "100" });
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
  const params = new URLSearchParams({ list, limit: "100" });
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
    limit: "100",
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
    const counts = p as {
      cid?: string;
      replyCount?: number;
      repostCount?: number;
      likeCount?: number;
      viewer?: { repost?: string; like?: string };
    };
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
      replyCount: counts.replyCount,
      repostCount: counts.repostCount,
      likeCount: counts.likeCount,
      ...(counts.cid ? { bskyRecordCid: counts.cid } : {}),
      ...(typeof counts.viewer?.repost === "string" && counts.viewer.repost.startsWith("at://")
        ? { viewerReposted: true as const, bskyViewerRepostUri: counts.viewer.repost }
        : {}),
      ...(typeof counts.viewer?.like === "string" && counts.viewer.like.startsWith("at://")
        ? { viewerLiked: true as const, bskyViewerLikeUri: counts.viewer.like }
        : {}),
    };
  });
  return { posts };
}

const BSKY_MENTION_SEARCH_GAP_MS = 350;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Mentions of the program Bluesky handle plus watchlist investigator handles. */
export async function fetchBlueskyMentionsForHandles(
  identifier: string,
  appPassword: string,
  mentionHandles: string[],
): Promise<BskyResult> {
  const handles = [
    ...new Set(mentionHandles.map((h) => h.replace(/^@+/, "").trim().toLowerCase()).filter(Boolean)),
  ];
  if (handles.length === 0) {
    return { posts: [], detail: "Bluesky mentions: no handles configured" };
  }

  const posts: SocialPost[] = [];
  let detail: string | undefined;

  for (let i = 0; i < handles.length; i++) {
    const r = await fetchBlueskyMentions(identifier, appPassword, handles[i]!);
    posts.push(...r.posts);
    if (r.detail && !detail) detail = r.detail;
    if (i + 1 < handles.length) await sleep(BSKY_MENTION_SEARCH_GAP_MS);
  }

  return { posts, detail };
}

async function resolveRepoDid(
  session: SessionRes & { accessJwt: string },
  identifier: string,
): Promise<string | null> {
  if (session.did?.startsWith("did:")) return session.did;
  const handle = (session.handle ?? identifier).replace(/^@+/, "").trim();
  if (!handle) return null;
  const res = await fetch(
    `${HOST}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
  );
  const raw = (await res.json().catch(() => ({}))) as { did?: string };
  return typeof raw.did === "string" ? raw.did : null;
}

type BskyBlob = {
  $type?: string;
  ref?: { $link?: string };
  mimeType?: string;
  size?: number;
};

function clipBskyExternalStr(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + "…";
}

/** Fit text to Bluesky post limits so createRecord validation succeeds. */
export function truncateForBlueskyPost(raw: string): { text: string; truncated: boolean } {
  const t = raw.trim();
  if (!t) return { text: t, truncated: false };

  const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
  const all = Array.from(seg.segment(t), (p) => p.segment);

  let truncated = false;
  const segments: string[] =
    all.length > BLUESKY_CHAR_LIMIT
      ? (() => {
          truncated = true;
          return [...all.slice(0, BLUESKY_CHAR_LIMIT - 1), "…"];
        })()
      : [...all];

  const byteLen = (s: string) => new TextEncoder().encode(s).length;

  let text = segments.join("");
  while (byteLen(text) > BSKY_POST_MAX_BYTES && segments.length > 0) {
    truncated = true;
    if (segments.at(-1) === "…") segments.pop();
    if (segments.length > 0) segments.pop();
    if (segments.length === 0) return { text: "…", truncated: true };
    segments.push("…");
    text = segments.join("");
  }

  return { text, truncated };
}

/**
 * Appends the article URL when missing, then truncates so Bluesky limits are met while keeping the
 * link when possible (image posts are not tappable links to the paper).
 */
export function truncateBlueskyPostWithOptionalArticleUrl(
  baseText: string,
  articleUrl: string | null | undefined,
): { text: string; truncated: boolean } {
  const url = articleUrl?.trim();
  if (!url) return truncateForBlueskyPost(baseText);

  const base = baseText.trim();
  if (articleUrlAlreadyInText(base, url)) return truncateForBlueskyPost(base);

  const suffix = `\n\n${url}`;
  const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
  const byteLen = (s: string) => new TextEncoder().encode(s).length;
  const gSegs = (s: string) => Array.from(seg.segment(s), (p) => p.segment);
  const gCount = (s: string) => gSegs(s).length;

  const suffixSegs = gSegs(suffix);
  if (suffixSegs.length > BLUESKY_CHAR_LIMIT) {
    return truncateForBlueskyPost(appendArticleUrlIfAbsent(base, url));
  }

  const maxBodyGraphemes = BLUESKY_CHAR_LIMIT - suffixSegs.length;
  const baseSegs = gSegs(base);
  let truncated = false;
  let bodySegs: string[] = baseSegs;

  if (bodySegs.length > maxBodyGraphemes) {
    truncated = true;
    bodySegs = [...baseSegs.slice(0, Math.max(0, maxBodyGraphemes - 1)), "…"];
  }

  const join = (segs: string[]) => segs.join("");
  let text = join(bodySegs) + suffix;

  while (
    (gCount(text) > BLUESKY_CHAR_LIMIT || byteLen(text) > BSKY_POST_MAX_BYTES) &&
    bodySegs.length > 0
  ) {
    truncated = true;
    if (bodySegs.at(-1) === "…") bodySegs.pop();
    if (bodySegs.length > 0) bodySegs.pop();
    if (bodySegs.length === 0) {
      return truncateForBlueskyPost(url);
    }
    bodySegs.push("…");
    text = join(bodySegs) + suffix;
  }

  return { text, truncated };
}

export type BlueskyStrongRef = { uri: string; cid: string };

export type BlueskyWorkspaceSession = {
  accessJwt: string;
  repo: string;
  /** Display handle (no @) for public URLs. */
  handleLabel: string;
};

/** App-password session for this workspace’s Bluesky account (Settings → Social publishing only). */
export async function getBlueskyWorkspaceSession(credentials: {
  identifier: string;
  appPassword: string;
}): Promise<BlueskyWorkspaceSession> {
  const identifier = credentials.identifier?.trim();
  const appPassword = credentials.appPassword?.trim();
  if (!identifier || !appPassword) {
    const err = new Error("Bluesky credentials not configured for this workspace");
    err.name = "BlueskyNotConfigured";
    throw err;
  }
  const session = await createSession(identifier, appPassword);
  if (!session?.accessJwt) {
    throw new Error("Bluesky session failed");
  }
  const repo =
    (await resolveRepoDid({ ...session, accessJwt: session.accessJwt }, identifier)) ??
    session.did ??
    null;
  if (!repo?.startsWith("did:")) {
    throw new Error("Could not resolve Bluesky DID for posting");
  }
  const handleLabel = (session.handle ?? identifier).replace(/^@+/, "").trim().split("/")[0] ?? "";
  return { accessJwt: session.accessJwt, repo, handleLabel };
}

async function bskyRepoCreateRecord(
  accessJwt: string,
  repo: string,
  collection: string,
  record: Record<string, unknown>,
): Promise<{ uri: string }> {
  const res = await fetch(`${HOST}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessJwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ repo, collection, record }),
  });
  const raw = (await res.json().catch(() => ({}))) as {
    uri?: string;
    message?: string;
    error?: string;
    primary?: { message?: string };
  };
  if (!res.ok || !raw.uri) {
    const detail =
      raw.message ??
      raw.primary?.message ??
      raw.error ??
      `Bluesky record failed (${res.status})`;
    throw new Error(detail);
  }
  return { uri: raw.uri };
}

function parseAtUriCollectionAndRkey(uri: string): { collection: string; rkey: string } | null {
  const u = uri.trim();
  if (!u.startsWith("at://")) return null;
  const path = u.slice("at://".length);
  const slash = path.indexOf("/");
  if (slash < 0) return null;
  const rest = path.slice(slash + 1);
  const lastSlash = rest.lastIndexOf("/");
  if (lastSlash < 0) return null;
  const collection = rest.slice(0, lastSlash);
  const rkey = rest.slice(lastSlash + 1);
  if (!collection || !rkey) return null;
  return { collection, rkey };
}

async function bskyRepoDeleteRecord(
  accessJwt: string,
  repo: string,
  collection: string,
  rkey: string,
): Promise<void> {
  const res = await fetch(`${HOST}/xrpc/com.atproto.repo.deleteRecord`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessJwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ repo, collection, rkey }),
  });
  const raw = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    throw new Error(raw.message ?? raw.error ?? `Bluesky delete failed (${res.status})`);
  }
}

const BSKY_LIST_REPOST_MAX_PAGES = 12;

async function blueskyFindRepostRkeyForSubject(
  accessJwt: string,
  repo: string,
  subjectPostUri: string,
): Promise<string | null> {
  let cursor: string | undefined;
  for (let page = 0; page < BSKY_LIST_REPOST_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      repo,
      collection: "app.bsky.feed.repost",
      limit: "100",
    });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`${HOST}/xrpc/com.atproto.repo.listRecords?${params}`, {
      headers: { Authorization: `Bearer ${accessJwt}` },
    });
    const raw = (await res.json().catch(() => ({}))) as {
      records?: Array<{ uri?: string; value?: { subject?: { uri?: string } } }>;
      cursor?: string;
      message?: string;
    };
    if (!res.ok) {
      throw new Error(raw.message ?? `Bluesky listRecords failed (${res.status})`);
    }
    for (const rec of raw.records ?? []) {
      const subj = rec.value?.subject?.uri;
      if (subj === subjectPostUri && typeof rec.uri === "string") {
        const parsed = parseAtUriCollectionAndRkey(rec.uri);
        if (parsed?.collection === "app.bsky.feed.repost") return parsed.rkey;
      }
    }
    cursor = raw.cursor;
    if (!cursor) break;
  }
  return null;
}

const BSKY_LIST_LIKE_MAX_PAGES = 12;

async function blueskyFindLikeRkeyForSubject(
  accessJwt: string,
  repo: string,
  subjectPostUri: string,
): Promise<string | null> {
  let cursor: string | undefined;
  for (let page = 0; page < BSKY_LIST_LIKE_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      repo,
      collection: "app.bsky.feed.like",
      limit: "100",
    });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`${HOST}/xrpc/com.atproto.repo.listRecords?${params}`, {
      headers: { Authorization: `Bearer ${accessJwt}` },
    });
    const raw = (await res.json().catch(() => ({}))) as {
      records?: Array<{ uri?: string; value?: { subject?: { uri?: string } } }>;
      cursor?: string;
      message?: string;
    };
    if (!res.ok) {
      throw new Error(raw.message ?? `Bluesky listRecords failed (${res.status})`);
    }
    for (const rec of raw.records ?? []) {
      const subj = rec.value?.subject?.uri;
      if (subj === subjectPostUri && typeof rec.uri === "string") {
        const parsed = parseAtUriCollectionAndRkey(rec.uri);
        if (parsed?.collection === "app.bsky.feed.like") return parsed.rkey;
      }
    }
    cursor = raw.cursor;
    if (!cursor) break;
  }
  return null;
}

/** Resolve CID for a post AT URI (uses feed cache when {@link hintCid} is set). */
export async function resolveBskyPostStrongRef(
  accessJwt: string,
  atUri: string,
  hintCid?: string | null,
): Promise<BlueskyStrongRef> {
  const uri = atUri.trim();
  const hint = hintCid?.trim();
  if (hint) return { uri, cid: hint };

  const params = new URLSearchParams();
  params.append("uris", uri);
  const res = await fetch(`${HOST}/xrpc/app.bsky.feed.getPosts?${params}`, {
    headers: { Authorization: `Bearer ${accessJwt}` },
  });
  const raw = (await res.json().catch(() => ({}))) as {
    posts?: Array<{ uri?: string; cid?: string }>;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(raw.message ?? `Bluesky getPosts failed (${res.status})`);
  }
  const p = raw.posts?.[0];
  if (!p) {
    throw new Error("Could not resolve Bluesky post CID — refresh the feed and try again.");
  }
  const cid = typeof p.cid === "string" ? p.cid : "";
  if (!cid) {
    throw new Error("Could not resolve Bluesky post CID — refresh the feed and try again.");
  }
  return { uri: p.uri ?? uri, cid };
}

/**
 * Like/repost/reply mutations must use the **current** record CID. Never trust feed/search
 * hints alone — they go stale and cause createRecord validation failures on like.
 */
export async function resolveBskyStrongRefForEngage(
  accessJwt: string,
  atUri: string,
  _hintCid?: string | null,
): Promise<BlueskyStrongRef> {
  return resolveBskyPostStrongRef(accessJwt, atUri, null);
}

function bskyReplyThreadRefsForTarget(
  target: BlueskyStrongRef,
  record: unknown,
): { root: BlueskyStrongRef; parent: BlueskyStrongRef } {
  const parent = target;
  if (!record || typeof record !== "object") {
    return { root: target, parent };
  }
  const r = record as Record<string, unknown>;
  const reply = r.reply;
  if (!reply || typeof reply !== "object") {
    return { root: target, parent };
  }
  const rep = reply as Record<string, unknown>;
  const root = rep.root as Record<string, unknown> | undefined;
  const rootUri = typeof root?.uri === "string" ? root.uri : "";
  const rootCid = typeof root?.cid === "string" ? root.cid : "";
  if (rootUri && rootCid) {
    return { root: { uri: rootUri, cid: rootCid }, parent };
  }
  return { root: target, parent };
}

async function fetchBskyPostRecordBundle(
  accessJwt: string,
  strong: BlueskyStrongRef,
): Promise<{ strong: BlueskyStrongRef; record: unknown }> {
  const params = new URLSearchParams();
  params.append("uris", strong.uri);
  const res = await fetch(`${HOST}/xrpc/app.bsky.feed.getPosts?${params}`, {
    headers: { Authorization: `Bearer ${accessJwt}` },
  });
  const raw = (await res.json().catch(() => ({}))) as {
    posts?: Array<{ uri?: string; cid?: string; record?: unknown }>;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(raw.message ?? `Bluesky getPosts failed (${res.status})`);
  }
  const p = raw.posts?.[0];
  const cid = typeof p?.cid === "string" ? p.cid : strong.cid;
  const uri = typeof p?.uri === "string" ? p.uri : strong.uri;
  return { strong: { uri, cid }, record: p?.record };
}

export async function blueskyEngageLike(
  accessJwt: string,
  repo: string,
  subject: BlueskyStrongRef,
): Promise<{ uri: string }> {
  return bskyRepoCreateRecord(accessJwt, repo, "app.bsky.feed.like", {
    $type: "app.bsky.feed.like",
    subject: { uri: subject.uri, cid: subject.cid },
    createdAt: new Date().toISOString(),
  });
}

export async function blueskyEngageRepost(
  accessJwt: string,
  repo: string,
  subject: BlueskyStrongRef,
): Promise<{ uri: string }> {
  return bskyRepoCreateRecord(accessJwt, repo, "app.bsky.feed.repost", {
    $type: "app.bsky.feed.repost",
    subject: { uri: subject.uri, cid: subject.cid },
    createdAt: new Date().toISOString(),
  });
}

/** Remove the workspace account’s repost of {@link subject}. */
export async function blueskyEngageUnrepost(
  accessJwt: string,
  repo: string,
  subject: BlueskyStrongRef,
  options?: { repostRecordUri?: string },
): Promise<void> {
  let rkey: string | null = null;
  const hint = options?.repostRecordUri?.trim();
  if (hint?.startsWith("at://")) {
    const parsed = parseAtUriCollectionAndRkey(hint);
    if (parsed?.collection === "app.bsky.feed.repost") rkey = parsed.rkey;
  }
  if (!rkey) {
    rkey = await blueskyFindRepostRkeyForSubject(accessJwt, repo, subject.uri);
  }
  if (!rkey) {
    throw new Error("Could not find a repost to remove — refresh the feed and try again.");
  }
  await bskyRepoDeleteRecord(accessJwt, repo, "app.bsky.feed.repost", rkey);
}

/** Remove the workspace account’s like of {@link subject}. */
export async function blueskyEngageUnlike(
  accessJwt: string,
  repo: string,
  subject: BlueskyStrongRef,
  options?: { likeRecordUri?: string },
): Promise<void> {
  let rkey: string | null = null;
  const hint = options?.likeRecordUri?.trim();
  if (hint?.startsWith("at://")) {
    const parsed = parseAtUriCollectionAndRkey(hint);
    if (parsed?.collection === "app.bsky.feed.like") rkey = parsed.rkey;
  }
  if (!rkey) {
    rkey = await blueskyFindLikeRkeyForSubject(accessJwt, repo, subject.uri);
  }
  if (!rkey) {
    throw new Error("Could not find a like to remove — refresh the feed and try again.");
  }
  await bskyRepoDeleteRecord(accessJwt, repo, "app.bsky.feed.like", rkey);
}

export async function blueskyEngageReply(
  accessJwt: string,
  repo: string,
  handleLabel: string,
  target: BlueskyStrongRef,
  text: string,
  options?: { image?: { buffer: Buffer; mime: string } },
): Promise<{ uri: string; url: string }> {
  const bundle = await fetchBskyPostRecordBundle(accessJwt, target);
  const { root, parent } = bskyReplyThreadRefsForTarget(bundle.strong, bundle.record);

  let embed: Record<string, unknown> | undefined;
  const img = options?.image;
  if (img && img.buffer.length > 0 && img.mime.startsWith("image/")) {
    try {
      const fitted = await compressBufferForBlueskyEmbed(img.buffer, img.mime);
      const blob = await uploadBlueskyImageBlob(accessJwt, fitted.buffer, fitted.mime);
      const imageBlob = {
        $type: "blob" as const,
        ref: blob.ref,
        mimeType: blob.mimeType ?? fitted.mime,
        size: blob.size ?? fitted.buffer.length,
      };
      embed = {
        $type: "app.bsky.embed.images",
        images: [{ alt: "", image: imageBlob }],
      };
    } catch {
      // Fall back to text-only reply if embed fails.
    }
  }

  const { text: forPostRaw } = truncateForBlueskyPost(text);
  const trimmed = forPostRaw.trim();
  if (!trimmed && !embed) throw new Error("Reply text is empty");
  /** ZWNJ survives `.trim()` but stays invisible in clients when paired with an image embed. */
  const forPost = trimmed ? forPostRaw : "\u200c";

  const record: Record<string, unknown> = {
    $type: "app.bsky.feed.post",
    text: forPost,
    createdAt: new Date().toISOString(),
    reply: {
      root: { uri: root.uri, cid: root.cid },
      parent: { uri: parent.uri, cid: parent.cid },
    },
  };
  if (embed) record.embed = embed;

  const created = await bskyRepoCreateRecord(accessJwt, repo, "app.bsky.feed.post", record);
  const rkey = created.uri.split("/").pop() ?? "";
  const handle = handleLabel.replace(/^@+/, "").trim().split("/")[0] ?? "";
  const url =
    handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : created.uri.replace("at://", "https://bsky.app/profile/");
  return { uri: created.uri, url };
}

function isBlueskyDuplicateRecordError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("duplicate") ||
    m.includes("already exists") ||
    m.includes("recordexists") ||
    m.includes("already been") ||
    m.includes("already liked") ||
    m.includes("already reposted")
  );
}

/** Like; `{ applied: false }` when the account already liked this post. */
export async function blueskyEngageLikeAllowDuplicate(
  accessJwt: string,
  repo: string,
  subject: BlueskyStrongRef,
): Promise<{ applied: boolean; likeRecordUri?: string }> {
  try {
    const { uri } = await blueskyEngageLike(accessJwt, repo, subject);
    return { applied: true, likeRecordUri: uri };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (isBlueskyDuplicateRecordError(msg)) return { applied: false };
    throw e;
  }
}

/** Repost; returns `{ applied: false }` if already reposted. */
export async function blueskyEngageRepostAllowDuplicate(
  accessJwt: string,
  repo: string,
  subject: BlueskyStrongRef,
): Promise<{ applied: boolean; repostRecordUri?: string }> {
  try {
    const { uri } = await blueskyEngageRepost(accessJwt, repo, subject);
    return { applied: true, repostRecordUri: uri };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (isBlueskyDuplicateRecordError(msg)) return { applied: false };
    throw e;
  }
}

async function uploadBlueskyImageBlob(
  accessJwt: string,
  buffer: Buffer,
  mime: string,
): Promise<BskyBlob> {
  const res = await fetch(`${HOST}/xrpc/com.atproto.repo.uploadBlob`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessJwt}`,
      "Content-Type": mime,
    },
    body: new Uint8Array(buffer),
  });
  const raw = (await res.json().catch(() => ({}))) as {
    blob?: BskyBlob & { ref?: { $link?: string } };
    message?: string;
    error?: string;
  };
  if (!res.ok || !raw.blob?.ref?.$link) {
    throw new Error(raw.message ?? raw.error ?? `Bluesky upload failed (${res.status})`);
  }
  return raw.blob;
}

/** Publish a text post as this workspace’s Bluesky account (Settings credentials required). */
export async function publishBlueskyText(
  text: string,
  options: {
    image?: { buffer: Buffer; mime: string };
    /** External link card (mutually exclusive with image in practice). */
    linkPreview?: { uri: string; title: string; description: string };
    /** With {@link image}: append this URL to the caption when missing so readers can open the article. */
    articleUrl?: string;
    blueskyCredentials: { identifier: string; appPassword: string };
  },
): Promise<{ uri: string; url: string; truncated?: boolean }> {
  const truncatedPack =
    options.articleUrl?.trim() && !options.linkPreview
      ? truncateBlueskyPostWithOptionalArticleUrl(text, options.articleUrl)
      : truncateForBlueskyPost(text);
  const { text: forPost, truncated } = truncatedPack;
  if (!forPost) throw new Error("Empty text");

  const { accessJwt, repo, handleLabel } = await getBlueskyWorkspaceSession(options.blueskyCredentials);

  let embed: Record<string, unknown> | undefined;
  const lp = options?.linkPreview;
  if (lp?.uri) {
    embed = {
      $type: "app.bsky.embed.external",
      external: {
        uri: lp.uri,
        title: clipBskyExternalStr(lp.title || "Link", 300),
        description: clipBskyExternalStr(lp.description, 300),
      },
    };
  } else {
    const img = options?.image;
    if (img && img.buffer.length > 0 && img.mime.startsWith("image/")) {
      try {
        const fitted = await compressBufferForBlueskyEmbed(img.buffer, img.mime);
        const blob = await uploadBlueskyImageBlob(accessJwt, fitted.buffer, fitted.mime);
        const imageBlob = {
          $type: "blob" as const,
          ref: blob.ref,
          mimeType: blob.mimeType ?? fitted.mime,
          size: blob.size ?? fitted.buffer.length,
        };
        embed = {
          $type: "app.bsky.embed.images",
          images: [{ alt: "", image: imageBlob }],
        };
      } catch {
        // Post text-only if upload/embed constraints fail.
      }
    }
  }

  const record: Record<string, unknown> = {
    $type: "app.bsky.feed.post",
    text: forPost,
    createdAt: new Date().toISOString(),
  };
  if (embed) record.embed = embed;

  const facets = await buildBlueskyMentionFacets(forPost);
  if (facets?.length) record.facets = facets;

  const created = await bskyRepoCreateRecord(accessJwt, repo, "app.bsky.feed.post", record);
  const uri = created.uri;
  const rkey = uri.split("/").pop() ?? "";
  const handle = handleLabel.replace(/^@+/, "").trim().split("/")[0] ?? "";
  const url =
    handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : uri.replace("at://", "https://bsky.app/profile/");

  return { uri, url, ...(truncated ? { truncated: true as const } : {}) };
}
