"use client";

import { useMemo, useState } from "react";
import type { SocialFeedTab, SocialPost, SourceMeta } from "@/lib/social-signals/types";
import type { DashboardCounts, PublishPlatform, PostStatus, SocialWorkspaceSection } from "@/lib/social-signals/workspace-types";
import {
  INITIAL_ANALYTICS,
  INITIAL_DASHBOARD_COUNTS,
  INITIAL_RECENT_ACTIVITY,
  INITIAL_RECOMMENDATIONS,
  INITIAL_REVIEW_QUEUE,
  INITIAL_WORKSPACE_POSTS,
  INITIAL_ASSETS,
} from "@/lib/social-signals/workspace-demo-data";
import { ConnectedAccountsSummary } from "./connected-accounts-summary";
import { LiveListeningFeed } from "./live-listening-feed";
import { RecentActivityPanel } from "./recent-activity-panel";
import { RecommendationPanel } from "./recommendation-panel";
import { ReviewQueuePanel } from "./review-queue-panel";
import { SocialAnalyticsPanel } from "./social-analytics-panel";
import { AssetLibraryPanel } from "./asset-library-panel";
import { CampaignsPanel } from "./campaigns-panel";
import { SocialCalendarPanel } from "./social-calendar-panel";
import { SocialComposerDrawer } from "./social-composer-drawer";
import { SocialDashboard } from "./social-dashboard";
import { SocialPostCard } from "./social-post-card";

const NAV: { id: SocialWorkspaceSection; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "feed", label: "Feed" },
  { id: "composer", label: "Composer" },
  { id: "review", label: "Review queue" },
  { id: "calendar", label: "Calendar" },
  { id: "campaigns", label: "Campaigns" },
  { id: "analytics", label: "Analytics" },
  { id: "assets", label: "Assets" },
];

function navPill(active: boolean) {
  return active
    ? "bg-[color:var(--foreground)] text-[color:var(--background)] shadow-[0_8px_20px_-14px_rgba(35,22,16,0.65)]"
    : "border border-[color:var(--border)]/70 bg-[color:var(--card)]/90 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]";
}

export function SocialSignalsWorkspace({
  initialLiveTab,
  livePosts,
  sourceMeta,
  syncedAt,
  accounts,
}: {
  initialLiveTab: SocialFeedTab;
  livePosts: SocialPost[];
  sourceMeta: SourceMeta;
  syncedAt: string;
  accounts: { xDisplay?: string; blueskyDisplay?: string };
}) {
  const [section, setSection] = useState<SocialWorkspaceSection>("dashboard");
  const [composerOpen, setComposerOpen] = useState(false);
  const [posts, setPosts] = useState(INITIAL_WORKSPACE_POSTS);
  const [feedPlatform, setFeedPlatform] = useState<PublishPlatform | "all">("all");
  const [feedStatus, setFeedStatus] = useState<PostStatus | "all">("all");

  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      if (feedPlatform !== "all" && p.platform !== feedPlatform) return false;
      if (feedStatus !== "all" && p.status !== feedStatus) return false;
      return true;
    });
  }, [posts, feedPlatform, feedStatus]);

  const dashboardCounts: DashboardCounts = useMemo(() => {
    const draftPosts = posts.filter((p) => p.status === "draft").length;
    const needsReview = posts.filter((p) => p.status === "needs_review" || p.status === "changes_requested").length;
    const scheduled = posts.filter((p) => p.status === "scheduled").length;
    const published = posts.filter((p) => p.status === "published").length;
    return {
      draftPosts,
      needsReview,
      scheduled,
      published,
      topPerformerLabel: INITIAL_DASHBOARD_COUNTS.topPerformerLabel,
      topPerformerPlatform: INITIAL_DASHBOARD_COUNTS.topPerformerPlatform,
    };
  }, [posts]);

  return (
    <div className="social-signals-scope min-h-[calc(100vh-8rem)] pb-16">
      <header className="border-b border-[color:var(--border)]/55 bg-[color:var(--background)]/95 pb-6 pt-2">
        <div className="mx-auto max-w-7xl px-4">
          <h1 className="text-3xl font-bold tracking-tight text-[color:var(--foreground)]">Social Signals</h1>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-[color:var(--muted-foreground)]">
            Turn research signals into platform-ready posts, campaigns, and engagement insights.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[color:var(--border)]/40 pt-4 text-xs text-[color:var(--muted-foreground)]">
            <span>
              <span className="font-semibold text-[color:var(--foreground)]">X</span>{" "}
              {accounts.xDisplay ?? "—"} · {sourceMeta.x.configured ? <span className="text-emerald-700 dark:text-emerald-400">Connected</span> : <span>Not connected</span>}
            </span>
            <span>
              <span className="font-semibold text-[color:var(--foreground)]">Bluesky</span>{" "}
              {accounts.blueskyDisplay ?? "—"} · {sourceMeta.bluesky.configured ? <span className="text-emerald-700 dark:text-emerald-400">Connected</span> : <span>Not connected</span>}
            </span>
            <span>
              Last ingest:{" "}
              <span className="font-medium text-[color:var(--foreground)]">
                {new Date(syncedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </span>
          </div>

          <nav className="mt-5 flex flex-wrap gap-2" aria-label="Social Signals sections">
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setSection(n.id);
                  if (n.id === "composer") setComposerOpen(true);
                }}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${navPill(section === n.id)}`}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8">
        {section === "dashboard" ? (
          <SocialDashboard counts={dashboardCounts} onOpenComposer={() => setComposerOpen(true)}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.22fr)_minmax(0,0.78fr)]">
              <div className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-[color:var(--foreground)]">What needs attention</h2>
                  <button
                    type="button"
                    onClick={() => setSection("feed")}
                    className="text-xs font-semibold text-[color:var(--foreground)] underline underline-offset-4"
                  >
                    Open full feed
                  </button>
                </div>
                <div className="space-y-3">
                  {posts.slice(0, 4).map((p) => (
                    <SocialPostCard key={p.id} post={p} compact onEdit={(id) => setComposerOpen(true)} />
                  ))}
                </div>
                <LiveListeningFeed initialTab={initialLiveTab} initialPosts={livePosts} />
              </div>
              <div className="min-w-0 space-y-4">
                <RecommendationPanel items={INITIAL_RECOMMENDATIONS} onAction={() => setComposerOpen(true)} />
                <RecentActivityPanel items={INITIAL_RECENT_ACTIVITY} />
                <ConnectedAccountsSummary sourceMeta={sourceMeta} syncedAt={syncedAt} accounts={accounts} />
              </div>
            </div>
          </SocialDashboard>
        ) : null}

        {section === "feed" ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-medium text-[color:var(--muted-foreground)]">
                  Platform
                  <select
                    value={feedPlatform}
                    onChange={(e) => setFeedPlatform(e.target.value as PublishPlatform | "all")}
                    className="ml-2 rounded-lg border border-[color:var(--border)]/80 bg-[color:var(--card)]/95 px-2 py-1 text-xs"
                  >
                    <option value="all">All</option>
                    <option value="x">X</option>
                    <option value="bluesky">Bluesky</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-[color:var(--muted-foreground)]">
                  Status
                  <select
                    value={feedStatus}
                    onChange={(e) => setFeedStatus(e.target.value as PostStatus | "all")}
                    className="ml-2 rounded-lg border border-[color:var(--border)]/80 bg-[color:var(--card)]/95 px-2 py-1 text-xs"
                  >
                    <option value="all">All</option>
                    <option value="draft">Draft</option>
                    <option value="needs_review">Needs review</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="published">Published</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setComposerOpen(true)}
                  className="ml-auto rounded-xl bg-[color:var(--foreground)] px-4 py-2 text-xs font-semibold text-[color:var(--background)]"
                >
                  Create post
                </button>
              </div>
              <div className="space-y-4">
                {filteredPosts.map((p) => (
                  <SocialPostCard key={p.id} post={p} onEdit={() => setComposerOpen(true)} />
                ))}
              </div>
              <LiveListeningFeed initialTab={initialLiveTab} initialPosts={livePosts} />
            </div>
            <div className="space-y-4">
              <RecommendationPanel items={INITIAL_RECOMMENDATIONS} onAction={() => setComposerOpen(true)} />
              <ConnectedAccountsSummary sourceMeta={sourceMeta} syncedAt={syncedAt} accounts={accounts} />
            </div>
          </div>
        ) : null}

        {section === "composer" ? (
          <div className="mx-auto max-w-xl rounded-2xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/88 p-8 text-center">
            <p className="text-lg font-semibold text-[color:var(--foreground)]">Composer</p>
            <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
              Opens as a side panel so you can draft X and Bluesky variants with platform-specific limits.
            </p>
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="mt-6 rounded-xl bg-[color:var(--foreground)] px-6 py-3 text-sm font-semibold text-[color:var(--background)]"
            >
              Open composer
            </button>
          </div>
        ) : null}

        {section === "review" ? <ReviewQueuePanel initialItems={INITIAL_REVIEW_QUEUE} /> : null}
        {section === "calendar" ? <SocialCalendarPanel /> : null}
        {section === "campaigns" ? <CampaignsPanel /> : null}
        {section === "analytics" ? <SocialAnalyticsPanel data={INITIAL_ANALYTICS} /> : null}
        {section === "assets" ? <AssetLibraryPanel initialAssets={INITIAL_ASSETS} /> : null}
      </div>

      <SocialComposerDrawer open={composerOpen} onClose={() => setComposerOpen(false)} />
    </div>
  );
}
