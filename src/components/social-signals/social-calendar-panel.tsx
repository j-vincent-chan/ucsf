"use client";

import { useMemo, useState } from "react";
import type { CalendarPostEvent, PublishPlatform } from "@/lib/social-signals/workspace-types";
import { INITIAL_CALENDAR_EVENTS, INITIAL_CAMPAIGNS } from "@/lib/social-signals/workspace-demo-data";
import { PlatformBadge } from "./platform-badge";
import { StatusBadge } from "./status-badge";

type Granularity = "week" | "month";

export function SocialCalendarPanel() {
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [platform, setPlatform] = useState<PublishPlatform | "all">("all");
  const [campaignFilter, setCampaignFilter] = useState<string | "all">("all");
  const [statusFilter, setStatusFilter] = useState<string | "all">("all");

  const events = useMemo(() => {
    let list: CalendarPostEvent[] = [...INITIAL_CALENDAR_EVENTS];
    if (platform !== "all") list = list.filter((e) => e.platform === platform);
    if (campaignFilter !== "all") list = list.filter((e) => e.campaignId === campaignFilter);
    if (statusFilter !== "all") list = list.filter((e) => e.status === statusFilter);
    return list.sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  }, [platform, campaignFilter, statusFilter]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarPostEvent[]>();
    for (const e of events) {
      const key = new Date(e.scheduledAt).toDateString();
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    }
    return m;
  }, [events]);

  const crowded = [...byDay.entries()].filter(([, arr]) => arr.length >= 2).map(([d]) => d);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-[color:var(--muted-foreground)]">View</span>
        {(["week", "month"] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGranularity(g)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
              granularity === g
                ? "bg-[color:var(--foreground)] text-[color:var(--background)]"
                : "border border-[color:var(--border)]/70 bg-[color:var(--card)]/90 text-[color:var(--muted-foreground)]"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-[color:var(--muted-foreground)]">
          Platform
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as PublishPlatform | "all")}
            className="mt-1 w-full rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--card)]/95 px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="x">X</option>
            <option value="bluesky">Bluesky</option>
          </select>
        </label>
        <label className="text-xs font-medium text-[color:var(--muted-foreground)]">
          Campaign
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--card)]/95 px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            {INITIAL_CAMPAIGNS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-[color:var(--muted-foreground)]">
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--card)]/95 px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
          </select>
        </label>
      </div>

      <div className="rounded-2xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/88 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
          {granularity === "week" ? "Week" : "Month"} overview
        </p>
        <ul className="mt-4 space-y-4">
          {[...byDay.keys()].length === 0 ? (
            <li className="rounded-xl border border-dashed border-[color:var(--border)]/70 px-4 py-10 text-center text-sm text-[color:var(--muted-foreground)]">
              No scheduled items match filters. Try widening platform or campaign filters, or schedule from the composer.
            </li>
          ) : (
            [...byDay.entries()].map(([day, evs]) => (
              <li key={day}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[color:var(--foreground)]">{day}</p>
                  {crowded.includes(day) ? (
                    <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-900 dark:text-violet-100">
                      Busy day
                    </span>
                  ) : null}
                </div>
                <ul className="mt-2 space-y-2">
                  {evs.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        className="w-full rounded-xl border border-[color:var(--border)]/55 bg-[color:var(--background)]/92 px-3 py-2 text-left transition-colors hover:border-[color:var(--accent)]/35"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <PlatformBadge platform={e.platform} size="xs" />
                          <StatusBadge status={e.status} />
                          <span className="text-[11px] text-[color:var(--muted-foreground)]">
                            {new Date(e.scheduledAt).toLocaleTimeString(undefined, { timeStyle: "short" })}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-[color:var(--foreground)]">{e.summary}</p>
                        <p className="text-xs text-[color:var(--muted-foreground)]">{e.sourceSignalTitle}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
