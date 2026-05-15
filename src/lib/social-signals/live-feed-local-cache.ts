import type { SocialFeedTab, SocialPost } from "@/lib/social-signals/types";

/** Rolling window for persisted Live listening posts (client-side). */
export const LIVE_FEED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Avoid exceeding localStorage quotas; newest posts win after date sort. */
export const LIVE_FEED_MAX_STORED = 4000;

/** v3: keys include workspace id so switching communities does not reuse another tenant's cache. */
const STORAGE_PREFIX = "cs.socialLiveFeed.v3";

function sanitizeWorkspaceKey(raw: string): string {
  const t = raw.trim();
  if (!t) return "none";
  return t.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
}

function storageKey(workspaceKey: string, tab: SocialFeedTab): string {
  return `${STORAGE_PREFIX}:${sanitizeWorkspaceKey(workspaceKey)}:${tab}`;
}

export function sortPostsByDateDesc(posts: SocialPost[]): SocialPost[] {
  return [...posts].sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
}

export function postsWithinRollingWindow(posts: SocialPost[], windowMs: number, nowMs: number): SocialPost[] {
  const cutoff = nowMs - windowMs;
  return posts.filter((p) => {
    const t = Date.parse(p.postedAt);
    return !Number.isNaN(t) && t >= cutoff;
  });
}

/** Later / fresher `postedAt` wins when ids collide. */
export function mergePostsPreferringNewer(fresh: SocialPost[], older: SocialPost[]): SocialPost[] {
  const map = new Map<string, SocialPost>();
  for (const p of older) map.set(p.id, p);
  for (const p of fresh) {
    const prev = map.get(p.id);
    if (!prev || Date.parse(p.postedAt) >= Date.parse(prev.postedAt)) map.set(p.id, p);
  }
  return sortPostsByDateDesc(Array.from(map.values()));
}

function trimToMaxPosts(posts: SocialPost[], max: number): SocialPost[] {
  if (posts.length <= max) return posts;
  return posts.slice(0, max);
}

function isPlainPost(x: unknown): x is SocialPost {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.platform !== "x" && o.platform !== "bluesky") return false;
  return (
    typeof o.id === "string" &&
    typeof o.postedAt === "string" &&
    typeof o.text === "string" &&
    typeof o.authorName === "string" &&
    typeof o.authorHandle === "string" &&
    typeof o.url === "string"
  );
}

export function loadCachedPostsForTab(workspaceKey: string, tab: SocialFeedTab): SocialPost[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(workspaceKey, tab));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const posts = parsed.filter(isPlainPost);
    return postsWithinRollingWindow(posts, LIVE_FEED_RETENTION_MS, Date.now());
  } catch {
    return [];
  }
}

export function persistTabPosts(workspaceKey: string, tab: SocialFeedTab, posts: SocialPost[]): void {
  if (typeof window === "undefined") return;
  let trimmed = trimToMaxPosts(
    sortPostsByDateDesc(postsWithinRollingWindow(posts, LIVE_FEED_RETENTION_MS, Date.now())),
    LIVE_FEED_MAX_STORED,
  );
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      localStorage.setItem(storageKey(workspaceKey, tab), JSON.stringify(trimmed));
      return;
    } catch {
      trimmed = trimmed.slice(0, Math.max(100, Math.floor(trimmed.length / 2)));
    }
  }
}

/**
 * Merge API posts with the cached rolling window for this tab, persist, return the combined list.
 */
export function finalizeTabPosts(workspaceKey: string, tab: SocialFeedTab, apiPosts: SocialPost[]): SocialPost[] {
  const cached = loadCachedPostsForTab(workspaceKey, tab);
  const merged = mergePostsPreferringNewer(apiPosts, cached);
  const windowed = postsWithinRollingWindow(merged, LIVE_FEED_RETENTION_MS, Date.now());
  const sorted = sortPostsByDateDesc(windowed);
  const trimmed = trimToMaxPosts(sorted, LIVE_FEED_MAX_STORED);
  persistTabPosts(workspaceKey, tab, trimmed);
  return trimmed;
}
