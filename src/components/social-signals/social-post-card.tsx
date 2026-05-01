"use client";

import { PlatformBadge } from "./platform-badge";
import { SourceSignalTypeBadge } from "./source-signal-type-badge";
import { StatusBadge } from "./status-badge";
import type { WorkspaceSocialPost } from "@/lib/social-signals/workspace-types";

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

function MicroActions() {
  return (
    <div className="mt-2 flex gap-4 text-[color:var(--muted-foreground)]" aria-hidden>
      <span className="inline-flex items-center gap-1 text-[11px]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </span>
      <span className="inline-flex items-center gap-1 text-[11px]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 1l4 4-11 11H6v-4L17 1z" />
        </svg>
      </span>
      <span className="inline-flex items-center gap-1 text-[11px]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </span>
    </div>
  );
}

export function SocialPostCard({
  post,
  compact = false,
  onEdit,
}: {
  post: WorkspaceSocialPost;
  compact?: boolean;
  onEdit?: (id: string) => void;
}) {
  const dt =
    post.publishedAt ?? post.scheduledAt ?? post.createdAt;
  const dtLabel = post.publishedAt
    ? `Published ${new Date(post.publishedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
    : post.scheduledAt
      ? `Scheduled ${new Date(post.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
      : `Updated ${new Date(post.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;

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

      <div className="mt-2">
        <p className="text-sm font-semibold text-[color:var(--foreground)]">{post.displayName}</p>
        <p className="text-xs text-[color:var(--muted-foreground)]">
          {post.accountHandle} · {dtLabel}
        </p>
      </div>

      <p className={`mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-[color:var(--foreground)] ${post.platform === "x" ? "font-[system-ui]" : ""}`}>
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

      {post.imageUrl ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-[color:var(--border)]/50 bg-[#f4f1eb]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.imageUrl} alt="" className="max-h-48 w-full object-cover" />
        </div>
      ) : (
        !compact && (
          <div className="mt-3 flex min-h-[5rem] items-center justify-center rounded-xl border border-dashed border-[color:var(--border)]/70 bg-[color:var(--muted)]/12 text-[11px] text-[color:var(--muted-foreground)]">
            Image / thumbnail slot
          </div>
        )
      )}

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

      {post.engagement ? (
        <p className="mt-2 text-[11px] text-[color:var(--muted-foreground)]">
          {post.engagement.likes} likes · {post.engagement.reposts} reposts · {post.engagement.replies} replies
        </p>
      ) : null}

      <MicroActions />

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
