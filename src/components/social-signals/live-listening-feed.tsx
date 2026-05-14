"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { dedupeSocialPostsById } from "@/lib/social-signals/dedupe-posts";
import { groupPostsForFeedDisplay, type FeedDisplayRow } from "@/lib/social-signals/group-feed-rows";
import type { AggregatedFeed, SocialFeedTab, SocialPost, SourceMeta } from "@/lib/social-signals/types";
import { LinkifiedText } from "./linkified-text";
import { PlatformBadge } from "./platform-badge";
import { PostEngagementBar } from "./post-engagement-bar";

/** Initial rows rendered; more load as you scroll (full merged monthly window stays in memory). */
const LIVE_FEED_ROW_CHUNK = 28;

function IconArrowPath({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  );
}

function IconUserGroup({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />
    </svg>
  );
}

function IconSquares2x2({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25a2.25 2.25 0 01-2.25 2.25H15a2.25 2.25 0 01-2.25-2.25V6zm5.25 9.75a2.25 2.25 0 00-2.25-2.25H15a2.25 2.25 0 00-2.25 2.25V18a2.25 2.25 0 002.25 2.25H18a2.25 2.25 0 002.25-2.25v-2.25z"
      />
    </svg>
  );
}

function rowIndexForPostId(rows: FeedDisplayRow[], postId: string): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.kind === "single") {
      if (row.post.id === postId) return i;
    } else if (row.posts.some((p) => p.id === postId)) {
      return i;
    }
  }
  return -1;
}

function replyComposerAvatarForPost(
  accounts: AggregatedFeed["accounts"] | undefined,
  platform: SocialPost["platform"],
): string | undefined {
  if (!accounts) return undefined;
  return platform === "x" ? accounts.xAvatarUrl : accounts.blueskyAvatarUrl;
}

/** True when the post author is the configured workspace X / Bluesky account (hide org logo on cards). */
function isWorkspaceAuthorPost(post: SocialPost, accounts: AggregatedFeed["accounts"] | undefined): boolean {
  if (!accounts) return false;
  const author = post.authorHandle.trim().toLowerCase().replace(/^@+/, "");
  if (!author) return false;
  if (post.platform === "x") {
    const x = (accounts.xDisplay ?? "").trim().toLowerCase().replace(/^@+/, "");
    return Boolean(x && author === x);
  }
  const raw = (accounts.blueskyDisplay ?? "").trim().toLowerCase().replace(/^@+/, "");
  if (!raw) return false;
  const bFull = raw.includes(".") ? raw : `${raw}.bsky.social`;
  const bShort = raw.replace(/\.bsky\.social$/, "");
  return author === bFull || author === bShort || author === `${bShort}.bsky.social`;
}

type ListenStyles = {
  cardClass: string;
  rowGap: string;
  avatarClass: string;
  avatarFallbackText: string;
  authorNameClass: string;
  metaClass: string;
  bodyClass: string;
  density: boolean;
};

function PostListItem({
  post: p,
  connectedAccounts,
  highlightPostId,
  ...s
}: ListenStyles & {
  post: SocialPost;
  connectedAccounts?: AggregatedFeed["accounts"];
  highlightPostId?: string | null;
}) {
  const flash = highlightPostId === p.id;
  const hideAuthorAvatar = isWorkspaceAuthorPost(p, connectedAccounts);
  return (
    <li
      data-live-post-id={p.id}
      className={`relative z-0 scroll-mt-4 min-w-0 max-w-full overflow-visible border border-[color:var(--border)]/55 bg-[color:var(--background)]/90 transition-shadow duration-300 hover:z-[4] ${s.cardClass} ${
        flash ? "ring-2 ring-sky-500/75 shadow-[0_0_0_4px_rgba(14,165,233,0.18)]" : ""
      }`}
    >
      {p.repostedBy ? (
        <div
          className={`mb-2.5 flex items-start gap-2 leading-snug text-[color:var(--muted-foreground)] ${s.density ? "text-[11px]" : "text-[13px]"}`}
          role="note"
          aria-label={`${p.repostedBy.displayName} reposted`}
        >
          <span className="mt-0.5 shrink-0 text-[color:var(--muted-foreground)]" aria-hidden>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </span>
          <span>
            <span className="font-semibold text-[color:var(--foreground)]">{p.repostedBy.displayName}</span>
            <span className="font-normal"> reposted</span>
          </span>
        </div>
      ) : null}
      <div className={`flex ${s.rowGap}`}>
        {hideAuthorAvatar ? null : (
          <div className="relative shrink-0">
            {p.authorAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.authorAvatarUrl}
                alt=""
                className={`${s.avatarClass} rounded-full border border-[color:var(--border)]/55 object-cover`}
              />
            ) : (
              <div
                className={`flex ${s.avatarClass} items-center justify-center rounded-full border border-[color:var(--border)]/55 bg-[color:var(--muted)]/35 font-semibold text-[color:var(--foreground)] ${s.avatarFallbackText}`}
              >
                {p.authorName.trim().charAt(0).toUpperCase() || "?"}
              </div>
            )}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PlatformBadge platform={p.platform} size="xs" />
            <span className={`${s.authorNameClass} font-semibold text-[color:var(--foreground)]`}>{p.authorName}</span>
            <span className={`${s.metaClass} text-[color:var(--muted-foreground)]`}>{p.authorHandle}</span>
            <span className={`${s.metaClass} text-[color:var(--muted-foreground)]`}>
              · {new Date(p.postedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>
          <p className={`mt-2.5 max-w-full ${s.bodyClass}`}>
            <LinkifiedText
              text={p.text}
              className="whitespace-pre-wrap break-words text-[color:var(--foreground)]"
            />
          </p>
          {p.mediaUrls && p.mediaUrls.length > 0 ? (
            <div
              className={`mt-3 grid gap-1.5 overflow-hidden rounded-xl border border-[color:var(--border)]/45 bg-black/5 ${
                p.mediaUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"
              }`}
            >
              {p.mediaUrls.slice(0, 4).map((src, i) => (
                <div
                  key={`${p.id}-m-${i}`}
                  className={`relative aspect-video ${s.density ? "min-h-[5.1rem] sm:min-h-[5.95rem]" : "min-h-[4.5rem]"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          ) : null}
          <PostEngagementBar
            post={p}
            textSizeClass={s.metaClass}
            dense={s.density}
            replyComposerAvatarUrl={replyComposerAvatarForPost(connectedAccounts, p.platform)}
          />
        </div>
      </div>
    </li>
  );
}

/** Max posts shown before “Show more replies” (root + replies). */
const THREAD_COLLAPSE_AFTER = 5;

/** Unique @handles for posts before index `i` (conversation context). */
function replyParticipantHandles(posts: SocialPost[], beforeIndex: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let j = 0; j < beforeIndex && j < posts.length; j++) {
    const raw = posts[j]!.authorHandle.trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const h = raw.startsWith("@") ? raw : `@${raw}`;
    out.push(h);
  }
  return out;
}

/** Slightly smaller avatars on reply rows (matches X-style thread). */
function replyAvatarClassFromRoot(rootAvatarClass: string): string {
  if (rootAvatarClass.includes("h-14")) return "h-11 w-11";
  if (rootAvatarClass.includes("h-12")) return "h-9 w-9";
  if (rootAvatarClass.includes("h-11")) return "h-9 w-9";
  return "h-9 w-9";
}

function ThreadAuthorAvatar({
  post,
  size,
  avatarClass,
  avatarFallbackText,
}: {
  post: SocialPost;
  size: "root" | "reply";
  avatarClass: string;
  avatarFallbackText: string;
}) {
  const cls = size === "root" ? avatarClass : replyAvatarClassFromRoot(avatarClass);
  return post.authorAvatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={post.authorAvatarUrl}
      alt=""
      className={`${cls} shrink-0 rounded-full border border-[color:var(--border)]/55 object-cover`}
    />
  ) : (
    <div
      className={`flex ${cls} shrink-0 items-center justify-center rounded-full border border-[color:var(--border)]/55 bg-[color:var(--muted)]/35 font-semibold text-[color:var(--foreground)] ${avatarFallbackText}`}
    >
      {post.authorName.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}

function ThreadListItem({
  posts,
  connectedAccounts,
  highlightPostId,
  ...s
}: ListenStyles & {
  posts: SocialPost[];
  connectedAccounts?: AggregatedFeed["accounts"];
  highlightPostId?: string | null;
}) {
  const [threadExpanded, setThreadExpanded] = useState(false);
  const first = posts[0];
  const needsCollapse = posts.length > THREAD_COLLAPSE_AFTER;
  const focusedReplyIndex = highlightPostId ? posts.findIndex((p) => p.id === highlightPostId) : -1;
  const forceExpandedForFocus =
    focusedReplyIndex >= THREAD_COLLAPSE_AFTER && needsCollapse && Boolean(highlightPostId);
  const expanded = threadExpanded || forceExpandedForFocus;
  const visiblePosts = needsCollapse && !expanded ? posts.slice(0, THREAD_COLLAPSE_AFTER) : posts;
  const hiddenReplyCount = needsCollapse ? posts.length - THREAD_COLLAPSE_AFTER : 0;

  const lineTop = s.density ? "top-[2.8rem]" : "top-[2.75rem]";
  const avatarCol = s.density ? "w-12" : "w-11";

  return (
    <li
      className={`relative z-0 min-w-0 max-w-full overflow-visible border border-[color:var(--border)]/55 bg-[color:var(--background)]/90 hover:z-[4] ${s.cardClass}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[color:var(--border)]/40 pb-2.5">
        <span className="text-[color:var(--muted-foreground)]" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </span>
        <span className={`${s.metaClass} font-semibold text-[color:var(--foreground)]`}>Thread</span>
        <span className={`${s.metaClass} text-[color:var(--muted-foreground)]`}>
          {posts.length} posts · reading order
        </span>
        <a
          href={first.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${s.metaClass} ml-auto font-medium text-[color:var(--foreground)] underline underline-offset-4`}
        >
          Open on {first.platform === "bluesky" ? "Bluesky" : "X"}
        </a>
      </div>

      {first.repostedBy ? (
        <div
          className={`mb-2.5 flex items-start gap-2 leading-snug text-[color:var(--muted-foreground)] ${s.density ? "text-[11px]" : "text-[13px]"}`}
          role="note"
          aria-label={`${first.repostedBy.displayName} reposted`}
        >
          <span className="mt-0.5 shrink-0 text-[color:var(--muted-foreground)]" aria-hidden>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </span>
          <span>
            <span className="font-semibold text-[color:var(--foreground)]">{first.repostedBy.displayName}</span>
            <span className="font-normal"> reposted</span>
          </span>
        </div>
      ) : null}

      <div className="relative">
        {visiblePosts.length > 1 ? (
          <div
            className={`pointer-events-none absolute ${
              avatarCol === "w-11" ? "left-[1.375rem]" : avatarCol === "w-12" ? "left-[1.5rem]" : "left-[1.625rem]"
            } ${lineTop} bottom-8 w-px -translate-x-1/2 bg-[color:var(--border)]/80`}
            aria-hidden
          />
        ) : null}
        {visiblePosts.map((p, i) => {
          const handles = replyParticipantHandles(posts, i);
          const handleLine =
            handles.length > 0
              ? handles.length <= 6
                ? handles.join(" ")
                : `${handles.slice(0, 6).join(" ")} +${handles.length - 6}`
              : "";
          const isRoot = i === 0;
          const rowFlash = highlightPostId === p.id;
          const hideAuthorAvatar = isWorkspaceAuthorPost(p, connectedAccounts);
          return (
            <div
              key={p.id}
              data-live-post-id={p.id}
              className={`relative flex scroll-mt-4 rounded-xl ${s.rowGap} ${i < visiblePosts.length - 1 ? "pb-6" : ""} ${
                rowFlash ? "ring-2 ring-sky-500/75 shadow-[0_0_0_4px_rgba(14,165,233,0.18)]" : ""
              }`}
            >
              <div className={`relative z-10 flex ${avatarCol} shrink-0 justify-center pt-0.5`}>
                {hideAuthorAvatar ? (
                  <div className={`${replyAvatarClassFromRoot(s.avatarClass)} shrink-0`} aria-hidden />
                ) : (
                  <ThreadAuthorAvatar
                    post={p}
                    size={isRoot ? "root" : "reply"}
                    avatarClass={s.avatarClass}
                    avatarFallbackText={s.avatarFallbackText}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                {!isRoot && handleLine ? (
                  <p className={`${s.metaClass} mb-1 text-[color:var(--muted-foreground)]`}>
                    <span className="font-medium text-[color:var(--foreground)]/80">Replying to </span>
                    <span className="break-words text-[color:var(--muted-foreground)]">{handleLine}</span>
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <PlatformBadge platform={p.platform} size="xs" />
                  <span className={`${s.authorNameClass} font-semibold text-[color:var(--foreground)]`}>{p.authorName}</span>
                  <span className={`${s.metaClass} text-[color:var(--muted-foreground)]`}>{p.authorHandle}</span>
                  <span className={`${s.metaClass} text-[color:var(--muted-foreground)]`}>
                    · {new Date(p.postedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </div>
                <p className={`${isRoot ? "mt-2.5" : "mt-2"} max-w-full ${s.bodyClass}`}>
                  <LinkifiedText
                    text={p.text}
                    className="whitespace-pre-wrap break-words text-[color:var(--foreground)]"
                  />
                </p>
                {p.mediaUrls && p.mediaUrls.length > 0 ? (
                  <div
                    className={`mt-3 grid gap-1.5 overflow-hidden rounded-xl border border-[color:var(--border)]/45 bg-black/5 ${
                      p.mediaUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"
                    }`}
                  >
                    {p.mediaUrls.slice(0, 4).map((src, mi) => (
                      <div
                        key={`${p.id}-m-${mi}`}
                        className={`relative aspect-video ${s.density ? "min-h-[5.1rem] sm:min-h-[5.95rem]" : "min-h-[4.5rem]"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : null}
                <PostEngagementBar
                  post={p}
                  textSizeClass={s.metaClass}
                  dense={s.density}
                  replyComposerAvatarUrl={replyComposerAvatarForPost(connectedAccounts, p.platform)}
                />
              </div>
            </div>
          );
        })}

        {needsCollapse && !expanded ? (
          <div className="relative flex pb-1 pt-1">
            <div className={`flex ${avatarCol} shrink-0 justify-center`} aria-hidden>
              <div className="h-px w-px" />
            </div>
            <button
              type="button"
              onClick={() => setThreadExpanded(true)}
              className={`${s.metaClass} text-left font-semibold text-sky-700 underline decoration-sky-700/35 underline-offset-4 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300`}
            >
              Show replies
              <span className="font-normal text-[color:var(--muted-foreground)]">
                {" "}
                ({hiddenReplyCount} more)
              </span>
            </button>
          </div>
        ) : null}

        {needsCollapse && expanded ? (
          <div className="relative flex pt-3">
            <div className={`flex ${avatarCol} shrink-0 justify-center`} aria-hidden>
              <div className="h-px w-px" />
            </div>
            <button
              type="button"
              onClick={() => setThreadExpanded(false)}
              className={`${s.metaClass} font-medium text-[color:var(--muted-foreground)] underline decoration-[color:var(--border)] underline-offset-4 hover:text-[color:var(--foreground)]`}
            >
              Show less
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function LiveListeningFeed({
  initialTab,
  initialPosts,
  sourceMeta,
  onIngestSuccess,
  layout = "default",
  headerActions,
  connectedAccounts,
  focusPostId = null,
  onFocusConsumed,
}: {
  initialTab: SocialFeedTab;
  initialPosts: SocialPost[];
  /** Server ingest diagnostics (empty feed + misconfigured env on Vercel, etc.). */
  sourceMeta: SourceMeta;
  /** Updates parent so “Connected accounts” stays in sync after Refresh; includes active tab for AI Companion weighting. */
  onIngestSuccess?: (feed: AggregatedFeed & { tab: SocialFeedTab }) => void;
  /** `full` = taller list on the dedicated Feed page. */
  layout?: "default" | "full";
  /** Rendered beside Refresh in the top row (e.g. Create post). */
  headerActions?: ReactNode;
  /** Workspace avatars for the reply composer (optional). */
  connectedAccounts?: AggregatedFeed["accounts"];
  /** Scroll to and briefly highlight this post id (e.g. from AI Companion “Jump to post”). */
  focusPostId?: string | null;
  /** Called after focus highlight ends or if the post isn’t in the current list. */
  onFocusConsumed?: () => void;
}) {
  const [tab, setTab] = useState<SocialFeedTab>(initialTab);
  const [posts, setPosts] = useState<SocialPost[]>(() => dedupeSocialPostsById(initialPosts));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);

  useEffect(() => {
    setPosts(dedupeSocialPostsById(initialPosts));
  }, [initialPosts]);

  const displayPosts = useMemo(() => dedupeSocialPostsById(posts), [posts]);
  const displayRows = useMemo(() => groupPostsForFeedDisplay(displayPosts), [displayPosts]);

  const listRef = useRef<HTMLUListElement>(null);
  const loadMoreSentinelRef = useRef<HTMLLIElement>(null);

  const [visibleRowCount, setVisibleRowCount] = useState(LIVE_FEED_ROW_CHUNK);

  useEffect(() => {
    setVisibleRowCount(LIVE_FEED_ROW_CHUNK);
  }, [initialPosts, tab]);

  useLayoutEffect(() => {
    if (!focusPostId) return;
    const idx = rowIndexForPostId(displayRows, focusPostId);
    if (idx >= 0) {
      setVisibleRowCount((v) => Math.max(v, idx + 1));
    }
  }, [focusPostId, displayRows]);

  const visibleRows = useMemo(
    () => displayRows.slice(0, Math.min(visibleRowCount, displayRows.length)),
    [displayRows, visibleRowCount],
  );
  const hasMoreRows = visibleRowCount < displayRows.length;

  useEffect(() => {
    const root = listRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!root || !sentinel || !hasMoreRows) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleRowCount((c) => Math.min(c + LIVE_FEED_ROW_CHUNK, displayRows.length));
        }
      },
      { root, rootMargin: "280px 0px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [displayRows.length, hasMoreRows, visibleRowCount]);

  useEffect(() => {
    if (!focusPostId) {
      setHighlightPostId(null);
      return;
    }
    let cancelled = false;
    let timeoutId: number | undefined;
    let finished = false;

    const finish = () => {
      if (cancelled || finished) return;
      finished = true;
      if (timeoutId) clearTimeout(timeoutId);
      setHighlightPostId(null);
      onFocusConsumed?.();
    };

    setHighlightPostId(focusPostId);

    const attemptScroll = (n: number) => {
      if (cancelled || finished) return;
      const el = document.querySelector(`[data-live-post-id="${CSS.escape(focusPostId)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        timeoutId = window.setTimeout(finish, 2600);
        return;
      }
      if (n < 14) {
        window.setTimeout(() => attemptScroll(n + 1), 95);
        return;
      }
      toast.message("This post isn’t visible here. Try another feed tab or Refresh.");
      finish();
    };

    requestAnimationFrame(() => requestAnimationFrame(() => attemptScroll(0)));

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (!finished) {
        setHighlightPostId(null);
        onFocusConsumed?.();
      }
    };
  }, [focusPostId, onFocusConsumed]);

  const density = layout === "full";
  const cardClass = density
    ? "rounded-2xl p-2.5 sm:p-4 md:p-5"
    : "rounded-xl p-2.5 sm:p-3 md:p-4";
  /** ~15% smaller type + avatars on full Feed page; padding/gaps unchanged. */
  const avatarClass = density ? "h-12 w-12" : "h-11 w-11";
  const avatarFallbackText = density ? "text-[11px]" : "text-xs";
  const authorNameClass = density ? "text-[0.85rem]" : "text-sm";
  const metaClass = density ? "text-[12px]" : "text-xs";
  const bodyClass = density ? "text-[12.75px] leading-relaxed sm:text-[0.85rem]" : "text-sm leading-relaxed";
  const rowGap = density ? "gap-3.5" : "gap-3";

  const refresh = useCallback(async (next: SocialFeedTab) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/social-signals?tab=${next}`, { method: "GET" });
      const data = (await res.json()) as Partial<AggregatedFeed> & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const nextPosts = dedupeSocialPostsById(data.posts ?? []);
      setPosts(nextPosts);
      setTab(next);
      if (data.sourceMeta && data.syncedAt && data.accounts) {
        onIngestSuccess?.({
          posts: nextPosts,
          sourceMeta: data.sourceMeta,
          syncedAt: data.syncedAt,
          accounts: data.accounts,
          tab: next,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [onIngestSuccess]);

  function tabBtn(active: boolean) {
    if (density) {
      /** Segmented control aligned with other primary chrome (e.g. digest acquire pills ~h-10 / text-sm). */
      const base =
        "inline-flex flex-1 min-w-0 min-h-10 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold leading-tight transition-colors overflow-hidden text-ellipsis whitespace-nowrap sm:min-h-11 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-[15px]";
      return active
        ? `${base} border-2 border-[color:var(--accent)]/55 bg-[color:var(--accent)]/16 text-[color:var(--foreground)] shadow-sm ring-1 ring-[color:var(--accent)]/20`
        : `${base} border-2 border-[color:var(--border)]/60 bg-[color:var(--card)]/95 text-[color:var(--foreground)]/85 hover:border-[color:var(--border)] hover:bg-[color:var(--muted)]/22 hover:text-[color:var(--foreground)]`;
    }
    return active
      ? "inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--muted)] px-3 py-2 text-xs font-semibold text-[color:var(--foreground)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_80%,white)]"
      : "inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--border)]/65 bg-[color:var(--background)]/90 px-3 py-2 text-xs font-semibold text-[color:var(--foreground)]/78 transition-colors hover:bg-[color:var(--muted)]/40 hover:text-[color:var(--foreground)]";
  }

  return (
    <section
      className={`flex min-h-0 min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/88 p-2 sm:p-3 md:p-4 ${
        layout === "full" ? "min-h-0 flex-1" : ""
      }`}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
          Live listening
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {headerActions}
          <button
            type="button"
            disabled={loading}
            onClick={() => void refresh(tab)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)]/95 px-3 py-2 text-xs font-semibold text-[color:var(--foreground)] disabled:opacity-50"
          >
            <IconArrowPath className={`h-4 w-4 shrink-0 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div
        className={
          density
            ? "mt-4 flex w-full shrink-0 gap-1 rounded-2xl border border-[color:var(--border)]/70 bg-[color:var(--muted)]/20 p-1 sm:gap-1.5 sm:p-1.5 shadow-[inset_0_1px_0_rgba(255,252,248,0.5)]"
            : "mt-3 flex shrink-0 flex-wrap gap-2"
        }
        role="tablist"
        aria-label="Listening feed"
      >
        <button type="button" role="tab" aria-selected={tab === "lists"} className={tabBtn(tab === "lists")} onClick={() => void refresh("lists")}>
          <IconUserGroup className="h-4 w-4 shrink-0 opacity-90 sm:h-[17px] sm:w-[17px]" />
          <span>Investigators</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "mentions"} className={tabBtn(tab === "mentions")} onClick={() => void refresh("mentions")}>
          <span className="shrink-0 text-[13px] font-bold leading-none opacity-90 sm:text-[15px]" aria-hidden>
            @
          </span>
          <span>Mentions</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "following"} className={tabBtn(tab === "following")} onClick={() => void refresh("following")}>
          <IconSquares2x2 className="h-4 w-4 shrink-0 opacity-90 sm:h-[17px] sm:w-[17px]" />
          <span>Others</span>
        </button>
      </div>

      {error ? (
        <p className="mt-3 shrink-0 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <ul
        ref={listRef}
        className={`mt-4 overflow-y-auto pr-1 ${
          density ? "min-h-0 flex-1 space-y-4" : "max-h-[35rem] space-y-3"
        }`}
      >
        {displayRows.length === 0 ? (
          <li className="rounded-xl border border-dashed border-[color:var(--border)]/70 px-4 py-6 text-sm text-[color:var(--muted-foreground)]">
            <p className="text-center">No live posts for this tab. Try another tab or Refresh.</p>
            <div className="mx-auto mt-4 max-w-lg rounded-xl border border-[color:var(--border)]/55 bg-[color:var(--muted)]/15 px-3 py-2.5 text-left text-xs text-[color:var(--foreground)]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                Ingest status
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 leading-snug">
                <li>
                  <span className={sourceMeta.x.configured ? "" : "font-medium text-amber-800 dark:text-amber-200"}>
                    X: {sourceMeta.x.configured ? "configured" : "not configured"}
                  </span>
                  {sourceMeta.x.detail ? (
                    <span className="text-[color:var(--muted-foreground)]"> — {sourceMeta.x.detail}</span>
                  ) : null}
                </li>
                <li>
                  <span className={sourceMeta.bluesky.configured ? "" : "font-medium text-amber-800 dark:text-amber-200"}>
                    Bluesky: {sourceMeta.bluesky.configured ? "configured" : "not configured"}
                  </span>
                  {sourceMeta.bluesky.detail ? (
                    <span className="text-[color:var(--muted-foreground)]"> — {sourceMeta.bluesky.detail}</span>
                  ) : null}
                </li>
              </ul>
              <p className="mt-3 text-[11px] leading-snug text-[color:var(--muted-foreground)]">
                If this works locally but not on the hosted site, copy the same variable names from{" "}
                <code className="rounded bg-[color:var(--muted)]/45 px-1 py-0.5 font-mono text-[10px]">.env.local</code>{" "}
                into your host&apos;s environment (e.g. Vercel → Project → Settings → Environment Variables) and redeploy.
              </p>
            </div>
          </li>
        ) : (
          <>
            {visibleRows.map((row) =>
              row.kind === "single" ? (
                <PostListItem
                  key={row.post.id}
                  cardClass={cardClass}
                  rowGap={rowGap}
                  avatarClass={avatarClass}
                  avatarFallbackText={avatarFallbackText}
                  authorNameClass={authorNameClass}
                  metaClass={metaClass}
                  bodyClass={bodyClass}
                  density={density}
                  connectedAccounts={connectedAccounts}
                  highlightPostId={highlightPostId}
                  post={row.post}
                />
              ) : (
                <ThreadListItem
                  key={`thread-${row.conversationId}`}
                  cardClass={cardClass}
                  rowGap={rowGap}
                  avatarClass={avatarClass}
                  avatarFallbackText={avatarFallbackText}
                  authorNameClass={authorNameClass}
                  metaClass={metaClass}
                  bodyClass={bodyClass}
                  density={density}
                  connectedAccounts={connectedAccounts}
                  highlightPostId={highlightPostId}
                  posts={row.posts}
                />
              ),
            )}
            {hasMoreRows ? (
              <li
                ref={loadMoreSentinelRef}
                className="flex list-none justify-center py-3"
                aria-hidden
              >
                <span className="text-[11px] font-medium text-[color:var(--muted-foreground)]">
                  Loading more…
                </span>
              </li>
            ) : null}
          </>
        )}
      </ul>
    </section>
  );
}
