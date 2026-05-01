/** Live ingest posts are only from X and Bluesky. */
export type SocialPlatform = "x" | "bluesky";

export type SocialFeedTab = "following" | "mentions";

export type SocialPost = {
  id: string;
  platform: SocialPlatform;
  authorName: string;
  authorHandle: string;
  text: string;
  url: string;
  postedAt: string;
};

export type SourceMeta = {
  x: { configured: boolean; detail?: string };
  bluesky: { configured: boolean; detail?: string };
  /** Optional future org integration; not a live feed source today. */
  linkedin: { configured: boolean; detail?: string; comingSoon?: boolean };
};

export type AggregatedFeed = {
  posts: SocialPost[];
  sourceMeta: SourceMeta;
  /** ISO timestamp when this aggregation finished (server clock). */
  syncedAt: string;
  /** Display handles from env when configured (safe for UI). */
  accounts: {
    xDisplay?: string;
    blueskyDisplay?: string;
  };
};
