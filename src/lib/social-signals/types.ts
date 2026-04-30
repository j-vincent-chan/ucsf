export type SocialPlatform = "x" | "bluesky" | "linkedin";

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
  linkedin: { configured: boolean; detail?: string };
};

export type AggregatedFeed = {
  posts: SocialPost[];
  sourceMeta: SourceMeta;
};
