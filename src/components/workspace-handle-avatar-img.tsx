"use client";

import { useMemo } from "react";
import { workspaceHandleAvatarUrl } from "@/lib/social-signals/workspace-handle-avatar";

export type WorkspaceAccountAvatars = {
  xAvatarUrl?: string | null;
  blueskyAvatarUrl?: string | null;
};

function IconUserSilhouette({ className }: { className?: string }) {
  return (
    <svg
      className={`text-[color:var(--muted-foreground)] ${className ?? ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" opacity="0.35" />
      <circle cx="12" cy="9" r="3" />
      <path strokeLinecap="round" d="M6.5 19.5c1.5-3 10-3 11.5 0" />
    </svg>
  );
}

/**
 * Connected workspace account avatar (X prioritized when both platforms apply).
 * @param preferXCommunityAvatar When true, always use X first then Bluesky (e.g. Composer).
 */
export function WorkspaceHandleAvatarImg({
  postToX,
  postToBluesky,
  accounts,
  size = "md",
  className = "",
  /** When true, render nothing if no image URL resolves (for optional digest badges). */
  hideWhenEmpty = false,
  /** Composer: show the community X avatar regardless of platform pills. */
  preferXCommunityAvatar = false,
}: {
  postToX: boolean;
  postToBluesky: boolean;
  accounts?: WorkspaceAccountAvatars | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  hideWhenEmpty?: boolean;
  preferXCommunityAvatar?: boolean;
}) {
  const src = useMemo(() => {
    if (preferXCommunityAvatar) {
      const x = accounts?.xAvatarUrl?.trim() || undefined;
      const b = accounts?.blueskyAvatarUrl?.trim() || undefined;
      return x ?? b;
    }
    return workspaceHandleAvatarUrl(
      postToX,
      postToBluesky,
      accounts?.xAvatarUrl,
      accounts?.blueskyAvatarUrl,
    );
  }, [
    preferXCommunityAvatar,
    postToX,
    postToBluesky,
    accounts?.xAvatarUrl,
    accounts?.blueskyAvatarUrl,
  ]);

  const dim = size === "lg" ? "h-10 w-10" : size === "sm" ? "h-7 w-7" : "h-9 w-9";

  if (!src) {
    if (hideWhenEmpty) return null;
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full border border-[color:var(--border)]/55 bg-[color:var(--muted)]/25 ${dim} ${className}`.trim()}
        aria-hidden
      >
        <IconUserSilhouette className={size === "lg" ? "h-7 w-7" : size === "sm" ? "h-5 w-5" : "h-6 w-6"} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={`shrink-0 rounded-full border border-[color:var(--border)]/60 object-cover ${dim} ${className}`.trim()}
    />
  );
}
