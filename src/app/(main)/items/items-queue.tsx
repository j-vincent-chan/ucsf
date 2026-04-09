"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { ItemCategory, ItemStatus } from "@/types/database";
import { ARCHIVE_REASON_OPTIONS, isValidArchiveReason } from "@/lib/archive-reasons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import type { ItemRow } from "./page";
import { DiscoverItemsButton } from "./discover-items-button";
import {
  rangeForPublishedPreset,
  type PublishedRangePreset,
} from "@/lib/published-date-presets";
import { ucsfProfilesUrl } from "@/lib/ucsf-profiles-url";
import {
  CategoryTag,
  SourceTypeTag,
  StatusTag,
} from "./queue-cell-tags";

type QueueSortKey =
  | "title"
  | "entity"
  | "source"
  | "published"
  | "status"
  | "category";

type SortDir = "asc" | "desc";

function compareItems(
  a: ItemRow,
  b: ItemRow,
  key: QueueSortKey,
  dir: SortDir,
): number {
  const d = dir === "asc" ? 1 : -1;
  switch (key) {
    case "title":
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) * d;
    case "entity": {
      const na = a.tracked_entities?.name ?? "";
      const nb = b.tracked_entities?.name ?? "";
      return na.localeCompare(nb, undefined, { sensitivity: "base" }) * d;
    }
    case "source":
      return a.source_type.localeCompare(b.source_type) * d;
    case "published": {
      const ta = a.published_at ? new Date(a.published_at).getTime() : null;
      const tb = b.published_at ? new Date(b.published_at).getTime() : null;
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return (ta - tb) * d;
    }
    case "status":
      return a.status.localeCompare(b.status) * d;
    case "category": {
      const aNull = a.category === null;
      const bNull = b.category === null;
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      return a.category!.localeCompare(b.category!) * d;
    }
    default:
      return 0;
  }
}

function FiltersHelpHint() {
  return (
    <div className="group relative inline-flex shrink-0">
      <button
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-neutral-400 text-[11px] font-bold leading-none text-neutral-600 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-neutral-500 dark:text-neutral-400 dark:hover:bg-neutral-800"
        aria-label="Discover new items data sources"
      >
        ?
      </button>
      <div
        role="tooltip"
        className="invisible absolute left-1/2 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-neutral-200 bg-white p-3 text-left text-xs leading-relaxed text-neutral-700 shadow-lg ring-1 ring-black/5 group-hover:visible group-focus-within:visible dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300 dark:ring-white/10 sm:left-0 sm:translate-x-0"
      >
        <p className="font-semibold text-neutral-900 dark:text-neutral-100">
          Discover new items sources:
        </p>
        <ul className="mt-2 list-none space-y-1.5 pl-0 text-neutral-600 dark:text-neutral-400">
          <li className="flex gap-2">
            <span className="shrink-0 text-neutral-400" aria-hidden>
              -
            </span>
            <span>NIH PubMed</span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-neutral-400" aria-hidden>
              -
            </span>
            <span>
              NIH RePORTER{" "}
              <span className="text-neutral-500 dark:text-neutral-500">
                (Discover uses each row&apos;s NIH profile ID)
              </span>
            </span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-neutral-400" aria-hidden>
              -
            </span>
            <span>ClinicalTrials.gov</span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-neutral-400" aria-hidden>
              -
            </span>
            <span>UCSF News Center</span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-neutral-400" aria-hidden>
              -
            </span>
            <span>Google News Alerts</span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-neutral-400" aria-hidden>
              -
            </span>
            <span>PI Lab Websites</span>
          </li>
        </ul>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400">
          Results are de-duplicated before they appear here. Use{" "}
          <Link href="/submit" className="font-medium text-neutral-900 underline dark:text-neutral-100">
            Manual Submission
          </Link>{" "}
          for one-off entries.
        </p>
      </div>
    </div>
  );
}

function CollapsiblePanelHeader({
  panelId,
  expanded,
  onToggle,
  children,
}: {
  panelId: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={panelId}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-2 rounded-md py-0.5 text-left transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:hover:bg-neutral-900/60"
    >
      <span className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{children}</span>
      <span
        className="shrink-0 select-none text-sm text-neutral-400 tabular-nums dark:text-neutral-500"
        aria-hidden
      >
        {expanded ? "▼" : "▶"}
      </span>
    </button>
  );
}

function SortableTh({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  columnKey: QueueSortKey;
  sortKey: QueueSortKey | null;
  sortDir: SortDir;
  onSort: (k: QueueSortKey) => void;
}) {
  const active = sortKey === columnKey;
  const ariaSort = active
    ? sortDir === "asc"
      ? "ascending"
      : "descending"
    : "none";

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className="p-2 text-left align-bottom"
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className="group inline-flex w-full min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left font-medium text-neutral-800 hover:bg-neutral-200/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 dark:text-neutral-100 dark:hover:bg-neutral-800"
      >
        <span>{label}</span>
        <span
          className={`shrink-0 tabular-nums text-xs ${
            active
              ? "text-neutral-600 dark:text-neutral-300"
              : "text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-neutral-600"
          }`}
          aria-hidden
        >
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

const FILTER_STORAGE = "csd-items-filters-v1";

const FILTER_SELECT_CLASS =
  "mt-1.5 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400/25 dark:border-neutral-600 dark:bg-neutral-950 dark:focus:border-neutral-500 dark:focus:ring-neutral-500/20";

const PUBLISHED_PRESETS: { preset: PublishedRangePreset; label: string }[] = [
  { preset: "current_month", label: "This month" },
  { preset: "past_month", label: "Last month" },
  { preset: "past_3_months", label: "Past 3 months" },
  { preset: "past_6_months", label: "Past 6 months" },
];

const PRESET_PILL_CLASS =
  "rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-800";

type Filters = {
  status: string;
  category: string;
  source_type: string;
  entity: string;
  from: string;
  to: string;
};

export function ItemsQueue({
  initialItems,
  entities,
  initialFilters,
  canRunDiscovery = false,
}: {
  initialItems: ItemRow[];
  entities: { id: string; name: string }[];
  initialFilters: Filters;
  canRunDiscovery?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<QueueSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(true);
  const [publishedFrom, setPublishedFrom] = useState(initialFilters.from);
  const [publishedTo, setPublishedTo] = useState(initialFilters.to);
  const [bulkArchiveReason, setBulkArchiveReason] = useState("");
  const [bulkArchivePanelOpen, setBulkArchivePanelOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [rowArchiveId, setRowArchiveId] = useState<string | null>(null);
  const [rowArchiveReason, setRowArchiveReason] = useState("");
  const hydrated = useRef(false);
  const filtersFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setPublishedFrom(initialFilters.from);
    setPublishedTo(initialFilters.to);
  }, [initialFilters.from, initialFilters.to]);

  function applyPublishedPreset(preset: PublishedRangePreset) {
    const r = rangeForPublishedPreset(preset);
    setPublishedFrom(r.from);
    setPublishedTo(r.to);

    const q = new URLSearchParams();
    q.set("from", r.from);
    q.set("to", r.to);
    const form = filtersFormRef.current;
    if (form) {
      const fd = new FormData(form);
      fd.forEach((value, key) => {
        if (key === "from" || key === "to") return;
        if (typeof value === "string" && value.length > 0) {
          q.set(key, value);
        }
      });
    }

    startTransition(() => {
      router.push(q.toString() ? `/items?${q.toString()}` : "/items");
    });
  }

  const sortedItems = useMemo(() => {
    if (!sortKey) return initialItems;
    const next = [...initialItems];
    next.sort((a, b) => compareItems(a, b, sortKey, sortDir));
    return next;
  }, [initialItems, sortKey, sortDir]);

  useEffect(() => {
    const valid = new Set(initialItems.map((i) => i.id));
    setSelected((prev) => {
      let pruned = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
        else pruned = true;
      }
      return pruned ? next : prev;
    });
  }, [initialItems]);

  function onHeaderSort(key: QueueSortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    }
  }

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectAllOnPage = () => {
    if (selected.size === sortedItems.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sortedItems.map((i) => i.id)));
    }
  };

  const saveDefaultFilters = () => {
    try {
      localStorage.setItem(FILTER_STORAGE, JSON.stringify(initialFilters));
      toast.success("Saved default filters for this browser");
    } catch {
      toast.error("Could not save filters");
    }
  };

  const loadDefaults = useCallback(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(FILTER_STORAGE);
    if (!raw) {
      toast.message("No saved filters");
      return;
    }
    try {
      const f = JSON.parse(raw) as Filters;
      if (f.entity && !entities.some((e) => e.id === f.entity)) {
        f.entity = "";
      }
      const q = new URLSearchParams();
      Object.entries(f).forEach(([k, v]) => {
        if (v) q.set(k, v);
      });
      startTransition(() => router.push(`/items?${q}`));
    } catch {
      toast.error("Invalid saved filters");
    }
  }, [entities, router]);

  useEffect(() => {
    if (hydrated.current) return;
    const empty = !Object.values(initialFilters).some(Boolean);
    if (!empty) return;
    hydrated.current = true;
    const raw = localStorage.getItem(FILTER_STORAGE);
    if (!raw) return;
    try {
      const f = JSON.parse(raw) as Filters;
      if (f.entity && !entities.some((e) => e.id === f.entity)) {
        f.entity = "";
      }
      const q = new URLSearchParams();
      Object.entries(f).forEach(([k, v]) => {
        if (v) q.set(k, v);
      });
      if ([...q.keys()].length === 0) return;
      startTransition(() => router.replace(`/items?${q}`));
    } catch {
      /* ignore */
    }
  }, [entities, initialFilters, router, startTransition]);

  async function bulkUpdate(
    patch: Partial<{
      status: ItemStatus;
      category: ItemCategory | null;
      archive_reason: string | null;
    }>,
  ): Promise<boolean> {
    const ids = [...selected];
    if (ids.length === 0) {
      toast.error("Select at least one row");
      return false;
    }
    const supabase = createClient();
    const { error } = await supabase.from("source_items").update(patch).in("id", ids);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success(`Updated ${ids.length} item(s)`);
    setSelected(new Set());
    router.refresh();
    return true;
  }

  async function bulkArchive() {
    if (!isValidArchiveReason(bulkArchiveReason)) {
      toast.error("Pick a reason, then confirm.");
      return;
    }
    const ok = await bulkUpdate({ status: "archived", archive_reason: bulkArchiveReason });
    if (ok) {
      setBulkArchivePanelOpen(false);
      setBulkArchiveReason("");
    }
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) {
      toast.error("Select at least one row");
      return;
    }
    const idSet = new Set(ids);
    const titles = sortedItems.filter((i) => idSet.has(i.id)).map((i) => i.title.trim() || "(untitled)");
    const sample = titles.slice(0, 5).join(", ");
    const more = ids.length > 5 ? ` and ${ids.length - 5} more` : "";
    if (
      !confirm(
        `Permanently delete ${ids.length} signal${ids.length === 1 ? "" : "s"}? This cannot be undone. Any summaries for these items will be removed.\n\n${sample}${more}`,
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("source_items").delete().in("id", ids);
    setBulkDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Deleted ${ids.length} signal${ids.length === 1 ? "" : "s"}`);
    setSelected(new Set());
    setBulkArchivePanelOpen(false);
    setBulkArchiveReason("");
    router.refresh();
  }

  function cancelBulkArchive() {
    setBulkArchivePanelOpen(false);
    setBulkArchiveReason("");
  }

  function closeRowArchive() {
    setRowArchiveId(null);
    setRowArchiveReason("");
  }

  async function confirmRowArchive() {
    if (!rowArchiveId || !isValidArchiveReason(rowArchiveReason)) {
      toast.error("Pick an archive reason");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("source_items")
      .update({ status: "archived", archive_reason: rowArchiveReason })
      .eq("id", rowArchiveId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Archived");
    setSelected((s) => {
      const n = new Set(s);
      n.delete(rowArchiveId);
      return n;
    });
    closeRowArchive();
    router.refresh();
  }

  function refreshList() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-gradient-to-br from-neutral-50 to-white p-4 shadow-sm dark:border-neutral-800 dark:from-neutral-900/90 dark:to-neutral-950 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-0.5">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Queue actions
            </h2>
            <FiltersHelpHint />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
            {canRunDiscovery ? (
              <>
                <strong className="font-medium text-neutral-800 dark:text-neutral-200">
                  Discover new items
                </strong>{" "}
                queries external sources and adds new rows.{" "}
              </>
            ) : null}
            <strong className="font-medium text-neutral-800 dark:text-neutral-200">Refresh</strong>{" "}
            reloads this list from the database{canRunDiscovery ? "" : " (no automated discovery)"}.
          </p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:max-w-md sm:flex-row sm:items-stretch">
          {canRunDiscovery ? <DiscoverItemsButton /> : null}
          <Button
            type="button"
            variant="secondary"
            className="w-full shrink-0 border-neutral-300 bg-white py-2.5 text-sm font-medium shadow-sm dark:border-neutral-600 dark:bg-neutral-950 sm:w-auto sm:min-w-[7.5rem]"
            disabled={pending}
            onClick={refreshList}
          >
            {pending ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      <Card>
        <CollapsiblePanelHeader
          panelId="filters-panel"
          expanded={filtersOpen}
          onToggle={() => setFiltersOpen((o) => !o)}
        >
          Filters
        </CollapsiblePanelHeader>
        {filtersOpen ? (
          <form
            ref={filtersFormRef}
            id="filters-panel"
            className="mt-4 space-y-5 border-t border-neutral-100 pt-5 dark:border-neutral-800"
            method="get"
            action="/items"
          >
            <div className="rounded-lg border border-neutral-100 bg-neutral-50/90 p-4 dark:border-neutral-800 dark:bg-neutral-900/35">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Match
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label htmlFor="f-status">Status</Label>
                  <select
                    id="f-status"
                    name="status"
                    defaultValue={initialFilters.status}
                    className={FILTER_SELECT_CLASS}
                  >
                    <option value="">Active queue (hide archived)</option>
                    <option value="new">New</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="approved">Approved</option>
                    <option value="archived">Archived only</option>
                    <option value="all">All statuses (incl. archived)</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="f-cat">Category</Label>
                  <select
                    id="f-cat"
                    name="category"
                    defaultValue={initialFilters.category}
                    className={FILTER_SELECT_CLASS}
                  >
                    <option value="">Any</option>
                    <option value="paper">Paper</option>
                    <option value="award">Award</option>
                    <option value="event">Event</option>
                    <option value="media">Media</option>
                    <option value="funding">Funding</option>
                    <option value="community_update">Community update</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="f-src">Source type</Label>
                  <select
                    id="f-src"
                    name="source_type"
                    defaultValue={initialFilters.source_type}
                    className={FILTER_SELECT_CLASS}
                  >
                    <option value="">Any</option>
                    <option value="pubmed">PubMed</option>
                    <option value="web">Web</option>
                    <option value="lab_website">Lab website</option>
                    <option value="reporter">RePORTER</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="f-entity">Investigator</Label>
                  <select
                    id="f-entity"
                    name="entity"
                    defaultValue={initialFilters.entity}
                    className={FILTER_SELECT_CLASS}
                  >
                    <option value="">Any</option>
                    {entities.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-neutral-100 bg-neutral-50/90 p-4 dark:border-neutral-800 dark:bg-neutral-900/35">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div>
                  <p
                    id="published-range-label"
                    className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
                  >
                    Published date
                  </p>
                  <p className="mt-1 max-w-md text-xs text-neutral-500 dark:text-neutral-400">
                    Presets apply immediately (same as Apply filters). Edit dates for a custom range, then
                    use Apply filters; leave both empty to ignore published date.
                  </p>
                </div>
                <div
                  className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end"
                  role="group"
                  aria-labelledby="published-range-label"
                >
                  {PUBLISHED_PRESETS.map(({ preset, label }) => (
                    <button
                      key={preset}
                      type="button"
                      className={PRESET_PILL_CLASS}
                      onClick={() => applyPublishedPreset(preset)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:max-w-md">
                <div>
                  <Label htmlFor="f-from">From</Label>
                  <Input
                    id="f-from"
                    type="date"
                    name="from"
                    value={publishedFrom}
                    onChange={(e) => setPublishedFrom(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="f-to">To</Label>
                  <Input
                    id="f-to"
                    type="date"
                    name="to"
                    value={publishedTo}
                    onChange={(e) => setPublishedTo(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-neutral-100 pt-4 dark:border-neutral-800 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <Button type="submit" disabled={pending}>
                Apply filters
              </Button>
              <div className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                <Button type="button" variant="ghost" className="h-9 px-2" onClick={saveDefaultFilters}>
                  Save as default
                </Button>
                <span className="text-neutral-300 dark:text-neutral-600" aria-hidden>
                  ·
                </span>
                <Button type="button" variant="ghost" className="h-9 px-2" onClick={loadDefaults}>
                  Load saved
                </Button>
                <span className="text-neutral-300 dark:text-neutral-600" aria-hidden>
                  ·
                </span>
                <Link
                  href="/items"
                  className="inline-flex h-9 items-center rounded-md px-2 text-sm text-neutral-600 underline-offset-4 hover:underline dark:text-neutral-400"
                >
                  Clear all
                </Link>
              </div>
            </div>
          </form>
        ) : null}
      </Card>

      <Card>
        <CollapsiblePanelHeader
          panelId="bulk-panel"
          expanded={bulkOpen}
          onToggle={() => setBulkOpen((o) => !o)}
        >
          Bulk actions
        </CollapsiblePanelHeader>
        {bulkOpen ? (
          <div id="bulk-panel" className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {selected.size} selected · Approve, archive with a reason, set category, or permanently delete.
            </p>
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    const ok = await bulkUpdate({ status: "approved", archive_reason: null });
                    if (ok) {
                      setBulkArchivePanelOpen(false);
                      setBulkArchiveReason("");
                    }
                  }}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={bulkArchivePanelOpen}
                  onClick={() => setBulkArchivePanelOpen(true)}
                >
                  Archive
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={bulkDeleting || bulkArchivePanelOpen}
                  className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                  onClick={() => void bulkDelete()}
                >
                  {bulkDeleting ? "Deleting…" : "Delete permanently"}
                </Button>
                <select
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                  aria-label="Assign category"
                  onChange={(e) => {
                    const v = e.target.value as ItemCategory | "";
                    if (!v) return;
                    void bulkUpdate({ category: v });
                    e.target.value = "";
                  }}
                >
                  <option value="">Set category…</option>
                  <option value="paper">Paper</option>
                  <option value="award">Award</option>
                  <option value="event">Event</option>
                  <option value="media">Media</option>
                  <option value="funding">Funding</option>
                  <option value="community_update">Community update</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {bulkArchivePanelOpen ? (
                <div className="max-w-lg space-y-2 rounded-lg border border-neutral-200 bg-neutral-50/90 p-3 dark:border-neutral-700 dark:bg-neutral-900/40">
                  <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    Why archive?
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[min(100%,12rem)] flex-1">
                      <Label htmlFor="bulk-archive-reason" className="sr-only">
                        Archive reason
                      </Label>
                      <select
                        id="bulk-archive-reason"
                        value={bulkArchiveReason}
                        onChange={(e) => setBulkArchiveReason(e.target.value)}
                        className="w-full rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                      >
                        <option value="">Choose a reason…</option>
                        {ARCHIVE_REASON_OPTIONS.map(({ value, label }) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={!isValidArchiveReason(bulkArchiveReason)}
                      onClick={() => void bulkArchive()}
                    >
                      Confirm archive
                    </Button>
                    <Button type="button" variant="ghost" onClick={cancelBulkArchive}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900/50">
            <tr>
              <th className="w-10 p-2">
                <input
                  type="checkbox"
                  aria-label="Select all on page"
                  checked={sortedItems.length > 0 && selected.size === sortedItems.length}
                  onChange={selectAllOnPage}
                />
              </th>
              <SortableTh
                label="Title"
                columnKey="title"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
              />
              <SortableTh
                label="Investigator"
                columnKey="entity"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
              />
              <SortableTh
                label="Source"
                columnKey="source"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
              />
              <SortableTh
                label="Published"
                columnKey="published"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
              />
              <SortableTh
                label="Status"
                columnKey="status"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
              />
              <SortableTh
                label="Category"
                columnKey="category"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
              />
              <th scope="col" className="p-2 font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-neutral-500">
                  No items for these filters.
                </td>
              </tr>
            ) : (
              sortedItems.map((row) => {
                const te = row.tracked_entities;
                const investigatorProfileUrl = te
                  ? ucsfProfilesUrl(te.first_name, te.last_name)
                  : null;
                return (
                  <Fragment key={row.id}>
                <tr className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      aria-label={`Select ${row.title}`}
                    />
                  </td>
                  <td className="max-w-[280px] p-2">
                    {row.source_url ? (
                      <a
                        href={row.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-neutral-900 underline decoration-neutral-400 underline-offset-2 hover:decoration-neutral-600 dark:text-neutral-100 dark:decoration-neutral-500 dark:hover:decoration-neutral-400"
                      >
                        {row.title}
                      </a>
                    ) : (
                      <span className="font-medium text-neutral-800 dark:text-neutral-200" title="No source URL">
                        {row.title}
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-neutral-600 dark:text-neutral-400">
                    {!te ? (
                      "—"
                    ) : investigatorProfileUrl ? (
                      <a
                        href={investigatorProfileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-neutral-400 underline-offset-2 hover:decoration-neutral-600 dark:decoration-neutral-500 dark:hover:decoration-neutral-400"
                      >
                        {te.name}
                      </a>
                    ) : (
                      <span>{te.name}</span>
                    )}
                  </td>
                  <td className="p-2">
                    <SourceTypeTag type={row.source_type} />
                  </td>
                  <td className="p-2 text-neutral-600 dark:text-neutral-400">
                    {row.published_at
                      ? new Date(row.published_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="p-2">
                    <StatusTag status={row.status} archiveReason={row.archive_reason} />
                  </td>
                  <td className="p-2">
                    <CategoryTag category={row.category} />
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/items/${row.id}`}
                        className="text-sm font-medium text-neutral-700 underline-offset-2 hover:underline dark:text-neutral-300"
                      >
                        Edit
                      </Link>
                      {row.status !== "archived" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setRowArchiveId(row.id);
                            setRowArchiveReason("");
                          }}
                          title="Archive this item"
                          aria-label={`Archive ${row.title}`}
                          aria-expanded={rowArchiveId === row.id}
                          className={`inline-flex shrink-0 rounded p-1 text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/50 dark:hover:text-red-300 ${
                            rowArchiveId === row.id
                              ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                              : ""
                          }`}
                        >
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
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            <line x1="10" x2="10" y1="11" y2="17" />
                            <line x1="14" x2="14" y1="11" y2="17" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
                    {rowArchiveId === row.id ? (
                      <tr className="border-t border-neutral-100 bg-neutral-50/95 dark:border-neutral-800 dark:bg-neutral-900/50">
                        <td colSpan={8} className="px-4 py-3">
                          <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                            Archive this item — pick a reason
                          </p>
                          <div className="mt-2 flex flex-wrap items-end gap-2">
                            <div className="min-w-[min(100%,14rem)]">
                              <Label htmlFor={`row-archive-reason-${row.id}`} className="sr-only">
                                Archive reason
                              </Label>
                              <select
                                id={`row-archive-reason-${row.id}`}
                                value={rowArchiveReason}
                                onChange={(e) => setRowArchiveReason(e.target.value)}
                                className="w-full rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                              >
                                <option value="">Choose a reason…</option>
                                {ARCHIVE_REASON_OPTIONS.map(({ value, label }) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <Button
                              type="button"
                              variant="danger"
                              disabled={!isValidArchiveReason(rowArchiveReason)}
                              onClick={() => void confirmRowArchive()}
                            >
                              Confirm archive
                            </Button>
                            <Button type="button" variant="ghost" onClick={closeRowArchive}>
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
