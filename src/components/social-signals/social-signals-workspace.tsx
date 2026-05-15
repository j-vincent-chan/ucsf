"use client";

import { useCallback, useEffect, useState } from "react";
import type { AggregatedFeed, SocialFeedTab, SocialPost, SourceMeta } from "@/lib/social-signals/types";
import type { InvestigatorSocialDirectory } from "@/lib/social-signals/ai-companion/investigator-directory";
import { finalizeTabPosts } from "@/lib/social-signals/live-feed-local-cache";

type LiveFeedBundle = AggregatedFeed & { tab: SocialFeedTab };
import type { SocialWorkspaceSection, WorkspaceSchedulerPost } from "@/lib/social-signals/workspace-types";
import { INITIAL_ANALYTICS } from "@/lib/social-signals/workspace-demo-data";
import { ConnectedAccountsSummary } from "./connected-accounts-summary";
import { LiveListeningFeed } from "./live-listening-feed";
import { SocialAnalyticsPanel } from "./social-analytics-panel";
import { SocialBookmarksPanel } from "./social-bookmarks-panel";
import { SocialBookmarksProvider } from "./social-bookmarks-context";
import { SocialSchedulerPanel } from "./social-scheduler-panel";
import { SocialComposerDrawer } from "./social-composer-drawer";
import { AICompanionPanel } from "./ai-companion-panel";

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function IconSparkles({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
      />
    </svg>
  );
}

const NAV: { id: SocialWorkspaceSection; label: string }[] = [
  { id: "feed", label: "Feed" },
  { id: "composer", label: "Composer" },
  { id: "scheduler", label: "Scheduler" },
  { id: "analytics", label: "Analytics" },
  { id: "bookmarks", label: "Bookmarks" },
];

function navPill(active: boolean) {
  return active
    ? "bg-[color:var(--foreground)] text-[color:var(--background)] shadow-[0_8px_20px_-14px_rgba(35,22,16,0.65)]"
    : "border border-[color:var(--border)]/70 bg-[color:var(--card)]/90 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]";
}

export function SocialSignalsWorkspace({
  liveFeedWorkspaceKey,
  initialLiveTab,
  livePosts,
  sourceMeta,
  syncedAt,
  accounts,
  initialSchedulerPosts,
  investigatorDirectory,
}: {
  /** Isolate Live listening localStorage cache per Supabase community (UUID). */
  liveFeedWorkspaceKey: string;
  initialLiveTab: SocialFeedTab;
  livePosts: SocialPost[];
  sourceMeta: SourceMeta;
  syncedAt: string;
  accounts: {
    xDisplay?: string;
    xName?: string;
    xAvatarUrl?: string;
    blueskyDisplay?: string;
    blueskyName?: string;
    blueskyAvatarUrl?: string;
  };
  initialSchedulerPosts: WorkspaceSchedulerPost[];
  investigatorDirectory?: InvestigatorSocialDirectory;
}) {
  const [section, setSection] = useState<SocialWorkspaceSection>("feed");
  const [composerOpen, setComposerOpen] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);
  /** Scroll Live listening to a post (AI Companion “Jump to post”). */
  const [feedFocusPostId, setFeedFocusPostId] = useState<string | null>(null);
  /** Live ingest bundle; updated when Live listening calls Refresh so production env issues surface in the sidebar. */
  const [live, setLive] = useState<LiveFeedBundle>(() => ({
    posts: livePosts,
    sourceMeta,
    syncedAt,
    accounts,
    tab: initialLiveTab,
  }));

  useEffect(() => {
    queueMicrotask(() => {
      const posts = finalizeTabPosts(liveFeedWorkspaceKey, initialLiveTab, livePosts);
      setLive((prev) => ({
        ...prev,
        posts,
        sourceMeta,
        syncedAt,
        accounts,
        tab: initialLiveTab,
      }));
    });
  }, [livePosts, sourceMeta, syncedAt, accounts, initialLiveTab, liveFeedWorkspaceKey]);

  const handleLiveIngest = useCallback((feed: LiveFeedBundle) => {
    const posts = finalizeTabPosts(liveFeedWorkspaceKey, feed.tab, feed.posts);
    setLive({ ...feed, posts });
  }, [liveFeedWorkspaceKey]);

  const onFeedFocusConsumed = useCallback(() => setFeedFocusPostId(null), []);

  const navigateCompanionToFeedPost = useCallback((postId: string) => {
    setFeedFocusPostId(postId);
    setCompanionOpen(false);
  }, []);

  return (
    <SocialBookmarksProvider>
    <div className="social-signals-scope min-h-[calc(100vh-8rem)] w-full min-w-0 max-w-full overflow-x-hidden pb-16">
      <header className="border-b border-[color:var(--border)]/55 bg-transparent pb-6 pt-2">
        <div className="mx-auto min-w-0 max-w-7xl px-2 sm:px-3 md:px-4">
          <h1 className="text-3xl font-bold tracking-tight text-[color:var(--foreground)]">Social Signals</h1>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-[color:var(--muted-foreground)]">
            Turn research signals into platform-ready posts, campaigns, and engagement insights.
          </p>

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

      <div className="mx-auto min-w-0 max-w-7xl px-2 py-6 sm:px-3 sm:py-8 md:px-4">
        {section === "feed" ? (
          <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
            <div className="shrink-0 border-b border-[color:var(--border)]/45 pb-4">
              <h2 className="text-lg font-semibold text-[color:var(--foreground)]">Live feed</h2>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(260px,32%)] xl:items-stretch 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <div className="flex min-h-0 min-w-0 flex-col [height:min(calc(100dvh-10rem),78rem)] sm:[height:min(calc(100dvh-11rem),84rem)] xl:[height:min(calc(100dvh-14rem),66rem)] 2xl:[height:min(calc((100dvh-15rem)*1.8),81rem)]">
                <LiveListeningFeed
                  initialTab={initialLiveTab}
                  initialPosts={live.posts}
                  sourceMeta={live.sourceMeta}
                  onIngestSuccess={handleLiveIngest}
                  layout="full"
                  connectedAccounts={live.accounts}
                  focusPostId={feedFocusPostId}
                  onFocusConsumed={onFeedFocusConsumed}
                  headerActions={
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setComposerOpen(true)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[color:var(--foreground)] px-4 py-2 text-xs font-semibold text-[color:var(--background)]"
                      >
                        <IconPlus className="h-4 w-4 shrink-0 text-[color:var(--background)]" />
                        Create post
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompanionOpen(true)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[color:var(--border)]/70 bg-[color:var(--background)]/95 px-4 py-2 text-xs font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--muted)]/18 xl:hidden"
                      >
                        <IconSparkles className="h-4 w-4 shrink-0" />
                        AI Companion
                      </button>
                    </div>
                  }
                />
              </div>
              <div className="hidden min-w-0 space-y-4 xl:block xl:max-w-none">
                <AICompanionPanel
                  posts={live.posts}
                  feedTab={live.tab}
                  investigatorDirectory={investigatorDirectory}
                  onNavigateToFeedPost={navigateCompanionToFeedPost}
                />
                <ConnectedAccountsSummary sourceMeta={live.sourceMeta} syncedAt={live.syncedAt} accounts={live.accounts} />
              </div>
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

        {section === "scheduler" ? <SocialSchedulerPanel initialPosts={initialSchedulerPosts} /> : null}
        {section === "analytics" ? <SocialAnalyticsPanel data={INITIAL_ANALYTICS} /> : null}
        {section === "bookmarks" ? <SocialBookmarksPanel /> : null}
      </div>

      <SocialComposerDrawer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        accounts={{
          xAvatarUrl: live.accounts.xAvatarUrl,
          blueskyAvatarUrl: live.accounts.blueskyAvatarUrl,
        }}
      />
      {companionOpen ? (
        <AICompanionPanel
          mode="overlay"
          posts={live.posts}
          feedTab={live.tab}
          investigatorDirectory={investigatorDirectory}
          onNavigateToFeedPost={navigateCompanionToFeedPost}
          onClose={() => setCompanionOpen(false)}
        />
      ) : null}
    </div>
    </SocialBookmarksProvider>
  );
}
