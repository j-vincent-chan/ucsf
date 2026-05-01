/** Platforms users can publish to from the workspace (LinkedIn excluded from this union). */
export type PublishPlatform = "x" | "bluesky";

export type PostStatus =
  | "draft"
  | "needs_image"
  | "needs_review"
  | "changes_requested"
  | "approved"
  | "scheduled"
  | "published";

export type SourceSignalType =
  | "paper"
  | "news"
  | "award"
  | "event"
  | "funding_opportunity"
  | "program_update";

export type Audience = "public" | "scientific" | "donor_facing" | "internal" | "trainee";

export type Tone = "professional" | "celebratory" | "plain_language" | "punchy" | "institutional";

export type CtaKind = "read_more" | "register" | "apply" | "congratulate" | "learn_more" | "share";

export type ReviewFlag =
  | "needs_pi_review"
  | "mentions_unpublished_data"
  | "needs_image_rights"
  | "needs_alt_text"
  | "needs_funder_acknowledgement"
  | "embargo_sensitive"
  | "needs_program_comms_review";

export type WorkspaceSocialPost = {
  id: string;
  platform: PublishPlatform;
  campaignId?: string;
  accountHandle: string;
  displayName?: string;
  sourceSignalType: SourceSignalType;
  sourceSignalTitle: string;
  sourceItemLabel?: string;
  status: PostStatus;
  text: string;
  imageUrl?: string | null;
  linkPreview?: { title: string; url: string; description: string };
  hashtags: string[];
  mentions: string[];
  altText?: string;
  altTextStatus?: "ok" | "missing" | "suggested";
  createdAt: string;
  scheduledAt?: string;
  publishedAt?: string;
  characterLimit: number;
  threadIndex?: number;
  threadCount?: number;
  reviewFlags?: ReviewFlag[];
  engagement?: { likes: number; reposts: number; replies: number };
};

export type ReviewComment = {
  id: string;
  author: string;
  initials: string;
  body: string;
  at: string;
};

export type ReviewQueueItem = {
  id: string;
  post: WorkspaceSocialPost;
  assignedReviewer?: string;
  reviewStatus: PostStatus;
  dueDate?: string;
  comments: ReviewComment[];
  version: number;
  flags: ReviewFlag[];
};

export type CalendarPostEvent = {
  id: string;
  platform: PublishPlatform;
  summary: string;
  status: PostStatus;
  scheduledAt: string;
  campaignId?: string;
  sourceSignalTitle: string;
};

export type Campaign = {
  id: string;
  name: string;
  goal: string;
  audience: Audience;
  platforms: PublishPlatform[];
  plannedPosts: number;
  status: "planning" | "active" | "paused" | "complete";
  impressionsDemo?: number;
  engagementRateDemo?: number;
  upcomingCount: number;
};

export type AssetKind =
  | "logo"
  | "pi_photo"
  | "illustration"
  | "boilerplate"
  | "hashtag_bank"
  | "cta_snippet"
  | "funder_ack"
  | "alt_text_snippet"
  | "image_prompt";

export type WorkspaceAsset = {
  id: string;
  name: string;
  kind: AssetKind;
  campaign?: string;
  usageNotes: string;
  previewHint?: string;
  body?: string;
};

export type Recommendation = {
  id: string;
  action: string;
  reason: string;
  platforms: PublishPlatform[];
  angle: string;
  reviewNeed: string;
  ctaLabel?: string;
};

export type AnalyticsSummary = {
  publishedPosts: number;
  impressions: number | null;
  likes: number | null;
  reposts: number | null;
  replies: number | null;
  linkClicks: number | null;
  engagementRate: number | null;
  followerGrowth: number | null;
  bestPostX?: string;
  bestPostBluesky?: string;
  suggestedNextAction?: string;
  topTopics: string[];
  topInvestigators: string[];
  bestContentType: string;
  bestPlatform: PublishPlatform;
  bestVisualStyle: string;
  bestAudienceFit: string;
  demoMetrics?: boolean;
};

export type DashboardCounts = {
  draftPosts: number;
  needsReview: number;
  scheduled: number;
  published: number;
  topPerformerLabel: string;
  topPerformerPlatform: PublishPlatform;
};

export type RecentActivityItem = {
  id: string;
  at: string;
  summary: string;
  platform?: PublishPlatform;
};

export type SocialWorkspaceSection =
  | "dashboard"
  | "feed"
  | "composer"
  | "review"
  | "calendar"
  | "campaigns"
  | "analytics"
  | "assets";

export const X_CHAR_LIMIT = 280;
export const BLUESKY_CHAR_LIMIT = 300;
