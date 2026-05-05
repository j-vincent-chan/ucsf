"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import type { SocialPost } from "@/lib/social-signals/types";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`.replace(/\.0M$/, "M");
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`.replace(/\.0K$/, "K");
  return String(n);
}

function replyIntentUrl(post: SocialPost): string {
  if (post.platform === "x" && post.id.startsWith("x:")) {
    const tid = post.id.slice(2);
    return `https://twitter.com/intent/tweet?in_reply_to=${encodeURIComponent(tid)}`;
  }
  return post.url;
}

function IconReply({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
      />
    </svg>
  );
}

function IconRepost({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  );
}

function IconHeart({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
      />
    </svg>
  );
}

function IconChart({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  );
}

function IconBookmark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  );
}

function IconShare({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
    </svg>
  );
}

export function PostEngagementBar({
  post,
  textSizeClass,
}: {
  post: SocialPost;
  /** Matches feed meta text size (e.g. `text-[13px]`). */
  textSizeClass: string;
}) {
  const share = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ url: post.url });
        return;
      }
      await navigator.clipboard.writeText(post.url);
      toast.success("Link copied");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error("Could not share");
    }
  }, [post.url]);

  const rc = post.replyCount;
  const rpc = post.repostCount;
  const lc = post.likeCount;
  const vc = post.viewCount;

  const countSlot = (n: number | undefined) =>
    n !== undefined && Number.isFinite(n) ? (
      <span className="min-w-[1.25rem] tabular-nums">{formatCompact(n)}</span>
    ) : null;

  return (
    <div
      className={`mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-2 text-[color:var(--muted-foreground)] ${textSizeClass}`}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 sm:gap-x-5">
        <a
          href={replyIntentUrl(post)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md py-1 text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)]"
          title="Reply"
        >
          <IconReply className="shrink-0 opacity-90" />
          {countSlot(rc)}
        </a>
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md py-1 text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)]"
          title="Repost"
        >
          <IconRepost className="shrink-0 opacity-90" />
          {countSlot(rpc)}
        </a>
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md py-1 text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)]"
          title="Like"
        >
          <IconHeart className="shrink-0 opacity-90" />
          {countSlot(lc)}
        </a>
        <span
          className="inline-flex items-center gap-1.5 py-1 text-[color:var(--muted-foreground)]"
          title="Views"
        >
          <IconChart className="shrink-0 opacity-90" aria-hidden />
          {countSlot(vc)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        <button
          type="button"
          className="rounded-md p-1 text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)]"
          title="Bookmarks live in the X or Bluesky app"
          aria-label="Save"
          onClick={() =>
            toast.message("Bookmarks are available when you open this post in X or Bluesky.", {
              duration: 3500,
            })
          }
        >
          <IconBookmark />
        </button>
        <button
          type="button"
          onClick={() => void share()}
          className="rounded-md p-1 text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)]"
          title="Share"
          aria-label="Share or copy link"
        >
          <IconShare />
        </button>
      </div>
    </div>
  );
}
