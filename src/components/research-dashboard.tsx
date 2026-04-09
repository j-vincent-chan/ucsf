"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
import { ButtonLink } from "@/components/ui/button";
import type {
  ChartRange,
  DashboardPayload,
  MonthlyPoint,
} from "@/lib/dashboard-aggregate";
import {
  cumulativeTotalSeries,
  filterMemberJoinsByRange,
  filterMonthlyByRange,
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
  paper: "#2563eb",
  award: "#d97706",
  event: "#7c3aed",
  media: "#e11d48",
  funding: "#059669",
  community_update: "#0891b2",
  other: "#737373",
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

function RangeToggle({
  value,
  onChange,
}: {
  value: ChartRange;
  onChange: (r: ChartRange) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-neutral-200 bg-neutral-100/80 p-0.5 dark:border-neutral-700 dark:bg-neutral-900"
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
              ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-50"
              : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
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
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-950">
      <p className="mb-1 font-medium text-neutral-900 dark:text-neutral-100">{label}</p>
      <ul className="space-y-0.5">
        {payload.map((p) => (
          <li key={String(p.name)} className="flex justify-between gap-4 tabular-nums">
            <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              {p.name}
            </span>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              {p.value?.toLocaleString() ?? 0}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const axisTick = { fill: "currentColor", fontSize: 11 };
const gridStroke = "rgba(115,115,115,0.15)";

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
  const [range, setRange] = useState<ChartRange>("ytd");
  const [showCumulativeLine, setShowCumulativeLine] = useState(false);

  const filteredMonthly = useMemo(
    () => filterMonthlyByRange(data.monthly, range),
    [data.monthly, range],
  );

  const filteredJoins = useMemo(
    () => filterMemberJoinsByRange(data.memberJoins, range),
    [data.memberJoins, range],
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

  const topEntities = useMemo(
    () => topEntitiesInRange(data.itemsForVolume, data.entityNameById, range),
    [data.itemsForVolume, data.entityNameById, range],
  );

  const sourceMix = useMemo(() => {
    return [
      { name: "PubMed", value: kpis.pubmed, fill: "#2563eb" },
      { name: "Web / media", value: kpis.web, fill: "#0891b2" },
      { name: "RePORTER", value: kpis.reporter, fill: "#ea580c" },
      { name: "Lab website", value: kpis.lab_website, fill: "#059669" },
      { name: "Manual", value: kpis.manual, fill: "#737373" },
    ].filter((x) => x.value > 0);
  }, [kpis.pubmed, kpis.web, kpis.reporter, kpis.lab_website, kpis.manual]);

  const statusMix = useMemo(() => {
    let n = 0,
      rv = 0,
      ap = 0,
      ar = 0;
    for (const r of filteredMonthly) {
      n += r.new;
      rv += r.reviewed;
      ap += r.approved;
      ar += r.archived;
    }
    return [
      { name: "New", value: n, fill: "#3b82f6" },
      { name: "Reviewed", value: rv, fill: "#a855f7" },
      { name: "Approved", value: ap, fill: "#22c55e" },
      { name: "Archived", value: ar, fill: "#a3a3a3" },
    ].filter((x) => x.value > 0);
  }, [filteredMonthly]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 text-neutral-900 dark:text-neutral-100">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
            Dashboard of research activity across the community, built from curated signals.
          </p>
          <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
            Updated {new Date(data.snapshotAt).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <RangeToggle value={range} onChange={setRange} />
          <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            <input
              type="checkbox"
              checked={showCumulativeLine}
              onChange={(e) => setShowCumulativeLine(e.target.checked)}
              className="rounded border-neutral-300 dark:border-neutral-600"
            />
            Overlay cumulative total (reporting view)
          </label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <KpiCard label="Watchlist (active)" value={data.watchlistActive} sub="Tracked investigators" />
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
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Stacked by signal type — drag range above. Toggle cumulative for growth narrative.
            </p>
          </div>
        </div>
        <div className="h-[340px] w-full min-w-0 text-neutral-600 dark:text-neutral-400">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={composedVolumeData} margin={{ top: 8, right: showCumulativeLine ? 16 : 8, left: 0, bottom: 0 }}>
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
                  stroke="#171717"
                  strokeWidth={2}
                  dot={false}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {showCumulativeLine ? (
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Black line: running total of ingested items across the visible period (resets at the
            start of the selected range).
          </p>
        ) : null}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Cumulative signal growth</CardTitle>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Same range — total items over time (annual-report friendly).
          </p>
          <div className="mt-4 h-[260px] w-full min-w-0 text-neutral-600 dark:text-neutral-400">
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
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardTitle>New watchlist members</CardTitle>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            By roster join month (investigator <code className="text-xs">created_at</code>).
          </p>
          <div className="mt-4 h-[260px] w-full min-w-0 text-neutral-600 dark:text-neutral-400">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredJoins} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="shortLabel" tick={axisTick} interval="preserveStartEnd" minTickGap={20} />
                <YAxis tick={axisTick} width={36} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="joins" name="New members" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Source mix (range)</CardTitle>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            PubMed, web and news RSS, lab-site RSS, and manual entry.
          </p>
          <div className="mt-4 h-[220px] w-full min-w-0 text-neutral-600 dark:text-neutral-400">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={sourceMix.length ? sourceMix : [{ name: "—", value: 0, fill: "#e5e5e5" }]}
                margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                <XAxis type="number" tick={axisTick} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={axisTick} width={88} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Items" radius={[0, 4, 4, 0]}>
                  {(sourceMix.length ? sourceMix : [{ fill: "#e5e5e5" }]).map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardTitle>Pipeline (range)</CardTitle>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Items first seen in period by current workflow status.
          </p>
          <div className="mt-4 h-[220px] w-full min-w-0 text-neutral-600 dark:text-neutral-400">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={
                  statusMix.length ? statusMix : [{ name: "—", value: 0, fill: "#e5e5e5" }]
                }
                margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                <XAxis type="number" tick={axisTick} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={axisTick} width={72} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Items" radius={[0, 4, 4, 0]}>
                  {(statusMix.length ? statusMix : [{ fill: "#e5e5e5" }]).map((e, i) => (
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
          <CardTitle>Top investigators (range)</CardTitle>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Most ingested signals linked to a watchlist member.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {topEntities.length === 0 ? (
              <li className="text-neutral-500">No linked items in this range.</li>
            ) : (
              topEntities.map((e, i) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-2 last:border-0 dark:border-neutral-800"
                >
                  <span className="min-w-0 truncate text-neutral-700 dark:text-neutral-300">
                    <span className="text-neutral-400 dark:text-neutral-500">{i + 1}.</span>{" "}
                    <Link href={`/entities/${e.id}/edit`} className="font-medium hover:underline">
                      {e.name}
                    </Link>
                  </span>
                  <span className="shrink-0 tabular-nums text-neutral-600 dark:text-neutral-400">
                    {e.count}
                  </span>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card>
          <CardTitle>Recent activity</CardTitle>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Latest ingested items.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
                  <th className="pb-2 pr-2 font-medium">Title</th>
                  <th className="pb-2 pr-2 font-medium">Investigator</th>
                  <th className="pb-2 font-medium">Published</th>
                </tr>
              </thead>
              <tbody>
                {recentItems.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-neutral-500">
                      No items yet.
                    </td>
                  </tr>
                ) : (
                  recentItems.map((r) => (
                    <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-900">
                      <td className="py-2 pr-2">
                        <Link href={`/items/${r.id}`} className="line-clamp-2 hover:underline">
                          {r.title}
                        </Link>
                      </td>
                      <td className="py-2 pr-2 text-neutral-600 dark:text-neutral-400">{r.entityName}</td>
                      <td className="py-2 text-neutral-600 dark:text-neutral-400">
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

      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/submit">Manual submission</ButtonLink>
        <ButtonLink href="/items" variant="secondary">
          Open review queue
        </ButtonLink>
        <ButtonLink href="/digest" variant="secondary">
          Monthly digest
        </ButtonLink>
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
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">{sub}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href}>
        <Card className="h-full transition hover:border-neutral-300 dark:hover:border-neutral-600">
          {inner}
        </Card>
      </Link>
    );
  }
  return <Card className="h-full">{inner}</Card>;
}
