"use client";

import type { ReactNode } from "react";
import type { DashboardCounts } from "@/lib/social-signals/workspace-types";
import { PlatformBadge } from "./platform-badge";

function SummaryCard({
  title,
  value,
  hint,
  badgePlatform,
}: {
  title: string;
  value: string | number;
  hint: string;
  badgePlatform?: "x" | "bluesky";
}) {
  return (
    <div className="flex min-h-[5.5rem] flex-col rounded-2xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/92 p-4 shadow-[0_14px_34px_-26px_rgba(38,24,17,0.6)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--muted-foreground)]">{title}</p>
        {badgePlatform ? <PlatformBadge platform={badgePlatform} size="xs" /> : null}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-[color:var(--foreground)]">{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-[color:var(--muted-foreground)]">{hint}</p>
    </div>
  );
}

export function SocialDashboard({
  counts,
  onOpenComposer,
  children,
}: {
  counts: DashboardCounts;
  onOpenComposer: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={onOpenComposer}
          className="rounded-xl bg-[color:var(--foreground)] px-4 py-2.5 text-sm font-semibold text-[color:var(--background)] shadow-[0_12px_28px_-18px_rgba(35,22,16,0.75)] transition-opacity hover:opacity-90"
        >
          Create post
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard title="Draft posts" value={counts.draftPosts} hint="Workspace drafts" />
        <SummaryCard title="Needs review" value={counts.needsReview} hint="In review queue" />
        <SummaryCard title="Scheduled" value={counts.scheduled} hint="Calendar" />
        <SummaryCard title="Published" value={counts.published} hint="Roll-up (demo)" />
        <SummaryCard
          title="Top performer"
          value={counts.topPerformerPlatform === "bluesky" ? "Bluesky" : "X"}
          hint={counts.topPerformerLabel}
          badgePlatform={counts.topPerformerPlatform}
        />
      </div>

      {children}
    </div>
  );
}
