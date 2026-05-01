"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const CollaborationNetworkGraph = dynamic(
  () =>
    import("@/components/collaboration-network-graph").then((mod) => mod.CollaborationNetworkGraph),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-[color:var(--border)]/50 bg-[color:var(--muted)]/10 px-4 text-sm text-[color:var(--muted-foreground)]">
        Loading collaboration graph…
      </div>
    ),
  },
);
import { createClient } from "@/lib/supabase/client";
import type { ItemCategory } from "@/types/database";
import { toast } from "sonner";
import type {
  ChartRange,
  DashboardPayload,
  MonthlyPoint,
} from "@/lib/dashboard-aggregate";
import {
  cumulativeTotalSeries,
  effectiveMonthKey,
  filterMonthlyByRange,
  formatDashboardSnapshotLabel,
  rangeStartMonth,
  sumMonthlyKpis,
  topEntitiesInRange,
} from "@/lib/dashboard-aggregate";

const RANGES: { id: ChartRange; label: string }[] = [
  { id: "ytd", label: "YTD" },
  { id: "1y", label: "1Y" },
  { id: "2y", label: "2Y" },
  { id: "5y", label: "5Y" },
  { id: "max", label: "Max" },
];

const CAT_COLORS: Record<string, string> = {
  paper: "#7c8fa8",
  award: "#c9955b",
  event: "#b47f93",
  media: "#a66b72",
  funding: "#7b977f",
  community_update: "#73979a",
  other: "#9a8d84",
};

const CAT_LABEL: Record<string, string> = {
  paper: "Publications",
  award: "Awards",
  event: "Events",
  media: "Media",
  funding: "Funding",
  community_update: "Community",
  other: "Other",
};

const CATEGORY_DRILL_ORDER: ItemCategory[] = [
  "paper",
  "award",
  "event",
  "media",
  "funding",
  "community_update",
  "other",
];

function categoryDrillRank(category: ItemCategory | null): number {
  const key = category ?? "other";
  const i = CATEGORY_DRILL_ORDER.indexOf(key);
  return i >= 0 ? i : 99;
}

/** Long month label for YYYY-MM (UTC calendar month). */
function formatVolumeMonthTitle(ym: string): string {
  const [ys, ms] = ym.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Short label for chart axis / tooltip (full name stays in data for counting). */
function truncateJournalLabel(value: string, maxLen = 42): string {
  const s = value.trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}

function extractJournalLabel(item: DashboardPayload["itemsForVolume"][number]): string | null {
  if (item.source_type === "pubmed") {
    const first = (item.raw_summary ?? "").split(" · ")[0]?.trim();
    if (first) return first;
    return "PubMed (unknown journal)";
  }
  return null;
}

function extractGrantAgency(item: DashboardPayload["itemsForVolume"][number]): string {
  const first = (item.raw_summary ?? "").split(" · ")[0]?.trim();
  if (first) return first;
  if (item.source_domain === "reporter.nih.gov") return "NIH (unknown institute)";
  return item.source_domain?.replace(/^www\./, "") ?? "Unknown agency";
}

function RangeToggle({
  value,
  onChange,
}: {
  value: ChartRange;
  onChange: (r: ChartRange) => void;
}) {
  return (
    <div
      className="inline-flex rounded-2xl border border-[color:var(--border)] bg-[color:var(--muted)]/80 p-1"
      role="group"
      aria-label="Time range"
    >
      {RANGES.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition sm:px-3 sm:text-sm ${
            value === id
              ? "bg-[color:var(--card)] text-[color:var(--foreground)] shadow-[0_12px_24px_-18px_rgba(89,67,52,0.45)]"
              : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-xs shadow-[0_20px_45px_-24px_rgba(89,67,52,0.4)]">
      <p className="mb-1 font-medium text-[color:var(--foreground)]">{label}</p>
      <ul className="space-y-0.5">
        {payload.map((p) => (
          <li key={String(p.name)} className="flex justify-between gap-4 tabular-nums">
            <span className="flex items-center gap-1.5 text-[color:var(--muted-foreground)]">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              {p.name}
            </span>
            <span className="font-medium text-[color:var(--foreground)]">
              {p.value?.toLocaleString() ?? 0}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type VolumeRow = DashboardPayload["itemsForVolume"][number];

function SourceDrillPanel({
  title,
  subtitle,
  items,
  entityNameById,
  deletingIds,
  onDismiss,
  onDeleteItem,
}: {
  title: string;
  subtitle: string;
  items: VolumeRow[];
  entityNameById: Record<string, string>;
  deletingIds: Set<string>;
  onDismiss: () => void;
  onDeleteItem: (item: VolumeRow) => void;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--muted)]/25 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 pr-2">
          <p className="line-clamp-2 break-words text-sm font-semibold text-[color:var(--foreground)]">
            {title}
          </p>
          <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">{subtitle}</p>
        </div>
        <Button type="button" variant="ghost" className="shrink-0 text-xs" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">No rows in this slice.</p>
      ) : (
        <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto text-sm">
          {items.map((it) => (
            <li
              key={it.id}
              className="rounded-xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/70 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium leading-snug text-[color:var(--foreground)]">
                    {it.title?.trim() || "(untitled signal)"}
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                    {CAT_LABEL[it.category ?? "other"] ?? "Other"} · {it.status}
                    {(() => {
                      const ids =
                        it.tracked_entity_ids?.length && it.tracked_entity_ids.length > 0
                          ? it.tracked_entity_ids
                          : it.tracked_entity_id
                            ? [it.tracked_entity_id]
                            : [];
                      const names = ids
                        .map((eid) => entityNameById[eid])
                        .filter(Boolean)
                        .join(" · ");
                      return names ? ` · ${names}` : "";
                    })()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link href={`/items/${it.id}`} className="text-xs font-medium underline underline-offset-2">
                    Edit
                  </Link>
                  <button
                    type="button"
                    disabled={deletingIds.has(it.id)}
                    onClick={() => void onDeleteItem(it)}
                    title="Delete signal"
                    aria-label={`Delete signal: ${it.title?.trim() || "(untitled)"}`}
                    className="inline-flex shrink-0 rounded-lg p-1.5 text-[color:var(--muted-foreground)] transition-colors hover:bg-[#f4dfd9] hover:text-[#8f4d45] disabled:pointer-events-none disabled:opacity-45"
                  >
                    {deletingIds.has(it.id) ? (
                      <svg
                        className="size-[18px] animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" x2="10" y1="11" y2="17" />
                        <line x1="14" x2="14" y1="11" y2="17" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function barChartCategoryRowIndex<T extends Record<string, unknown>>(
  state: { activeTooltipIndex?: number; activeLabel?: string | number },
  rows: T[],
  categoryKey: keyof T,
): number {
  let idx = state.activeTooltipIndex;
  if ((idx === undefined || idx < 0) && state.activeLabel != null) {
    const lab = String(state.activeLabel);
    idx = rows.findIndex((r) => String(r[categoryKey]) === lab);
  }
  if (idx === undefined || idx < 0 || idx >= rows.length) return -1;
  return idx;
}

const axisTick = { fill: "currentColor", fontSize: 11 };
const gridStroke = "rgba(124, 106, 95, 0.18)";

export function ResearchDashboard({
  data,
  recentItems,
}: {
  data: DashboardPayload;
  recentItems: {
    id: string;
    title: string;
    status: string;
    category: string | null;
    published_at: string | null;
    entityName: string;
  }[];
}) {
  const router = useRouter();
  const [range, setRange] = useState<ChartRange>("ytd");
  const [showCumulativeLine, setShowCumulativeLine] = useState(false);
  const [volumeDrillMonth, setVolumeDrillMonth] = useState<string | null>(null);
  const [journalDrillJournal, setJournalDrillJournal] = useState<string | null>(null);
  const [grantDrillAgency, setGrantDrillAgency] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());

  const filteredMonthly = useMemo(
    () => filterMonthlyByRange(data.monthly, range),
    [data.monthly, range],
  );

  const kpis = useMemo(() => sumMonthlyKpis(filteredMonthly), [filteredMonthly]);

  const cumulativeSeries = useMemo(
    () => cumulativeTotalSeries(filteredMonthly),
    [filteredMonthly],
  );

  const composedVolumeData = useMemo(
    () =>
      filteredMonthly.map((row, i) => ({
        ...row,
        cumulative: cumulativeSeries[i]?.cumulative ?? 0,
      })),
    [filteredMonthly, cumulativeSeries],
  );

  const handleVolumeChartClick = useCallback(
    (state: { activeTooltipIndex?: number; activeLabel?: string | number }) => {
      let idx = state.activeTooltipIndex;
      if (idx === undefined || idx < 0) {
        const label = state.activeLabel;
        if (label != null) {
          idx = composedVolumeData.findIndex((r) => r.shortLabel === String(label));
        }
      }
      if (idx === undefined || idx < 0) return;
      const row = composedVolumeData[idx];
      if (!row?.month) return;
      setJournalDrillJournal(null);
      setGrantDrillAgency(null);
      setVolumeDrillMonth((prev) => (prev === row.month ? null : row.month));
    },
    [composedVolumeData],
  );

  const volumeDrillItems = useMemo(() => {
    if (!volumeDrillMonth) return [];
    return data.itemsForVolume
      .filter((it) => !deletingIds.has(it.id))
      .filter((it) => effectiveMonthKey(it) === volumeDrillMonth)
      .sort((a, b) => {
        const rc = categoryDrillRank(a.category) - categoryDrillRank(b.category);
        if (rc !== 0) return rc;
        const at = (a.title ?? "").trim();
        const bt = (b.title ?? "").trim();
        return at.localeCompare(bt);
      });
  }, [data.itemsForVolume, deletingIds, volumeDrillMonth]);

  const deleteDrillItem = useCallback(
    async (item: DashboardPayload["itemsForVolume"][number]) => {
      const title = item.title?.trim() || "(untitled)";
      if (
        !confirm(
          `Permanently delete this signal? This cannot be undone. Any summaries for this item will also be removed.\n\n${title}`,
        )
      ) {
        return;
      }
      setDeletingIds((prev) => new Set(prev).add(item.id));
      const supabase = createClient();
      const { error } = await supabase.from("source_items").delete().eq("id", item.id);
      if (error) {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        toast.error(error.message);
        return;
      }
      toast.success("Signal deleted");
      router.refresh();
    },
    [router],
  );

  const topEntities = useMemo(
    () => topEntitiesInRange(data.itemsForVolume, data.entityNameById, range),
    [data.itemsForVolume, data.entityNameById, range],
  );

  const sourceMix = useMemo(() => {
    return [
      { name: "PubMed", value: kpis.pubmed, fill: "#7c8fa8" },
      { name: "Web / media", value: kpis.web, fill: "#73979a" },
      { name: "RePORTER", value: kpis.reporter, fill: "#c9955b" },
      { name: "Lab website", value: kpis.lab_website, fill: "#7b977f" },
      { name: "Manual", value: kpis.manual, fill: "#9a8d84" },
    ].filter((x) => x.value > 0);
  }, [kpis.pubmed, kpis.web, kpis.reporter, kpis.lab_website, kpis.manual]);

  const itemsInRange = useMemo(() => {
    const start = rangeStartMonth(range);
    return data.itemsForVolume.filter((it) => {
      const ym = effectiveMonthKey(it);
      return !start || ym >= start;
    });
  }, [data.itemsForVolume, range]);

  const journalMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of itemsInRange) {
      if (item.source_type !== "pubmed") continue;
      const label = extractJournalLabel(item);
      if (!label) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const rows = Array.from(counts.entries())
      .map(([journal, value]) => ({
        journal,
        value,
        fill: "#7c8fa8",
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    return rows;
  }, [itemsInRange]);

  const grantMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of itemsInRange) {
      if (item.source_type !== "reporter") continue;
      const agency = extractGrantAgency(item);
      counts.set(agency, (counts.get(agency) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value, fill: "#7b977f" }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [itemsInRange]);

  const journalChartData = useMemo(
    () =>
      journalMix.length
        ? journalMix
        : [{ journal: "—", value: 0, fill: "#eadfd5" as const }],
    [journalMix],
  );

  const grantChartData = useMemo(
    () =>
      grantMix.length ? grantMix : [{ name: "—", value: 0, fill: "#eadfd5" as const }],
    [grantMix],
  );

  const handleJournalChartClick = useCallback(
    (state: { activeTooltipIndex?: number; activeLabel?: string | number }) => {
      const idx = barChartCategoryRowIndex(state, journalChartData, "journal");
      if (idx < 0) return;
      const row = journalChartData[idx];
      if (!row?.journal || row.journal === "—") return;
      setVolumeDrillMonth(null);
      setGrantDrillAgency(null);
      setJournalDrillJournal((prev) => (prev === row.journal ? null : row.journal));
    },
    [journalChartData],
  );

  const handleGrantChartClick = useCallback(
    (state: { activeTooltipIndex?: number; activeLabel?: string | number }) => {
      const idx = barChartCategoryRowIndex(state, grantChartData, "name");
      if (idx < 0) return;
      const row = grantChartData[idx];
      if (!row?.name || row.name === "—") return;
      setVolumeDrillMonth(null);
      setJournalDrillJournal(null);
      setGrantDrillAgency((prev) => (prev === row.name ? null : row.name));
    },
    [grantChartData],
  );

  const journalDrillItems = useMemo(() => {
    if (!journalDrillJournal) return [];
    return itemsInRange
      .filter((it) => !deletingIds.has(it.id))
      .filter((it) => it.source_type === "pubmed")
      .filter((it) => extractJournalLabel(it) === journalDrillJournal)
      .sort((a, b) => (a.title ?? "").trim().localeCompare((b.title ?? "").trim()));
  }, [itemsInRange, journalDrillJournal, deletingIds]);

  const grantDrillItems = useMemo(() => {
    if (!grantDrillAgency) return [];
    return itemsInRange
      .filter((it) => !deletingIds.has(it.id))
      .filter((it) => it.source_type === "reporter")
      .filter((it) => extractGrantAgency(it) === grantDrillAgency)
      .sort((a, b) => (a.title ?? "").trim().localeCompare((b.title ?? "").trim()));
  }, [itemsInRange, grantDrillAgency, deletingIds]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 text-[color:var(--foreground)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <div className="mt-2 space-y-2">
            <div className="max-w-2xl text-sm leading-6 text-[color:var(--muted-foreground)]">
              Dashboard of research activity across the community, built from curated signals.
            </div>
            <div className="text-xs text-[color:var(--muted-foreground)]/85">
              Updated{" "}
              <time dateTime={data.snapshotAt}>
                {data.snapshotDisplayUtc ??
                  formatDashboardSnapshotLabel(data.snapshotAt)}
              </time>
            </div>
          </div>
        </div>
        <div className="flex max-w-md flex-col items-start gap-2 sm:items-end sm:text-right">
          <RangeToggle
            value={range}
            onChange={(r) => {
              setRange(r);
              setVolumeDrillMonth(null);
              setJournalDrillJournal(null);
              setGrantDrillAgency(null);
            }}
          />
          <p className="text-xs leading-snug text-[color:var(--muted-foreground)]">
            Charts bucket signals by <span className="font-medium">publication month</span> (award dates for
            grants), not import date.{" "}
            <span className="font-medium">YTD</span> is Jan through this month (UTC). Use{" "}
            <span className="font-medium">2Y</span> or <span className="font-medium">Max</span> to see
            backfilled history.
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-[color:var(--muted-foreground)] sm:justify-end">
            <input
              type="checkbox"
              checked={showCumulativeLine}
              onChange={(e) => setShowCumulativeLine(e.target.checked)}
              className="rounded border-[color:var(--border)]"
            />
            Overlay cumulative total (reporting view)
          </label>
        </div>
      </div>

      {data.analyticsSourceItemsExpected != null &&
      data.analyticsSourceItemsLoaded !== data.analyticsSourceItemsExpected ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-50"
        >
          Dashboard charts loaded <strong>{data.analyticsSourceItemsLoaded}</strong> of{" "}
          <strong>{data.analyticsSourceItemsExpected}</strong> signals for this community (counts come from a
          separate query). If those numbers differ, graphs can miss recent months. Refresh the page; if it
          persists, the analytics fetch may need a higher cap or there may be an API error during pagination.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <KpiCard label="Faculty tracked" value={data.watchlistFaculty} sub="ImmunoX roster" />
        <KpiCard
          label="Publications"
          value={kpis.paper}
          sub="In selected range"
          href="/items?category=paper"
        />
        <KpiCard label="Awards" value={kpis.award} sub="In range" href="/items?category=award" />
        <KpiCard label="Funding" value={kpis.funding} sub="In range" href="/items?category=funding" />
        <KpiCard label="Media" value={kpis.media} sub="In range" href="/items?category=media" />
        <KpiCard label="Events" value={kpis.event} sub="In range" href="/items?category=event" />
        <KpiCard
          label="Signals ingested"
          value={kpis.total}
          sub="All categories, range"
          href="/items"
        />
        <KpiCard label="Approved in range" value={kpis.approved} sub="Ready for digest" href="/items?status=approved" />
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Research volume by month</CardTitle>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              Stacked by signal type — drag range above. Toggle cumulative for growth narrative. Click a month
              on the chart to list the signals behind that bar.
            </p>
          </div>
        </div>
        <div className="h-[340px] w-full min-w-0 text-[color:var(--muted-foreground)]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={composedVolumeData}
              margin={{ top: 8, right: showCumulativeLine ? 16 : 8, left: 0, bottom: 0 }}
              className="cursor-pointer [&_*]:outline-none"
              onClick={handleVolumeChartClick}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="shortLabel" tick={axisTick} interval="preserveStartEnd" minTickGap={24} />
              <YAxis yAxisId="left" tick={axisTick} width={40} allowDecimals={false} />
              {showCumulativeLine ? (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={axisTick}
                  width={44}
                  allowDecimals={false}
                />
              ) : null}
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              {Object.entries(CAT_COLORS).map(([key, color]) => (
                <Area
                  key={key}
                  yAxisId="left"
                  type="monotone"
                  dataKey={key as keyof MonthlyPoint}
                  name={CAT_LABEL[key] ?? key}
                  stackId="sig"
                  stroke={color}
                  fill={color}
                  fillOpacity={0.85}
                />
              ))}
              {showCumulativeLine ? (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cumulative"
                  name="Cumulative total"
                  stroke="#6c5a50"
                  strokeWidth={2}
                  dot={false}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {volumeDrillMonth ? (
          <SourceDrillPanel
            title={`Signals in ${formatVolumeMonthTitle(volumeDrillMonth)}`}
            subtitle="Same month assignment as the chart (publication date, or first-seen date if missing)."
            items={volumeDrillItems}
            entityNameById={data.entityNameById}
            deletingIds={deletingIds}
            onDismiss={() => setVolumeDrillMonth(null)}
            onDeleteItem={deleteDrillItem}
          />
        ) : null}
        {showCumulativeLine ? (
          <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
            Black line: running total of ingested items across the visible period (resets at the
            start of the selected range).
          </p>
        ) : null}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Cumulative signal growth</CardTitle>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
            Same range — total items over time (annual-report friendly).
          </p>
          <div className="mt-4 h-[260px] w-full min-w-0 text-[color:var(--muted-foreground)]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cumulativeSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="shortLabel" tick={axisTick} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={axisTick} width={44} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  name="Cumulative items"
                  stroke="#c97d63"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardTitle>Source mix (range)</CardTitle>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
            PubMed, web and news RSS, lab-site RSS, and manual entry.
          </p>
          <div className="mt-4 h-[260px] w-full min-w-0 text-[color:var(--muted-foreground)]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={sourceMix.length ? sourceMix : [{ name: "—", value: 0, fill: "#eadfd5" }]}
                margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                <XAxis type="number" tick={axisTick} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={axisTick} width={88} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Items" radius={[0, 4, 4, 0]}>
                  {(sourceMix.length ? sourceMix : [{ fill: "#eadfd5" }]).map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Top journals (range)</CardTitle>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
            Publication frequency by journal (PubMed signals in range). Click a bar to list the
            underlying signals.
          </p>
          <div className="mt-4 h-[260px] w-full min-w-0 text-[color:var(--muted-foreground)]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={journalChartData}
                margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
                className="cursor-pointer [&_*]:outline-none"
                onClick={handleJournalChartClick}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                <XAxis type="number" tick={axisTick} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="journal"
                  tick={axisTick}
                  width={148}
                  interval={0}
                  tickFormatter={(v) => truncateJournalLabel(String(v), 40)}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const j = truncateJournalLabel(String(label ?? ""), 96);
                    return (
                      <div className="max-w-xs rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-xs shadow-[0_20px_45px_-24px_rgba(89,67,52,0.4)]">
                        <p className="mb-1 font-medium leading-snug text-[color:var(--foreground)]">{j}</p>
                        <ul className="space-y-0.5">
                          {payload.map((p) => (
                            <li
                              key={String(p.name)}
                              className="flex justify-between gap-4 tabular-nums"
                            >
                              <span className="text-[color:var(--muted-foreground)]">{p.name}</span>
                              <span className="font-medium text-[color:var(--foreground)]">
                                {p.value?.toLocaleString() ?? 0}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="value" name="Papers" radius={[0, 4, 4, 0]}>
                  {journalChartData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {journalDrillJournal ? (
            <SourceDrillPanel
              title={`Journal — ${journalDrillJournal}`}
              subtitle="PubMed signals in the selected range attributed to this journal (same bucketing as the chart)."
              items={journalDrillItems}
              entityNameById={data.entityNameById}
              deletingIds={deletingIds}
              onDismiss={() => setJournalDrillJournal(null)}
              onDeleteItem={deleteDrillItem}
            />
          ) : null}
        </Card>

        <Card>
          <CardTitle>Grant agencies (range)</CardTitle>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
            Most frequently engaged funders (RePORTER-linked funding signals). Click a bar to list
            the underlying signals.
          </p>
          <div className="mt-4 h-[260px] w-full min-w-0 text-[color:var(--muted-foreground)]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={grantChartData}
                margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
                className="cursor-pointer [&_*]:outline-none"
                onClick={handleGrantChartClick}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                <XAxis type="number" tick={axisTick} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={axisTick} width={180} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Grants" radius={[0, 4, 4, 0]}>
                  {grantChartData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {grantDrillAgency ? (
            <SourceDrillPanel
              title={`Grant agency — ${grantDrillAgency}`}
              subtitle="RePORTER-linked funding signals in the selected range attributed to this agency (same bucketing as the chart)."
              items={grantDrillItems}
              entityNameById={data.entityNameById}
              deletingIds={deletingIds}
              onDismiss={() => setGrantDrillAgency(null)}
              onDeleteItem={deleteDrillItem}
            />
          ) : null}
        </Card>
      </div>

      <Card>
        <CardTitle>Collaboration network (range)</CardTitle>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          Investigators from your watchlist; lines show co-listed publications and funding signals in the
          selected range. Use the cluster control to color by research role, program tier, or detected
          collaboration groups on this network.
        </p>
        <div className="mt-4 min-w-0">
          <CollaborationNetworkGraph
            items={itemsInRange}
            entityNameById={data.entityNameById}
            entityMetaById={data.entityMetaById}
            deletingIds={deletingIds}
          />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Top investigators (range)</CardTitle>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
            Most ingested signals linked to a watchlist member.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {topEntities.length === 0 ? (
              <li className="text-[color:var(--muted-foreground)]">No linked items in this range.</li>
            ) : (
              topEntities.map((e, i) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-2 border-b border-[color:var(--border)]/60 pb-2 last:border-0"
                >
                  <span className="min-w-0 truncate text-[color:var(--foreground)]/90">
                    <span className="text-[color:var(--muted-foreground)]">{i + 1}.</span>{" "}
                    <Link href={`/entities/${e.id}/edit`} className="font-medium hover:underline">
                      {e.name}
                    </Link>
                  </span>
                  <span className="shrink-0 tabular-nums text-[color:var(--muted-foreground)]">
                    {e.count}
                  </span>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card>
          <CardTitle>Recent activity</CardTitle>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">Latest ingested items.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead>
                <tr className="border-b border-[color:var(--border)] text-[color:var(--muted-foreground)]">
                  <th className="pb-2 pr-2 font-medium">Title</th>
                  <th className="pb-2 pr-2 font-medium">Investigator</th>
                  <th className="pb-2 font-medium">Published</th>
                </tr>
              </thead>
              <tbody>
                {recentItems.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-[color:var(--muted-foreground)]">
                      No items yet.
                    </td>
                  </tr>
                ) : (
                  recentItems.map((r) => (
                    <tr key={r.id} className="border-b border-[color:var(--border)]/60 last:border-b-0">
                      <td className="py-2 pr-2">
                        <Link href={`/items/${r.id}`} className="line-clamp-2 hover:underline">
                          {r.title}
                        </Link>
                      </td>
                      <td className="py-2 pr-2 text-[color:var(--muted-foreground)]">{r.entityName}</td>
                      <td className="py-2 text-[color:var(--muted-foreground)]">
                        {r.published_at
                          ? new Date(r.published_at).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: number;
  sub: string;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value.toLocaleString()}</p>
      <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">{sub}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href}>
        <Card className="h-full transition-transform duration-200 hover:-translate-y-0.5">
          {inner}
        </Card>
      </Link>
    );
  }
  return <Card className="h-full">{inner}</Card>;
}
