"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dedupeSocialPostsById } from "@/lib/social-signals/dedupe-posts";
import { groupPostsForFeedDisplay } from "@/lib/social-signals/group-feed-rows";
import type { AggregatedFeed, SocialFeedTab, SocialPost, SourceMeta } from "@/lib/social-signals/types";
import { PlatformBadge } from "./platform-badge";

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
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-2.5 inline-block font-medium text-[color:var(--foreground)] underline underline-offset-4 ${s.metaClass}`}
          >
            Open post
          </a>
        </div>
      </div>
    </li>
  );
}

function ThreadListItem({ posts, ...s }: ListenStyles & { posts: SocialPost[] }) {
  const first = posts[0];
  const lineTop = s.density ? "top-14" : "top-11";
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
          Open on X
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
        {posts.length > 1 ? (
          <div
            className={`pointer-events-none absolute left-7 ${lineTop} bottom-5 w-px -translate-x-1/2 bg-[color:var(--border)]/75`}
            aria-hidden
          />
        ) : null}
        {posts.map((p, i) => (
          <div key={p.id} className={`relative flex ${s.rowGap} ${i < posts.length - 1 ? "pb-6" : ""}`}>
            <div className="relative z-10 flex w-14 shrink-0 justify-center">
              {i === 0 ? (
                p.authorAvatarUrl ? (
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
                )
              ) : (
                <div className={`flex ${s.avatarClass} items-center justify-center`} aria-hidden>
                  <div className="h-2.5 w-2.5 rounded-full border-2 border-[color:var(--border)]/70 bg-[color:var(--background)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--background)_90%,transparent)]" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {i === 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <PlatformBadge platform={p.platform} size={s.density ? "sm" : "xs"} />
                  <span className={`${s.authorNameClass} font-semibold text-[color:var(--foreground)]`}>{p.authorName}</span>
                  <span className={`${s.metaClass} text-[color:var(--muted-foreground)]`}>{p.authorHandle}</span>
                  <span className={`${s.metaClass} text-[color:var(--muted-foreground)]`}>
                    · {new Date(p.postedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </div>
              ) : (
                <p className={`${s.metaClass} text-[color:var(--muted-foreground)]`}>
                  {new Date(p.postedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </p>
              )}
              <p
                className={`${i === 0 ? "mt-2.5" : "mt-2"} whitespace-pre-wrap text-[color:var(--foreground)] ${s.bodyClass}`}
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
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-2.5 inline-block font-medium text-[color:var(--foreground)] underline underline-offset-4 ${s.metaClass}`}
              >
                Open post
              </a>
            </div>
          </div>
        ))}
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
}: {
  initialTab: SocialFeedTab;
  initialPosts: SocialPost[];
  /** Server ingest diagnostics (empty feed + misconfigured env on Vercel, etc.). */
  sourceMeta: SourceMeta;
  /** Updates parent so “Connected accounts” stays in sync after Refresh. */
  onIngestSuccess?: (feed: AggregatedFeed) => void;
  /** `full` = taller list on the dedicated Feed page. */
  layout?: "default" | "full";
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
    return active
      ? "rounded-lg bg-[color:var(--muted)] px-3 py-1.5 text-xs font-semibold text-[color:var(--foreground)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_80%,white)]"
      : "rounded-lg px-3 py-1.5 text-xs font-medium text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/50 hover:text-[color:var(--foreground)]";
  }

  return (
    <section
      className={`flex min-h-0 flex-col rounded-2xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/88 p-4 ${
        layout === "full" ? "min-h-0 flex-1" : ""
      }`}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
            Live listening
          </p>
          <p className="mt-0.5 text-xs text-[color:var(--muted-foreground)]">
            <span className="font-medium text-[color:var(--foreground)]">Investigators</span>: your curated X list plus a Bluesky list (
            <span className="font-mono">at://…/app.bsky.graph.list/…</span> in Settings or <span className="font-mono">BSKY_LIST_AT_URI</span>
            ).{" "}
            <span className="font-medium text-[color:var(--foreground)]">Mentions</span>: recent posts mentioning your program on X and Bluesky.{" "}
            <span className="font-medium text-[color:var(--foreground)]">Others</span>: the same X list plus your Bluesky home timeline. Requires{" "}
            <span className="font-mono">X_BEARER_TOKEN</span> and Bluesky app password.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void refresh(tab)}
          className="rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)]/95 px-3 py-1.5 text-xs font-semibold text-[color:var(--foreground)] disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="mt-3 flex shrink-0 flex-wrap gap-2" role="tablist" aria-label="Listening feed">
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
          density ? "min-h-0 flex-1 space-y-4" : "max-h-[28rem] space-y-3"
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
