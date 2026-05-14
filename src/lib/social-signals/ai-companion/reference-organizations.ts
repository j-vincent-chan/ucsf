import type { SocialPost } from "@/lib/social-signals/types";
import { normalizeBlueskyHandle, normalizeXUsername } from "./investigator-directory";
import { REFERENCE_ORG_BY_X_HANDLE, type ReferenceOrganizationSeed } from "./reference-organizations-data";

export type { ReferenceOrganizationSeed };

/** Match post author to a seeded reference organization (X-centric list; Bluesky rarely matches). */
export function authorMatchesReferenceOrganization(post: SocialPost): ReferenceOrganizationSeed | null {
  const h = post.platform === "x" ? normalizeXUsername(post.authorHandle) : normalizeBlueskyHandle(post.authorHandle);
  if (!h) return null;
  return REFERENCE_ORG_BY_X_HANDLE.get(h.toLowerCase()) ?? null;
}

export function isKnownReferenceOrganizationHandle(handle: string): boolean {
  const h = normalizeXUsername(handle);
  return h.length > 0 && REFERENCE_ORG_BY_X_HANDLE.has(h.toLowerCase());
}
