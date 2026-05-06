/** Live ingest posts are only from X and Bluesky. */
export type SocialPlatform = "x" | "bluesky";

export type SocialFeedTab = "following" | "mentions" | "lists";

export type SocialPost = {
  id: string;
  platform: SocialPlatform;
  authorName: string;
  authorHandle: string;
  /** Profile image from the live API when available. */
  authorAvatarUrl?: string;
  text: string;
  url: string;
  postedAt: string;
  /** Attached images from the post (X media, Bluesky embeds). */
  mediaUrls?: string[];
  /** When set, post body is the original; this is who boosted/reposted (X retweet, Bluesky repost). */
  repostedBy?: { displayName: string; handle: string };
  /** X API `conversation_id`: same for all posts in a thread (used to group in the feed). */
  conversationId?: string;
  /** Live API metrics when available (X `public_metrics`, Bluesky post counts). */
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  /** Impressions (X) — may be omitted depending on API tier. */
  viewCount?: number;
  /** Bluesky record CID for in-app like/repost/reply (from feed when available). */
  bskyRecordCid?: string;
};

export type SourceMeta = {
  x: { configured: boolean; detail?: string };
  bluesky: { configured: boolean; detail?: string };
};

export type AggregatedFeed = {
  posts: SocialPost[];
  sourceMeta: SourceMeta;
  /** ISO timestamp when this aggregation finished (server clock). */
  syncedAt: string;
  /** Display handles and resolved profile names/avatars when APIs succeed. */
  accounts: {
    xDisplay?: string;
    /** Display name from X API (`users/by/username`) for the configured community handle. */
    xName?: string;
    xAvatarUrl?: string;
    blueskyDisplay?: string;
    blueskyName?: string;
    blueskyAvatarUrl?: string;
  };
};
