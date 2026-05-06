import type { AggregatedFeed, SocialFeedTab, SocialPost, SourceMeta } from "./types";
import { fetchSocialFeed, type SocialFeedWorkspaceConfig } from "./aggregate";
import { groupPostsForFeedDisplay } from "./group-feed-rows";

export type SocialTabMetrics = {
  postCount: number;
  xCount: number;
  blueskyCount: number;
  /** Rows after grouping adjacent thread posts (matches Live listening UI). */
  displayRowCount: number;
  /** Number of grouped conversation threads in this batch. */
  threadGroupCount: number;
};

export type SocialSignalsDashboardSnapshot = {
  syncedAt: string;
  accounts: AggregatedFeed["accounts"];
  sourceMeta: SourceMeta;
  tabs: Record<SocialFeedTab, SocialTabMetrics>;
  timeline: {
    day: string;
    shortLabel: string;
    lists: number;
    mentions: number;
    following: number;
    x: number;
    bluesky: number;
    total: number;
  }[];
};

function metricsFromPosts(posts: SocialPost[]): SocialTabMetrics {
  const xCount = posts.filter((p) => p.platform === "x").length;
  const blueskyCount = posts.filter((p) => p.platform === "bluesky").length;
  const rows = groupPostsForFeedDisplay(posts);
  let threadGroupCount = 0;
  for (const r of rows) {
    if (r.kind === "thread") threadGroupCount += 1;
  }
  return {
    postCount: posts.length,
    xCount,
    blueskyCount,
    displayRowCount: rows.length,
    threadGroupCount,
  };
}

function toUtcDay(postedAt: string): string {
  const d = new Date(postedAt);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toISOString().slice(0, 10);
}

function dayShortLabel(day: string): string {
  if (day === "unknown") return "Unknown";
  const d = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Fetches all three Social Signals tabs in parallel for dashboard KPIs (same ingest as Live listening). */
export async function fetchSocialSignalsDashboardSnapshot(
  workspaceCfg?: SocialFeedWorkspaceConfig | null,
): Promise<SocialSignalsDashboardSnapshot> {
  const tabOrder: SocialFeedTab[] = ["lists", "mentions", "following"];
  const results = await Promise.all(tabOrder.map((t) => fetchSocialFeed(t, workspaceCfg)));

  const syncedAt = results.reduce(
    (latest, r) => (r.syncedAt > latest ? r.syncedAt : latest),
    results[0]!.syncedAt,
  );

  const accounts = results[0]!.accounts;

  const sourceMeta: SourceMeta = {
    x: {
      configured: results.some((r) => r.sourceMeta.x.configured),
      detail:
        results.map((r) => r.sourceMeta.x.detail).find((d) => typeof d === "string" && d.length > 0) ??
        undefined,
    },
    bluesky: {
      configured: results.some((r) => r.sourceMeta.bluesky.configured),
      detail:
        results
          .map((r) => r.sourceMeta.bluesky.detail)
          .find((d) => typeof d === "string" && d.length > 0) ?? undefined,
    },
  };

  const tabs = {
    lists: metricsFromPosts(results[0]!.posts),
    mentions: metricsFromPosts(results[1]!.posts),
    following: metricsFromPosts(results[2]!.posts),
  } satisfies Record<SocialFeedTab, SocialTabMetrics>;

  const timelineMap = new Map<
    string,
    {
      day: string;
      shortLabel: string;
      lists: number;
      mentions: number;
      following: number;
      x: number;
      bluesky: number;
      total: number;
    }
  >();

  for (const [idx, tab] of tabOrder.entries()) {
    const posts = results[idx]!.posts;
    for (const post of posts) {
      const day = toUtcDay(post.postedAt);
      const row = timelineMap.get(day) ?? {
        day,
        shortLabel: dayShortLabel(day),
        lists: 0,
        mentions: 0,
        following: 0,
        x: 0,
        bluesky: 0,
        total: 0,
      };
      row[tab] += 1;
      row[post.platform] += 1;
      row.total += 1;
      timelineMap.set(day, row);
    }
  }

  const timeline = [...timelineMap.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  return { syncedAt, accounts, sourceMeta, tabs, timeline };
}
