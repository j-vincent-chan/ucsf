import type { ItemCategory, ItemStatus, SourceType } from "@/types/database";

export type ChartRange = "ytd" | "1y" | "2y" | "5y" | "max";

export type MonthlyPoint = {
  month: string;
  /** Short label for axis */
  shortLabel: string;
  paper: number;
  award: number;
  event: number;
  media: number;
  funding: number;
  community_update: number;
  other: number;
  total: number;
  new: number;
  reviewed: number;
  approved: number;
  archived: number;
  pubmed: number;
  web: number;
  manual: number;
  lab_website: number;
  reporter: number;
};

export type MemberJoinPoint = {
  month: string;
  shortLabel: string;
  joins: number;
};

/** Profile fields used for collaboration graph clustering (until dedicated taxonomy columns exist). */
export type DashboardEntityMeta = {
  entity_type: string;
  member_status: string;
  institution: string | null;
};

export type DashboardPayload = {
  monthly: MonthlyPoint[];
  memberJoins: MemberJoinPoint[];
  entityNameById: Record<string, string>;
  entityMetaById: Record<string, DashboardEntityMeta>;
  /** When present and mismatched, charts may omit recent signals (fetch incomplete). */
  analyticsSourceItemsLoaded?: number;
  analyticsSourceItemsExpected?: number | null;
  /** Rows for client-side “top entities” and month drill-down on the volume chart */
  itemsForVolume: {
    id: string;
    title: string;
    category: ItemCategory | null;
    status: ItemStatus;
    source_url: string | null;
    source_type: SourceType;
    source_domain: string | null;
    raw_summary: string | null;
    tracked_entity_id: string | null;
    /** All investigators on this signal (merged multi-PI); falls back to primary id when absent */
    tracked_entity_ids: string[];
    published_at: string | null;
    found_at: string;
    created_at: string;
  }[];
  snapshotAt: string;
  /** Pre-rendered on server so client matches SSR (avoids hydration from locale/ICU differences). */
  snapshotDisplayUtc: string;
  /** Current snapshot KPIs (not range-dependent) */
  watchlistFaculty: number;
};

export type RawEntity = {
  id: string;
  name: string;
  created_at: string;
  active: boolean | null;
  entity_type: string;
  member_status: string;
  institution: string | null;
};

export type RawItem = {
  id: string;
  title: string;
  category: ItemCategory | null;
  status: ItemStatus;
  source_url: string | null;
  source_type: SourceType;
  source_domain: string | null;
  raw_summary: string | null;
  published_at: string | null;
  found_at: string;
  created_at: string;
  tracked_entity_id: string | null;
  /** Populated by dashboard loader from junction table */
  tracked_entity_ids?: string[];
};

const YM_KEY = /^\d{4}-\d{2}$/;

function isValidYm(s: string): boolean {
  return YM_KEY.test(s);
}

/**
 * Normalize DB/API timestamps to `YYYY-MM` (UTC month). Prefer prefix match over blind
 * `slice(0, 7)` so Postgres-style strings (`2026-04-03 07:00:00+00`) always bucket correctly.
 * Handles occasional `Date` / numeric ms values from serializers.
 */
function calendarMonthKey(raw: unknown): string {
  if (raw == null) return "";
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return "";
    return `${raw.getUTCFullYear()}-${String(raw.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const s = String(raw).trim();
  if (!s) return "";
  const head = s.match(/^(\d{4}-\d{2})/);
  if (head?.[1]) return head[1];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return "";
}

export function effectiveMonthKey(
  item: Pick<RawItem, "published_at" | "found_at" | "created_at">,
): string {
  return (
    calendarMonthKey(item.published_at) ||
    calendarMonthKey(item.found_at) ||
    calendarMonthKey(item.created_at) ||
    calendarMonthKey(new Date().toISOString())
  );
}

function* eachMonth(fromYm: string, toYm: string): Generator<string> {
  const [y1, m1] = fromYm.split("-").map(Number);
  const [y2, m2] = toYm.split("-").map(Number);
  let y = y1;
  let m = m1;
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    yield key;
    if (y === y2 && m === m2) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (y > y2 || (y === y2 && m > m2)) break;
  }
}

function shortMonthLabel(ym: string): string {
  const [y, mo] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function emptyMonth(ym: string): MonthlyPoint {
  return {
    month: ym,
    shortLabel: shortMonthLabel(ym),
    paper: 0,
    award: 0,
    event: 0,
    media: 0,
    funding: 0,
    community_update: 0,
    other: 0,
    total: 0,
    new: 0,
    reviewed: 0,
    approved: 0,
    archived: 0,
    pubmed: 0,
    web: 0,
    manual: 0,
    lab_website: 0,
    reporter: 0,
  };
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Single source of truth for “Updated …” on the dashboard (server + client must match). */
export function formatDashboardSnapshotLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function buildDashboardPayload(
  entities: RawEntity[],
  items: RawItem[],
): DashboardPayload {
  const entityNameById: Record<string, string> = {};
  const entityMetaById: Record<string, DashboardEntityMeta> = {};
  for (const e of entities) {
    entityNameById[e.id] = e.name;
    entityMetaById[e.id] = {
      entity_type: e.entity_type,
      member_status: e.member_status,
      institution: e.institution ?? null,
    };
  }

  const watchlistFaculty = entities.filter(
    (e) => e.active !== false && e.entity_type === "faculty",
  ).length;

  let minM = "9999-12";
  let maxM = "0000-01";
  for (const item of items) {
    const k = effectiveMonthKey(item);
    if (!isValidYm(k)) continue;
    if (k < minM) minM = k;
    if (k > maxM) maxM = k;
  }
  for (const e of entities) {
    const k = calendarMonthKey(e.created_at);
    if (!k || !isValidYm(k)) continue;
    if (k < minM) minM = k;
    if (k > maxM) maxM = k;
  }

  const cur = currentMonthKey();
  if (!isValidYm(minM)) minM = cur;
  if (!isValidYm(maxM)) maxM = cur;
  if (maxM < cur) maxM = cur;
  if (minM > maxM || minM === "9999-12") {
    minM = maxM;
  }

  const monthMap = new Map<string, MonthlyPoint>();
  for (const ym of eachMonth(minM, maxM)) {
    monthMap.set(ym, emptyMonth(ym));
  }

  for (const item of items) {
    const ym = effectiveMonthKey(item);
    if (!isValidYm(ym)) continue;
    const row = monthMap.get(ym);
    if (!row) continue;

    const cat = item.category ?? "other";
    if (cat === "paper") row.paper += 1;
    else if (cat === "award") row.award += 1;
    else if (cat === "event") row.event += 1;
    else if (cat === "media") row.media += 1;
    else if (cat === "funding") row.funding += 1;
    else if (cat === "community_update") row.community_update += 1;
    else row.other += 1;

    row.total += 1;

    if (item.status === "new") row.new += 1;
    else if (item.status === "reviewed") row.reviewed += 1;
    else if (item.status === "approved") row.approved += 1;
    else if (item.status === "archived") row.archived += 1;

    if (item.source_type === "pubmed") row.pubmed += 1;
    else if (item.source_type === "web") row.web += 1;
    else if (item.source_type === "lab_website") row.lab_website += 1;
    else if (item.source_type === "reporter") row.reporter += 1;
    else row.manual += 1;
  }

  const monthly = Array.from(monthMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month),
  );

  const joinMap = new Map<string, number>();
  for (const ym of eachMonth(minM, maxM)) {
    joinMap.set(ym, 0);
  }
  for (const e of entities) {
    const ym = calendarMonthKey(e.created_at);
    if (!joinMap.has(ym)) {
      joinMap.set(ym, 0);
    }
    joinMap.set(ym, (joinMap.get(ym) ?? 0) + 1);
  }
  const memberJoins: MemberJoinPoint[] = Array.from(joinMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, joins]) => ({
      month,
      shortLabel: shortMonthLabel(month),
      joins,
    }));

  const itemsForVolume = items.map((i) => {
    const tracked_entity_ids =
      i.tracked_entity_ids?.length && i.tracked_entity_ids.length > 0
        ? i.tracked_entity_ids
        : i.tracked_entity_id
          ? [i.tracked_entity_id]
          : [];
    return {
      id: i.id,
      title: i.title,
      category: i.category,
      status: i.status,
      source_url: i.source_url,
      source_type: i.source_type,
      source_domain: i.source_domain,
      raw_summary: i.raw_summary,
      tracked_entity_id: i.tracked_entity_id,
      tracked_entity_ids,
      published_at: i.published_at,
      found_at: i.found_at,
      created_at: i.created_at,
    };
  });

  const snapshotAt = new Date().toISOString();
  return {
    monthly,
    memberJoins,
    entityNameById,
    entityMetaById,
    itemsForVolume,
    snapshotAt,
    snapshotDisplayUtc: formatDashboardSnapshotLabel(snapshotAt),
    watchlistFaculty,
  };
}

export function rangeStartMonth(range: ChartRange, now = new Date()): string | null {
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth() + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  const cur = `${y}-${pad(mo)}`;

  if (range === "max") return null;

  if (range === "ytd") {
    return `${y}-01`;
  }

  const back = range === "1y" ? 11 : range === "2y" ? 23 : 47;
  const d = new Date(Date.UTC(y, mo - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - back);
  const start = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  return start <= cur ? start : cur;
}

export function filterMonthlyByRange(
  monthly: MonthlyPoint[],
  range: ChartRange,
  now = new Date(),
): MonthlyPoint[] {
  const start = rangeStartMonth(range, now);
  if (!start) return monthly;
  return monthly.filter((m) => m.month >= start);
}

export function filterMemberJoinsByRange(
  joins: MemberJoinPoint[],
  range: ChartRange,
  now = new Date(),
): MemberJoinPoint[] {
  const start = rangeStartMonth(range, now);
  if (!start) return joins;
  return joins.filter((j) => j.month >= start);
}

export function sumMonthlyKpis(rows: MonthlyPoint[]) {
  return rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      paper: acc.paper + r.paper,
      award: acc.award + r.award,
      event: acc.event + r.event,
      media: acc.media + r.media,
      funding: acc.funding + r.funding,
      community_update: acc.community_update + r.community_update,
      other: acc.other + r.other,
      approved: acc.approved + r.approved,
      pubmed: acc.pubmed + r.pubmed,
      web: acc.web + r.web,
      manual: acc.manual + r.manual,
      lab_website: acc.lab_website + r.lab_website,
      reporter: acc.reporter + r.reporter,
    }),
    {
      total: 0,
      paper: 0,
      award: 0,
      event: 0,
      media: 0,
      funding: 0,
      community_update: 0,
      other: 0,
      approved: 0,
      pubmed: 0,
      web: 0,
      manual: 0,
      lab_website: 0,
      reporter: 0,
    },
  );
}

export type EntityVolume = { id: string; name: string; count: number };

export function topEntitiesInRange(
  items: DashboardPayload["itemsForVolume"],
  entityNameById: Record<string, string>,
  range: ChartRange,
  now = new Date(),
  limit = 8,
): EntityVolume[] {
  const start = rangeStartMonth(range, now);
  const counts = new Map<string, number>();
  for (const item of items) {
    const ym = effectiveMonthKey(item);
    if (start && ym < start) continue;
    const ids =
      item.tracked_entity_ids?.length && item.tracked_entity_ids.length > 0
        ? item.tracked_entity_ids
        : item.tracked_entity_id
          ? [item.tracked_entity_id]
          : [];
    for (const id of ids) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([id, count]) => ({
      id,
      name: entityNameById[id] ?? "Unknown",
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Running total of ingested items (ImmunoX signal volume) — stock-style line. */
export function cumulativeTotalSeries(
  rows: MonthlyPoint[],
): { month: string; shortLabel: string; cumulative: number }[] {
  let t = 0;
  return rows.map((r) => {
    t += r.total;
    return { month: r.month, shortLabel: r.shortLabel, cumulative: t };
  });
}

