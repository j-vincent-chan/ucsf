import type { SocialPost } from "./types";

export type FeedDisplayRow =
  | { kind: "single"; post: SocialPost }
  | { kind: "thread"; conversationId: string; posts: SocialPost[] };

/**
 * `conversation_id` equals the root tweet id. Search/timeline often omits that tweet (e.g. root
 * doesn’t match a mentions query). When we still have 2+ posts in the thread, these ids should be
 * looked up via GET /2/tweets so {@link orderXThreadPosts} can place the root first.
 */
export function missingXThreadRootTweetIds(posts: SocialPost[]): string[] {
  const byConv = new Map<string, SocialPost[]>();
  for (const p of posts) {
    if (p.platform !== "x" || !p.conversationId) continue;
    const cur = byConv.get(p.conversationId) ?? [];
    cur.push(p);
    byConv.set(p.conversationId, cur);
  }
  const out: string[] = [];
  for (const [conversationId, group] of byConv) {
    if (group.length < 2) continue;
    const rootPostId = `x:${conversationId}`;
    if (!group.some((p) => p.id === rootPostId)) out.push(conversationId);
  }
  return [...new Set(out)];
}

/**
 * X thread order: `conversation_id` is the root tweet id. Root first, then replies by time.
 * Feed rows are still sorted by latest activity (newest tweet in the thread).
 */
function orderXThreadPosts(conversationId: string, group: SocialPost[]): SocialPost[] {
  const rootPostId = `x:${conversationId}`;
  const root = group.find((p) => p.id === rootPostId);
  const rest = group
    .filter((p) => p.id !== rootPostId)
    .sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt));
  if (root) return [root, ...rest];
  return [...group].sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt));
}

/**
 * Group X posts that share the same conversation_id into one row (2+ posts).
 * The thread root (conversation starter) is listed first; other tweets follow in time order.
 */
export function groupPostsForFeedDisplay(posts: SocialPost[]): FeedDisplayRow[] {
  const byConv = new Map<string, SocialPost[]>();
  for (const p of posts) {
    if (p.platform !== "x" || !p.conversationId) continue;
    const cur = byConv.get(p.conversationId) ?? [];
    cur.push(p);
    byConv.set(p.conversationId, cur);
  }

  const inThread = new Set<string>();
  const threads: FeedDisplayRow[] = [];
  for (const [conversationId, group] of byConv) {
    if (group.length < 2) continue;
    const ordered = orderXThreadPosts(conversationId, group);
    threads.push({ kind: "thread", conversationId, posts: ordered });
    for (const p of group) inThread.add(p.id);
  }

  const singles: FeedDisplayRow[] = [];
  for (const p of posts) {
    if (!inThread.has(p.id)) singles.push({ kind: "single", post: p });
  }

  const rows = [...threads, ...singles];
  rows.sort((a, b) => {
    const ta =
      a.kind === "thread"
        ? Math.max(...a.posts.map((x) => Date.parse(x.postedAt)))
        : Date.parse(a.post.postedAt);
    const tb =
      b.kind === "thread"
        ? Math.max(...b.posts.map((x) => Date.parse(x.postedAt)))
        : Date.parse(b.post.postedAt);
    return tb - ta;
  });
  return rows;
}
