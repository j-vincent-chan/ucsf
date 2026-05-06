"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { dedupeSocialPostsById } from "@/lib/social-signals/dedupe-posts";
import { groupPostsForFeedDisplay } from "@/lib/social-signals/group-feed-rows";
import type { AggregatedFeed, SocialFeedTab, SocialPost, SourceMeta } from "@/lib/social-signals/types";
import { PlatformBadge } from "./platform-badge";
import { PostEngagementBar } from "./post-engagement-bar";

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

function PostListItem({ post: p, ...s }: ListenStyles & { post: SocialPost }) {
  return (
    <li className={`border border-[color:var(--border)]/55 bg-[color:var(--background)]/90 ${s.cardClass}`}>
      {p.repostedBy ? (
        <div
          className="mb-2.5 flex items-start gap-2 text-[13px] leading-snug text-[color:var(--muted-foreground)]"
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
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PlatformBadge platform={p.platform} size={s.density ? "sm" : "xs"} />
            <span className={`${s.authorNameClass} font-semibold text-[color:var(--foreground)]`}>{p.authorName}</span>
            <span className={`${s.metaClass} text-[color:var(--muted-foreground)]`}>{p.authorHandle}</span>
            <span className={`${s.metaClass} text-[color:var(--muted-foreground)]`}>
              · {new Date(p.postedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>
          <p className={`mt-2.5 whitespace-pre-wrap text-[color:var(--foreground)] ${s.bodyClass}`}>{p.text}</p>
          {p.mediaUrls && p.mediaUrls.length > 0 ? (
            <div
              className={`mt-3 grid gap-1.5 overflow-hidden rounded-xl border border-[color:var(--border)]/45 bg-black/5 ${
                p.mediaUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"
              }`}
            >
              {p.mediaUrls.slice(0, 4).map((src, i) => (
                <div
                  key={`${p.id}-m-${i}`}
                  className={`relative aspect-video ${s.density ? "min-h-[6rem] sm:min-h-[7rem]" : "min-h-[4.5rem]"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          ) : null}
          <PostEngagementBar post={p} textSizeClass={s.metaClass} />
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-2 inline-block font-medium text-[color:var(--foreground)] underline underline-offset-4 ${s.metaClass}`}
          >
            Open post
          </a>
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

function ThreadListItem({ posts, ...s }: ListenStyles & { posts: SocialPost[] }) {
  const [threadExpanded, setThreadExpanded] = useState(false);
  const first = posts[0];
  const needsCollapse = posts.length > THREAD_COLLAPSE_AFTER;
  const visiblePosts =
    needsCollapse && !threadExpanded ? posts.slice(0, THREAD_COLLAPSE_AFTER) : posts;
  const hiddenReplyCount = needsCollapse ? posts.length - THREAD_COLLAPSE_AFTER : 0;

  const lineTop = s.density ? "top-[3.25rem]" : "top-[2.75rem]";
  const avatarCol = s.density ? "w-[3.25rem]" : "w-11";

  return (
    <li className={`border border-[color:var(--border)]/55 bg-[color:var(--background)]/90 ${s.cardClass}`}>
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
          className="mb-2.5 flex items-start gap-2 text-[13px] leading-snug text-[color:var(--muted-foreground)]"
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
            className={`pointer-events-none absolute ${avatarCol === "w-11" ? "left-[1.375rem]" : "left-[1.625rem]"} ${lineTop} bottom-8 w-px -translate-x-1/2 bg-[color:var(--border)]/80`}
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
          return (
            <div key={p.id} className={`relative flex ${s.rowGap} ${i < visiblePosts.length - 1 ? "pb-6" : ""}`}>
              <div className={`relative z-10 flex ${avatarCol} shrink-0 justify-center pt-0.5`}>
                <ThreadAuthorAvatar
                  post={p}
                  size={isRoot ? "root" : "reply"}
                  avatarClass={s.avatarClass}
                  avatarFallbackText={s.avatarFallbackText}
                />
              </div>
              <div className="min-w-0 flex-1">
                {!isRoot && handleLine ? (
                  <p className={`${s.metaClass} mb-1 text-[color:var(--muted-foreground)]`}>
                    <span className="font-medium text-[color:var(--foreground)]/80">Replying to </span>
                    <span className="break-words text-[color:var(--muted-foreground)]">{handleLine}</span>
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <PlatformBadge platform={p.platform} size={s.density ? "sm" : "xs"} />
                  <span className={`${s.authorNameClass} font-semibold text-[color:var(--foreground)]`}>{p.authorName}</span>
                  <span className={`${s.metaClass} text-[color:var(--muted-foreground)]`}>{p.authorHandle}</span>
                  <span className={`${s.metaClass} text-[color:var(--muted-foreground)]`}>
                    · {new Date(p.postedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </div>
                <p
                  className={`${isRoot ? "mt-2.5" : "mt-2"} whitespace-pre-wrap text-[color:var(--foreground)] ${s.bodyClass}`}
                >
                  {p.text}
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
                        className={`relative aspect-video ${s.density ? "min-h-[6rem] sm:min-h-[7rem]" : "min-h-[4.5rem]"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : null}
                <PostEngagementBar post={p} textSizeClass={s.metaClass} />
              </div>
            </div>
          );
        })}

        {needsCollapse && !threadExpanded ? (
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

        {needsCollapse && threadExpanded ? (
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
}: {
  initialTab: SocialFeedTab;
  initialPosts: SocialPost[];
  /** Server ingest diagnostics (empty feed + misconfigured env on Vercel, etc.). */
  sourceMeta: SourceMeta;
  /** Updates parent so “Connected accounts” stays in sync after Refresh. */
  onIngestSuccess?: (feed: AggregatedFeed) => void;
  /** `full` = taller list on the dedicated Feed page. */
  layout?: "default" | "full";
  /** Rendered beside Refresh in the top row (e.g. Create post). */
  headerActions?: ReactNode;
}) {
  const [tab, setTab] = useState<SocialFeedTab>(initialTab);
  const [posts, setPosts] = useState<SocialPost[]>(() => dedupeSocialPostsById(initialPosts));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPosts(dedupeSocialPostsById(initialPosts));
  }, [initialPosts]);

  const displayPosts = useMemo(() => dedupeSocialPostsById(posts), [posts]);
  const displayRows = useMemo(() => groupPostsForFeedDisplay(displayPosts), [displayPosts]);

  const density = layout === "full";
  const cardClass = density ? "p-5 rounded-2xl" : "p-4 rounded-xl";
  const avatarClass = density ? "h-14 w-14" : "h-11 w-11";
  const avatarFallbackText = density ? "text-sm" : "text-xs";
  const authorNameClass = density ? "text-base" : "text-sm";
  const metaClass = density ? "text-sm" : "text-xs";
  const bodyClass = density ? "text-[15px] leading-relaxed sm:text-base" : "text-sm leading-relaxed";
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
        "flex-1 min-w-0 min-h-10 rounded-xl px-3 py-2 text-center text-sm font-semibold leading-tight transition-colors sm:min-h-11 sm:px-4 sm:py-2.5 sm:text-[15px]";
      return active
        ? `${base} border-2 border-[color:var(--accent)]/55 bg-[color:var(--accent)]/16 text-[color:var(--foreground)] shadow-sm ring-1 ring-[color:var(--accent)]/20`
        : `${base} border-2 border-[color:var(--border)]/60 bg-[color:var(--card)]/95 text-[color:var(--foreground)]/85 hover:border-[color:var(--border)] hover:bg-[color:var(--muted)]/22 hover:text-[color:var(--foreground)]`;
    }
    return active
      ? "rounded-lg bg-[color:var(--muted)] px-3 py-2 text-xs font-semibold text-[color:var(--foreground)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_80%,white)]"
      : "rounded-lg border border-[color:var(--border)]/65 bg-[color:var(--background)]/90 px-3 py-2 text-xs font-semibold text-[color:var(--foreground)]/78 transition-colors hover:bg-[color:var(--muted)]/40 hover:text-[color:var(--foreground)]";
  }

  return (
    <section
      className={`flex min-h-0 flex-col rounded-2xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/88 p-4 ${
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
            className="rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)]/95 px-3 py-2 text-xs font-semibold text-[color:var(--foreground)] disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div
        className={
          density
            ? "mt-4 flex w-full shrink-0 gap-1.5 rounded-2xl border border-[color:var(--border)]/70 bg-[color:var(--muted)]/20 p-1.5 shadow-[inset_0_1px_0_rgba(255,252,248,0.5)]"
            : "mt-3 flex shrink-0 flex-wrap gap-2"
        }
        role="tablist"
        aria-label="Listening feed"
      >
        <button type="button" role="tab" aria-selected={tab === "lists"} className={tabBtn(tab === "lists")} onClick={() => void refresh("lists")}>
          Investigators
        </button>
        <button type="button" role="tab" aria-selected={tab === "mentions"} className={tabBtn(tab === "mentions")} onClick={() => void refresh("mentions")}>
          Mentions
        </button>
        <button type="button" role="tab" aria-selected={tab === "following"} className={tabBtn(tab === "following")} onClick={() => void refresh("following")}>
          Others
        </button>
      </div>

      {error ? (
        <p className="mt-3 shrink-0 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <ul
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
          displayRows.map((row) =>
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
                posts={row.posts}
              />
            ),
          )
        )}
      </ul>
    </section>
  );
}
