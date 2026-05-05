"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import type { SocialSignalsDashboardSnapshot } from "@/lib/social-signals/dashboard-snapshot";
import type { SocialFeedTab } from "@/lib/social-signals/types";

const axisTick = { fill: "currentColor", fontSize: 11 };
const gridStroke = "rgba(124, 106, 95, 0.18)";

const FEED_OPTIONS: { id: "all" | SocialFeedTab; label: string }[] = [
  { id: "all", label: "All feeds" },
  { id: "lists", label: "Investigators" },
  { id: "mentions", label: "Mentions" },
  { id: "following", label: "Others" },
];

function ConfigPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
        ok
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
          : "border-[color:var(--border)]/80 bg-[color:var(--muted)]/25 text-[color:var(--muted-foreground)]"
      }`}
    >
      {label}
      {ok ? " · live" : " · not configured"}
    </span>
  );
}

export function SocialSignalsDashboardCard({
  snapshot,
  errorMessage,
}: {
  snapshot: SocialSignalsDashboardSnapshot | null;
  errorMessage?: string | null;
}) {
  const [activeFeed, setActiveFeed] = useState<"all" | SocialFeedTab>("all");

  const timeline = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.timeline.map((row) => ({
      ...row,
      focus:
        activeFeed === "all"
          ? row.total
          : activeFeed === "lists"
            ? row.lists
            : activeFeed === "mentions"
              ? row.mentions
              : row.following,
    }));
  }, [snapshot, activeFeed]);

  const mixRows = useMemo(() => {
    if (!snapshot) return [];
    return [
      {
        feed: "Investigators",
        x: snapshot.tabs.lists.xCount,
        bluesky: snapshot.tabs.lists.blueskyCount,
      },
      {
        feed: "Mentions",
        x: snapshot.tabs.mentions.xCount,
        bluesky: snapshot.tabs.mentions.blueskyCount,
      },
      {
        feed: "Others",
        x: snapshot.tabs.following.xCount,
        bluesky: snapshot.tabs.following.blueskyCount,
      },
    ];
  }, [snapshot]);

  const totalPosts = snapshot
    ? snapshot.tabs.lists.postCount + snapshot.tabs.mentions.postCount + snapshot.tabs.following.postCount
    : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Social Signals over time</CardTitle>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              Interactive trend from live social ingest. Switch feeds or click bars on the right chart to focus.
            </p>
          </div>
          <Link
            href="/social-signals"
            className="shrink-0 rounded-lg border border-[color:var(--border)]/75 bg-[color:var(--background)]/95 px-3 py-1.5 text-xs font-semibold text-[color:var(--foreground)] shadow-sm transition-colors hover:bg-[color:var(--muted)]/30"
          >
            Open Social Signals
          </Link>
        </div>

        {errorMessage ? (
          <p className="mt-4 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
            {errorMessage}
          </p>
        ) : null}

        {snapshot ? (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ConfigPill ok={snapshot.sourceMeta.x.configured ?? false} label="X" />
              <ConfigPill ok={snapshot.sourceMeta.bluesky.configured ?? false} label="Bluesky" />
              <span className="text-[11px] text-[color:var(--muted-foreground)]">
                {totalPosts.toLocaleString()} posts in current snapshot
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {FEED_OPTIONS.map((opt) => {
                const selected = opt.id === activeFeed;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setActiveFeed(opt.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? "border-[color:var(--foreground)]/35 bg-[color:var(--foreground)]/10 text-[color:var(--foreground)]"
                        : "border-[color:var(--border)]/65 bg-[color:var(--muted)]/20 text-[color:var(--muted-foreground)] hover:bg-[color:var(--muted)]/35"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 h-[260px] w-full min-w-0 text-[color:var(--muted-foreground)]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="shortLabel" tick={axisTick} interval="preserveStartEnd" minTickGap={22} />
                  <YAxis tick={axisTick} width={42} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: "14px" }} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Line type="monotone" dataKey="focus" name="Focused feed" stroke="#bc6f55" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="total" name="All feeds" stroke="#7d8da0" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : !errorMessage ? (
          <p className="mt-4 text-sm text-[color:var(--muted-foreground)]">Social metrics are not available.</p>
        ) : null}
      </Card>

      <Card>
        <CardTitle>Social feed mix</CardTitle>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          Posts by feed and platform. Click a feed bar to sync the timeline focus on the left.
        </p>
        {snapshot ? (
          <>
            <div className="mt-4 h-[260px] w-full min-w-0 text-[color:var(--muted-foreground)]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={mixRows}
                  margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                  barCategoryGap="34%"
                  barGap={6}
                  className="cursor-pointer [&_*]:outline-none"
                  onClick={(state) => {
                    const label = String(state?.activeLabel ?? "");
                    if (label === "Investigators") setActiveFeed("lists");
                    else if (label === "Mentions") setActiveFeed("mentions");
                    else if (label === "Others") setActiveFeed("following");
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="feed" tick={axisTick} />
                  <YAxis tick={axisTick} width={42} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: "14px" }} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar
                    dataKey="x"
                    name="X posts"
                    stackId="platform"
                    fill="#7e8ea6"
                    maxBarSize={44}
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey="bluesky"
                    name="Bluesky posts"
                    stackId="platform"
                    fill="#b17f95"
                    maxBarSize={44}
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
              Synced{" "}
              <time dateTime={snapshot.syncedAt}>
                {new Date(snapshot.syncedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </time>
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm text-[color:var(--muted-foreground)]">No social feed mix available.</p>
        )}
      </Card>
    </div>
  );
}
