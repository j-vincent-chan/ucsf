"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { PublishPlatform } from "@/lib/social-signals/workspace-types";
import { BLUESKY_CHAR_LIMIT, X_CHAR_LIMIT } from "@/lib/social-signals/workspace-types";
import { WorkspaceHandleAvatarImg, type WorkspaceAccountAvatars } from "@/components/workspace-handle-avatar-img";
import { PlatformBadge } from "./platform-badge";

const composerToolbarIcon =
  "rounded-full p-2 text-sky-600 transition-colors hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-40 dark:text-sky-400";

function IconClose({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function IconMedia({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="11" r="1.5" fill="currentColor" stroke="none" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L9 17" />
    </svg>
  );
}

function IconGif({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path strokeLinecap="round" d="M7 10h4M7 14h6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 9l3 3-3 3" />
    </svg>
  );
}

function IconPoll({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

function IconList({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6h12M9 12h12M9 18h12M5 6h.01M5 12h.01M5 18h.01" />
    </svg>
  );
}

function IconEmoji({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
    </svg>
  );
}

function IconSchedule({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path strokeLinecap="round" d="M3 10h18M8 3v4M16 3v4M12 14v3l2 1" />
    </svg>
  );
}

export function SocialComposerDrawer({
  open,
  onClose,
  initialPlatform = "bluesky",
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  initialPlatform?: PublishPlatform;
  /** Connected X / Bluesky profile avatars (X wins when both platforms selected). */
  accounts?: WorkspaceAccountAvatars | null;
}) {
  const [postToX, setPostToX] = useState(initialPlatform === "x");
  const [postToBluesky, setPostToBluesky] = useState(initialPlatform !== "x");
  const [text, setText] = useState("");

  const effectivePostToX = postToX;
  const effectivePostToBluesky = postToBluesky;
  const postingToBoth = effectivePostToX && effectivePostToBluesky;
  const postingToNone = !effectivePostToX && !effectivePostToBluesky;
  const overX = effectivePostToX ? text.length > X_CHAR_LIMIT : false;
  const overBluesky = effectivePostToBluesky ? text.length > BLUESKY_CHAR_LIMIT : false;
  const overAny = overX || overBluesky;

  const charSummary = useMemo(() => {
    if (postingToNone) return "Choose a platform";
    if (postingToBoth) return `${text.length} / ${X_CHAR_LIMIT} (X) · ${text.length} / ${BLUESKY_CHAR_LIMIT} (Bluesky)`;
    if (effectivePostToX) return `${text.length} / ${X_CHAR_LIMIT}`;
    return `${text.length} / ${BLUESKY_CHAR_LIMIT}`;
  }, [text.length, postingToNone, postingToBoth, effectivePostToX, effectivePostToBluesky]);

  const canPost = Boolean(text.trim()) && !overAny && !postingToNone;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-4 pb-10 pt-[max(1rem,8vh)] backdrop-blur-[2px] sm:items-center sm:pt-4"
      role="dialog"
      aria-modal
      aria-labelledby="composer-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close composer"
        onClick={onClose}
      />
      <div className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[color:var(--border)]/80 bg-[color:var(--background)] shadow-[0_30px_120px_-65px_rgba(0,0,0,0.75)]">
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)]/55 px-3 py-2.5 sm:px-4">
          <button
            type="button"
            onClick={onClose}
            className={`${composerToolbarIcon} -ml-1`}
            aria-label="Close"
          >
            <IconClose className="h-5 w-5" />
          </button>
          <span id="composer-title" className="sr-only">
            Composer
          </span>
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-sky-600 hover:bg-sky-500/10 dark:text-sky-400"
            onClick={() => toast.message("Drafts list is not connected yet.")}
          >
            Drafts
          </button>
        </div>

        <div className="border-b border-[color:var(--border)]/40 px-3 py-2 sm:px-4">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">Platform</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setPostToX(true);
                setPostToBluesky(false);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                effectivePostToX && !effectivePostToBluesky
                  ? "border-[color:var(--accent)]/50 bg-[color:var(--accent)]/12 text-[color:var(--foreground)]"
                  : "border-[color:var(--border)]/70 bg-[color:var(--card)]/90 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
              }`}
              aria-pressed={effectivePostToX && !effectivePostToBluesky}
            >
              <span className="mr-1.5 inline-flex align-middle">
                <PlatformBadge platform="x" size="xs" />
              </span>
              X
            </button>
            <button
              type="button"
              onClick={() => {
                setPostToX(false);
                setPostToBluesky(true);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                effectivePostToBluesky && !effectivePostToX
                  ? "border-[color:var(--accent)]/50 bg-[color:var(--accent)]/12 text-[color:var(--foreground)]"
                  : "border-[color:var(--border)]/70 bg-[color:var(--card)]/90 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
              }`}
              aria-pressed={effectivePostToBluesky && !effectivePostToX}
            >
              <span className="mr-1.5 inline-flex align-middle">
                <PlatformBadge platform="bluesky" size="xs" />
              </span>
              Bluesky
            </button>
            <button
              type="button"
              onClick={() => {
                setPostToX(true);
                setPostToBluesky(true);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                postingToBoth
                  ? "border-[color:var(--accent)]/50 bg-[color:var(--accent)]/12 text-[color:var(--foreground)]"
                  : "border-[color:var(--border)]/70 bg-[color:var(--card)]/90 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
              }`}
              aria-pressed={postingToBoth}
            >
              <span className="mr-1.5 inline-flex align-middle" aria-hidden>
                <span className="inline-flex items-center gap-1">
                  <PlatformBadge platform="x" size="xs" />
                  <PlatformBadge platform="bluesky" size="xs" />
                </span>
              </span>
              Both
            </button>
          </div>
        </div>

        <div className="flex gap-3 px-3 pt-3 sm:px-4">
          <div className="shrink-0 pt-0.5" aria-hidden>
            <WorkspaceHandleAvatarImg
              postToX={effectivePostToX}
              postToBluesky={effectivePostToBluesky}
              accounts={accounts}
              size="lg"
            />
          </div>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Post text</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="What would you like to share?"
              className="w-full resize-none border-0 bg-transparent px-0 py-1 text-lg leading-relaxed text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)]/75 focus:outline-none focus:ring-0 sm:text-[1.05rem]"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--border)]/45 px-2 py-1.5 sm:px-3">
          <div className="flex flex-wrap items-center gap-0.5">
            <button type="button" disabled className={composerToolbarIcon} title="Add media (coming soon)" aria-label="Add media">
              <IconMedia className="h-5 w-5" />
            </button>
            <button type="button" disabled className={composerToolbarIcon} title="GIF (coming soon)" aria-label="GIF">
              <IconGif className="h-5 w-5" />
            </button>
            <button type="button" disabled className={composerToolbarIcon} title="Poll (coming soon)" aria-label="Poll">
              <IconPoll className="h-5 w-5" />
            </button>
            <button type="button" disabled className={composerToolbarIcon} title="List (coming soon)" aria-label="List">
              <IconList className="h-5 w-5" />
            </button>
            <button type="button" disabled className={composerToolbarIcon} title="Emoji (coming soon)" aria-label="Emoji">
              <IconEmoji className="h-5 w-5" />
            </button>
            <button type="button" disabled className={composerToolbarIcon} title="Schedule (coming soon)" aria-label="Schedule">
              <IconSchedule className="h-5 w-5" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`text-sm tabular-nums ${overAny ? "font-semibold text-red-600 dark:text-red-400" : "text-[color:var(--muted-foreground)]"}`}
              aria-live="polite"
            >
              {charSummary}
            </span>
            <button
              type="button"
              disabled={!canPost}
              onClick={() => toast.message("Posting is not wired to the APIs yet — your text stays in this session only.")}
              className="rounded-full bg-sky-600 px-4 py-1.5 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:bg-[color:var(--muted)] disabled:text-[color:var(--muted-foreground)] disabled:opacity-80 dark:bg-sky-500"
            >
              Post
            </button>
          </div>
        </div>

        <p className="border-t border-[color:var(--border)]/50 px-3 py-2.5 text-[10px] leading-snug text-[color:var(--muted-foreground)] sm:px-4">
          Posting requires API wiring. Write above, check limits, then Post when connected.
        </p>
      </div>
    </div>
  );
}
