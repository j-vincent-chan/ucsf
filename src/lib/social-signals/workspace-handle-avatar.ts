/**
 * Pick which connected-account avatar to show when X and Bluesky can differ.
 * When both platforms are selected, prefer X. Bluesky-only prefers Bluesky, with X as fallback.
 */
export function workspaceHandleAvatarUrl(
  postToX: boolean,
  postToBluesky: boolean,
  xAvatarUrl?: string | null,
  blueskyAvatarUrl?: string | null,
): string | undefined {
  const x = xAvatarUrl?.trim() || undefined;
  const b = blueskyAvatarUrl?.trim() || undefined;
  if (!postToX && !postToBluesky) {
    return x ?? b;
  }
  if (postToX && postToBluesky) {
    return x ?? b;
  }
  if (postToX) {
    return x ?? b;
  }
  return b ?? x;
}
