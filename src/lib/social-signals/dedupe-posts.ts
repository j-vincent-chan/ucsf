import type { SocialPost } from "./types";

/** Stable-first occurrence wins — keeps React list keys unique. */
export function dedupeSocialPostsById(posts: SocialPost[]): SocialPost[] {
  const seen = new Set<string>();
  const out: SocialPost[] = [];
  for (const p of posts) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}
