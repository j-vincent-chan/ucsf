import type { SocialPost } from "./types";

export type FeedDisplayRow =
  | { kind: "single"; post: SocialPost }
  | { kind: "thread"; conversationId: string; posts: SocialPost[] };

/**
 * Group X posts that share the same conversation_id into one row (2+ posts).
 * Posts are ordered oldest → newest for reading order; the row is sorted in the
 * feed by the newest tweet time in that thread (matches “latest activity” ordering).
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
    const ordered = [...group].sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt));
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
