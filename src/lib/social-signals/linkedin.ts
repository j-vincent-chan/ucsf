import type { SocialPost } from "./types";

/**
 * LinkedIn’s public APIs are oriented around organizations and member UGC, not a generic
 * “home feed” like the consumer app. We keep env hooks for a future integration (e.g.
 * organization share statistics, approved partners). Until then, return an empty list and
 * explain in `detail` when vars are present.
 */
export async function fetchLinkedInPlaceholder(): Promise<{
  posts: SocialPost[];
  detail?: string;
}> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN?.trim();
  const urn = process.env.LINKEDIN_ORGANIZATION_URN?.trim();
  if (token && urn) {
    return {
      posts: [],
      detail:
        "LinkedIn: feed aggregation is not wired yet. Use Marketing Developer Platform docs for posts by organization URN, or third-party tools; tokens are read for future use.",
    };
  }
  if (token || urn) {
    return {
      posts: [],
      detail: "LinkedIn: set both LINKEDIN_ACCESS_TOKEN and LINKEDIN_ORGANIZATION_URN for future use.",
    };
  }
  return { posts: [] };
}
