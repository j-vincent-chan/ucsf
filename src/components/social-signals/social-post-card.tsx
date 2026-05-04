"use client";

import type { ReactNode } from "react";
import { PlatformBadge } from "./platform-badge";
import { SourceSignalTypeBadge } from "./source-signal-type-badge";
import { StatusBadge } from "./status-badge";
import type { WorkspaceSocialPost } from "@/lib/social-signals/workspace-types";

export type SocialPostAccountBranding = {
  x?: { displayName?: string; handle?: string; avatarUrl?: string };
  bluesky?: { displayName?: string; handle?: string; avatarUrl?: string };
};

function CharGauge({ text, limit }: { text: string; limit: number }) {
  const n = text.length;
  const warn = n > limit - 20;
  const bad = n > limit;
  return (
    <span
      className={`text-[10px] tabular-nums ${bad ? "font-semibold text-red-600 dark:text-red-400" : warn ? "text-amber-700 dark:text-amber-400" : "text-[color:var(--muted-foreground)]"}`}
    >
      {n}/{limit}
    </span>
  );
}

function formatShortPostedDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatMetric(n: number | undefined): string | null {
  if (n === undefined || Number.isNaN(n)) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function resolveIdentity(
  post: WorkspaceSocialPost,
  branding: SocialPostAccountBranding | undefined,
) {
  const plat = post.platform === "x" ? branding?.x : branding?.bluesky;
  const displayName =
    plat?.displayName?.trim() ||
    post.displayName?.trim() ||
    post.accountHandle.replace(/^@/, "");
  const handle = plat?.handle?.trim() || post.accountHandle;
  const avatarUrl = post.avatarUrl?.trim() || plat?.avatarUrl?.trim() || undefined;
  return { displayName, handle, avatarUrl };
}

function MediaBlock({
  urls,
  compact,
}: {
  urls: string[];
  compact: boolean;
}) {
  if (urls.length === 0) return null;
  const rounded = compact ? "rounded-xl" : "rounded-2xl";
  if (urls.length === 1) {
    return (
      <div className={`mt-3 overflow-hidden border border-[color:var(--border)]/50 bg-[#f4f1eb] ${rounded}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urls[0]} alt="" className="max-h-[min(24rem,70vh)] w-full object-cover" />
      </div>
    );
  }
  return (
    <div
      className={`mt-3 grid gap-0.5 overflow-hidden border border-[color:var(--border)]/50 bg-[#f4f1eb] ${rounded} ${
        urls.length === 2
          ? "grid-cols-2"
          : urls.length === 3
            ? "grid-cols-2 grid-rows-2"
            : "grid-cols-2"
      }`}
    >
      {urls.slice(0, 4).map((src, i) => (
        <div key={`${src}-${i}`} className={`relative min-h-[7rem] bg-black/5 ${urls.length === 3 && i === 0 ? "row-span-2" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="h-full w-full object-cover" />
        </div>
      ))}
    </div>
  );
}

function PostEngagementStrip({ post }: { post: WorkspaceSocialPost }) {
  const e = post.engagement;
  const views = e ? formatMetric(e.views) : null;
  const rep = e ? formatMetric(e.reposts) : null;
  const like = e ? formatMetric(e.likes) : null;
  const reply = e ? formatMetric(e.replies) : null;

  const item = (icon: ReactNode, count: string | null) => (
    <span className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 text-[color:var(--muted-foreground)] sm:max-w-none">
      <span className="shrink-0 text-[color:var(--muted-foreground)]" aria-hidden>
        {icon}
      </span>
      {count !== null && count.length > 0 ? (
        <span className="min-w-0 truncate text-[12px] tabular-nums text-[color:var(--muted-foreground)]">{count}</span>
      ) : null}
    </span>
  );

  return (
    <div
      className="mt-3 flex w-full max-w-lg items-stretch justify-between gap-0.5 text-[color:var(--muted-foreground)]"
      role="group"
      aria-label="Post actions (preview)"
    >
      {item(
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>,
        reply,
      )}
      {item(
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>,
        rep,
      )}
      {item(
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>,
        like,
      )}
      {item(
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M18 20V10M12 20V4M6 20v-6" />
        </svg>,
        views,
      )}
      {item(
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>,
        null,
      )}
      {item(
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
        </svg>,
        null,
      )}
    </div>
  );
}

function Avatar({
  name,
  src,
  size,
}: {
  name: string;
  src?: string;
  size: "sm" | "md";
}) {
  const wh = size === "sm" ? "h-9 w-9" : "h-11 w-11";
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  if (src) {
    return (
      <div className={`shrink-0 overflow-hidden rounded-full border border-[color:var(--border)]/60 bg-[color:var(--muted)]/30 ${wh}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full border border-[color:var(--border)]/60 bg-[color:var(--muted)]/45 text-xs font-semibold text-[color:var(--foreground)] ${wh}`}
      aria-hidden
    >
      {initial}
    </div>
  );
}

export function SocialPostCard({
  post,
  compact = false,
  onEdit,
  accountBranding,
}: {
  post: WorkspaceSocialPost;
  compact?: boolean;
  onEdit?: (id: string) => void;
  /** Connected account name / avatar from live APIs (see Social Signals page). */
  accountBranding?: SocialPostAccountBranding;
}) {
  const dt =
    post.publishedAt ?? post.scheduledAt ?? post.createdAt;
  const dtLabel = post.publishedAt
    ? `Published ${new Date(post.publishedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
    : post.scheduledAt
      ? `Scheduled ${new Date(post.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
      : `Updated ${new Date(post.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;

  const { displayName, handle, avatarUrl } = resolveIdentity(post, accountBranding);
  const shortDate = formatShortPostedDate(dt);
  const handleDisplay = handle.startsWith("@") ? handle : `@${handle}`;

  const mediaList = (() => {
    const fromArr = post.mediaUrls?.filter(Boolean) ?? [];
    if (fromArr.length > 0) return fromArr;
    if (post.imageUrl) return [post.imageUrl];
    return [];
  })();

  return (
    <article
      className={`social-card-native rounded-2xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/95 shadow-[0_12px_36px_-28px_rgba(40,26,18,0.55)] ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <PlatformBadge platform={post.platform} />
          <SourceSignalTypeBadge type={post.sourceSignalType} />
          <StatusBadge status={post.status} />
          {post.threadCount && post.threadCount > 1 ? (
            <span className="text-[10px] font-medium text-[color:var(--muted-foreground)]">
              Thread {post.threadIndex ?? 1}/{post.threadCount}
            </span>
          ) : null}
        </div>
        <CharGauge text={post.text} limit={post.characterLimit} />
      </div>

      <div className={`mt-3 flex gap-3 ${compact ? "gap-2.5" : "gap-3"}`}>
        <Avatar name={displayName} src={avatarUrl} size={compact ? "sm" : "md"} />
        <div className="min-w-0 flex-1">
          <p className={`font-bold leading-tight text-[color:var(--foreground)] ${compact ? "text-sm" : "text-[15px]"}`}>
            {displayName}
          </p>
          <p className="mt-0.5 text-[13px] text-[color:var(--muted-foreground)]">
            <span className="text-[color:var(--muted-foreground)]">{handleDisplay}</span>
            <span className="text-[color:var(--muted-foreground)]/80"> · </span>
            <span className="text-[color:var(--muted-foreground)]">{shortDate}</span>
            <span className="sr-only"> · {dtLabel}</span>
          </p>

          <p
            className={`mt-3 whitespace-pre-wrap leading-relaxed text-[color:var(--foreground)] ${compact ? "text-sm" : "text-[15px]"} ${post.platform === "x" ? "font-[system-ui]" : ""}`}
          >
            {post.text}
          </p>

          {post.hashtags.length > 0 ? (
            <p className="mt-2 text-xs text-sky-700 dark:text-sky-400">
              {post.hashtags.map((h) => (
                <span key={h} className="mr-2">
                  {h.startsWith("#") ? h : `#${h}`}
                </span>
              ))}
            </p>
          ) : null}

          {post.linkPreview ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-[color:var(--border)]/60 bg-[color:var(--muted)]/15">
              <div className="border-b border-[color:var(--border)]/40 bg-[color:var(--muted)]/25 px-3 py-2">
                <p className="text-xs font-semibold text-[color:var(--foreground)]">{post.linkPreview.title}</p>
                <p className="text-[10px] text-[color:var(--muted-foreground)]">{post.linkPreview.url}</p>
              </div>
              <p className="px-3 py-2 text-xs leading-snug text-[color:var(--muted-foreground)]">{post.linkPreview.description}</p>
            </div>
          ) : null}

          <MediaBlock urls={mediaList} compact={compact} />

          {!compact && mediaList.length === 0 ? (
            <div className="mt-3 flex min-h-[5rem] items-center justify-center rounded-xl border border-dashed border-[color:var(--border)]/70 bg-[color:var(--muted)]/12 text-[11px] text-[color:var(--muted-foreground)]">
              Image / thumbnail slot
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[color:var(--muted-foreground)]">
            <span>
              Alt:{" "}
              {post.altTextStatus === "ok"
                ? "set"
                : post.altTextStatus === "suggested"
                  ? "suggested"
                  : "needs text"}
            </span>
            {post.altText ? <span className="line-clamp-1 max-w-[14rem] opacity-90">{post.altText}</span> : null}
          </div>

          {post.reviewFlags && post.reviewFlags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {post.reviewFlags.map((f) => (
                <span
                  key={f}
                  className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-950 dark:text-amber-200"
                >
                  {f.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          ) : null}

          <PostEngagementStrip post={post} />
        </div>
      </div>

      {!compact ? (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[color:var(--border)]/40 pt-3">
          {(
            [
              { label: "Edit", onClick: () => onEdit?.(post.id), disabled: !onEdit },
              { label: "Regenerate", onClick: undefined, disabled: true },
              { label: "Shorten", onClick: undefined, disabled: true },
              { label: "Tone", onClick: undefined, disabled: true },
              { label: "Image", onClick: undefined, disabled: true },
              { label: "Alt text", onClick: undefined, disabled: true },
              { label: "Review", onClick: undefined, disabled: true },
              { label: "Schedule", onClick: undefined, disabled: true },
              { label: "Publish", onClick: undefined, disabled: true },
              { label: "Approve", onClick: undefined, disabled: true },
            ] as const
          ).map(({ label, onClick, disabled }) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={onClick}
              className="rounded-lg border border-[color:var(--border)]/65 bg-[color:var(--background)]/90 px-2 py-1 text-[10px] font-semibold text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--muted)]/35 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}
