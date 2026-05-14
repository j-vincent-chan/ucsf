/**
 * When the same draft is posted to X, replace Bluesky @handles with X handles
 * where both are stored on `tracked_entities`.
 */

export type BlueskyXHandlePair = { bluesky_handle: string; x_handle: string };
export type BlueskyXHandleRow = { bluesky_handle: string | null; x_handle: string | null };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip leading @ for comparison / replacement base. */
export function normalizeSocialHandle(s: string): string {
  return s.replace(/^@+/, "").trim();
}

/**
 * Replace occurrences of `@bluesky_handle` in text with `@x_handle`.
 * Longer bluesky_handle strings first to avoid partial overlaps.
 */
export function substituteBlueskyHandlesForX(text: string, pairs: BlueskyXHandleRow[]): string {
  const usable = pairs
    .filter((p): p is BlueskyXHandlePair => Boolean(p.bluesky_handle && p.x_handle))
    .map((p) => ({
      bsky: normalizeSocialHandle(p.bluesky_handle),
      x: normalizeSocialHandle(p.x_handle),
    }))
    .filter((p) => p.bsky.length > 0 && p.x.length > 0);
  if (usable.length === 0) return text;

  usable.sort((a, b) => b.bsky.length - a.bsky.length);

  let out = text;
  for (const { bsky, x } of usable) {
    const re = new RegExp(`@${escapeRegex(bsky)}(?![\\w.-])`, "gi");
    out = out.replace(re, `@${x}`);
  }
  return out;
}
