"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { ItemCategory, SourceType, Summary } from "@/types/database";
import { SummaryEditor } from "@/components/summary-editor";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CategoryTag, SourceTypeTag } from "@/app/(main)/items/queue-cell-tags";
import { ucsfProfilesUrl } from "@/lib/ucsf-profiles-url";
import { formatYearMonthLabel } from "@/lib/digest-month";
import {
  type DigestVisualBundle,
  activeVisualImageDataUrl,
  getActiveCandidate,
  hasActiveVisual,
} from "@/lib/digest-visual-types";
import { mergeWhyIntoBlurb, parseBlurbJson } from "@/lib/blurb-content";
import { DigestVisualPanel } from "@/components/digest-visual-panel";
import {
  buildDigestItemSortMap,
  sortOutputPreviewReferenceRows,
} from "@/lib/digest-reference-sort";

function CollapseChevron({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-[color:var(--muted-foreground)] transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Clipboard copy icon — explicit pixel size and shrink-0 so it stays visible in compact buttons. */
function ReferencesCopyIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`pointer-events-none shrink-0 text-[color:var(--foreground)] ${className}`}
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function StatusPill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-[color:var(--border)]/90 bg-[color:var(--muted)]/55 px-2.5 py-0.5 text-[11px] font-semibold text-[color:var(--muted-foreground)] ${className}`}
    >
      {children}
    </span>
  );
}

/** One row in the digest drafting workspace: title, optional status, expand/collapse. */
type BulkRefResult = {
  source_item_id: string;
  title: string;
  reference?: string;
  error?: string;
};

const AI_MODEL_OPTIONS = [
  { value: "", label: "Default" },
  { value: "gpt-4o-mini", label: "GPT-4o mini" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4.1", label: "GPT-4.1" },
] as const;

function extractJournalFromRawSummary(rawSummary: string | null): string | null {
  if (!rawSummary) return null;
  const part = rawSummary
    .split(" · ")
    .map((x) => x.trim())
    .find((x) => x.toLowerCase().startsWith("journal:"));
  if (!part) return null;
  const v = part.slice("journal:".length).trim();
  return v || null;
}

function formatBulkReferenceList(
  results: BulkRefResult[],
  opts: { numberedLines: boolean; monthLabel: string },
): string {
  const header = `References — ${opts.monthLabel}`;
  const lines = formatReferenceLines(results, opts.numberedLines);
  return [header, "", ...lines].join("\n");
}

function formatReferenceLines(results: BulkRefResult[], numberedLines: boolean): string[] {
  if (numberedLines) {
    return results.map((r, idx) =>
      r.reference ? `${idx + 1}. ${r.reference}` : `${idx + 1}. ${r.title} — [${r.error ?? "Failed"}]`,
    );
  }
  const ok = results.filter((r) => r.reference);
  const bad = results.filter((r) => r.error);
  const lines: string[] = [...ok.map((r) => r.reference!)];
  if (bad.length > 0) {
    lines.push("", "--- Could not generate ---");
    for (const r of bad) {
      lines.push(`${r.title}: ${r.error ?? "Failed"}`);
    }
  }
  return lines;
}

type RefCategoryKey = "papers" | "funding";

type DigestWorkflowStatus =
  | "ready"
  | "not_started"
  | "needs_review"
  | "missing_visual"
  | "missing_brief";

function clampText(s: string, max = 180): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function digestSummaryPreview(summary: Summary | null): { headline: string; blurb: string; words: number } {
  if (!summary) return { headline: "No summary generated yet", blurb: "", words: 0 };
  const raw = (summary.edited_text ?? summary.generated_text ?? "").trim();
  const parsed = parseBlurbJson(raw);
  const headline = clampText(parsed?.headline?.trim() || "Untitled summary", 120);
  const blurb = clampText(parsed?.blurb?.trim() || raw, 240);
  const words = blurb ? blurb.split(/\s+/).filter(Boolean).length : 0;
  return { headline, blurb, words };
}

/** Full headline + body for clipboard (preview uses clamped strings). */
function digestSummaryClipboardText(summary: Summary | null): string {
  if (!summary) return "";
  const raw = (summary.edited_text ?? summary.generated_text ?? "").trim();
  if (!raw) return "";
  const parsed = parseBlurbJson(raw);
  if (!parsed) return raw;
  const merged = mergeWhyIntoBlurb(parsed);
  const headline = merged.headline?.trim() ?? "";
  const blurb = merged.blurb?.trim() ?? "";
  return `${headline}\n\n${blurb}`.trim();
}

function digestWorkflowStatus(item: DigestItemPayload, summaries: Summary[]): DigestWorkflowStatus {
  const hasVisual = hasActiveVisual(item.digest_cover);
  const hasDraft = summaries.length > 0;
  const briefSaved = summaries.some((s) => Boolean(s.edited_text?.trim()));
  if (hasVisual && briefSaved) return "ready";
  if (!hasVisual && !hasDraft) return "not_started";
  if (!hasVisual && hasDraft) return "missing_visual";
  if (hasVisual && !hasDraft) return "missing_brief";
  return "needs_review";
}

function digestQueueChecklist(item: DigestItemPayload, summaries: Summary[]): ReactNode {
  const hasVisual = hasActiveVisual(item.digest_cover);
  const hasDraft = summaries.length > 0;
  const briefSaved = summaries.some((s) => Boolean(s.edited_text?.trim()));
  const summaryLabel = !hasDraft ? "Missing" : briefSaved ? "Ready" : "Draft";
  const visualLabel = hasVisual ? "Selected" : "Missing";
  const reviewLabel = !hasDraft ? "—" : briefSaved ? "Reviewed" : "Needs review";
  const digestLabel = hasVisual && briefSaved && hasDraft ? "Ready" : "Not ready";

  const pill = (label: string, value: string, tone: "neutral" | "ok" | "warn" | "action") => {
    const toneClass =
      tone === "ok"
        ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
        : tone === "warn"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
          : tone === "action"
            ? "border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-200"
            : "border-[color:var(--border)]/60 bg-[color:var(--background)]/80 text-[color:var(--muted-foreground)]";
    return (
      <span
        key={label}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneClass}`}
      >
        <span className="text-[color:var(--muted-foreground)]/90">{label}:</span>
        {value}
      </span>
    );
  };

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[color:var(--border)]/35 pb-3"
      aria-label="Digest workflow status"
    >
      {pill("Summary", summaryLabel, !hasDraft ? "warn" : briefSaved ? "ok" : "neutral")}
      {pill("Visual", visualLabel, hasVisual ? "ok" : "warn")}
      {pill("Review", reviewLabel, reviewLabel === "Needs review" ? "action" : "neutral")}
      {pill("Digest", digestLabel, digestLabel === "Ready" ? "ok" : "neutral")}
    </div>
  );
}

function digestStatusPill(status: DigestWorkflowStatus): ReactNode {
  switch (status) {
    case "ready":
      return <StatusPill className="border-emerald-500/45 bg-emerald-500/12 text-emerald-800 dark:text-emerald-300">Ready</StatusPill>;
    case "missing_visual":
      return <StatusPill className="border-amber-500/45 bg-amber-500/12 text-amber-800 dark:text-amber-300">Missing visual</StatusPill>;
    case "missing_brief":
      return <StatusPill className="border-amber-500/45 bg-amber-500/12 text-amber-800 dark:text-amber-300">Missing summary</StatusPill>;
    case "needs_review":
      return <StatusPill className="border-sky-500/45 bg-sky-500/12 text-sky-800 dark:text-sky-300">Needs review</StatusPill>;
    case "not_started":
    default:
      return <StatusPill>Not started</StatusPill>;
  }
}

function hasDiscoveredSourceCandidate(bundle: DigestVisualBundle | null): boolean {
  if (!bundle) return false;
  return bundle.candidates.some((c) => c.type === "source" && c.kind === "url" && Boolean(c.url));
}

type DigestRefCategory = {
  key: RefCategoryKey;
  title: string;
  description: string;
  items: DigestItemPayload[];
};

function DigestSignalRow({
  item,
  selected,
  disabled,
  onToggle,
}: {
  item: DigestItemPayload;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const paperJournal = item.category === "paper" ? extractJournalFromRawSummary(item.raw_summary) : null;
  const dateLabel = new Date(item.published_at ?? item.found_at).toLocaleDateString();
  const investigatorLabel =
    item.investigators.length > 0
      ? `${item.investigators[0]!.name}${item.investigators.length > 1 ? ` +${item.investigators.length - 1}` : ""}`
      : item.pi_name ?? "Unassigned";

  return (
    <li>
      <label
        className={`group flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-all ${
          selected
            ? "border-[color:var(--accent)]/65 bg-[color:var(--accent)]/14 shadow-[0_10px_28px_-20px_rgba(127,86,76,0.95)]"
            : "border-[color:var(--border)]/40 bg-[color:var(--background)]/92 hover:border-[color:var(--border)]/80 hover:bg-[color:var(--muted)]/18"
        }`}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          disabled={disabled}
          className="mt-1 shrink-0 rounded border-[color:var(--border)]"
        />
        <span className="min-w-0 flex-1">
          <Link
            href={`/items/${item.id}`}
            className="line-clamp-2 text-[15px] font-semibold leading-snug text-[color:var(--foreground)] underline-offset-2 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {item.title}
          </Link>
          <span className="mt-1 block text-[11px] text-[color:var(--muted-foreground)]/95">
            {dateLabel}
            {paperJournal ? ` · ${paperJournal}` : ""}
            {investigatorLabel ? ` · ${investigatorLabel}` : ""}
          </span>
          <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11px]">
            <SourceTypeTag type={item.source_type} />
            <CategoryTag category={item.category} />
          </span>
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            selected
              ? "border border-[color:var(--accent)]/55 bg-[color:var(--accent)]/20 text-[color:var(--foreground)]"
              : "border border-[color:var(--border)]/60 bg-[color:var(--muted)]/40 text-[color:var(--muted-foreground)]"
          }`}
        >
          {selected ? "Included" : "Excluded"}
        </span>
      </label>
    </li>
  );
}

function DigestCategoryCard({
  category,
  expanded,
  generatedCount,
  selectedCount,
  running,
  selectedIds,
  onExpand,
  onToggleItem,
  onSelectAll,
  onSelectNone,
  onGenerateCategory,
}: {
  category: DigestRefCategory;
  expanded: boolean;
  generatedCount: number;
  selectedCount: number;
  running: boolean;
  selectedIds: Set<string>;
  onExpand: () => void;
  onToggleItem: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onGenerateCategory: () => void;
}) {
  const allSelected = category.items.length > 0 && selectedCount === category.items.length;
  return (
    <Card className={`overflow-hidden rounded-2xl border shadow-sm transition-all ${
      expanded
        ? "border-[color:var(--accent)]/55 bg-[color:var(--background)]/92 shadow-[0_14px_34px_-24px_rgba(51,31,22,0.65)]"
        : "border-[color:var(--border)]/70 bg-[color:var(--background)]/80"
    }`}>
      <button
        type="button"
        onClick={onExpand}
        className={`flex w-full items-start justify-between gap-3 border-b px-4 py-3.5 text-left transition-colors ${
          expanded
            ? "border-[color:var(--accent)]/35 bg-[color:var(--accent)]/8"
            : "border-[color:var(--border)]/50 bg-[color:var(--muted)]/24 hover:bg-[color:var(--muted)]/34"
        }`}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-[color:var(--foreground)]">{category.title}</p>
          <p className="mt-0.5 text-[11px] text-[color:var(--muted-foreground)]">{category.description}</p>
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-1.5 text-[11px]">
          <StatusPill>{category.items.length} total</StatusPill>
          <StatusPill className="border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-[color:var(--foreground)]">
            {selectedCount} selected
          </StatusPill>
          <StatusPill className={generatedCount > 0 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : ""}>
            {generatedCount > 0 ? `${generatedCount} generated` : "Not generated"}
          </StatusPill>
          <CollapseChevron open={expanded} />
        </div>
      </button>
      {expanded ? (
        <div className="space-y-3.5 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--border)]/65 bg-[color:var(--muted)]/26 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs text-[color:var(--muted-foreground)]">
              <button
                type="button"
                onClick={onSelectAll}
                disabled={running || allSelected}
                className="rounded-md px-2 py-1 font-medium hover:bg-[color:var(--muted)]/50 disabled:opacity-40"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={onSelectNone}
                disabled={running || selectedCount === 0}
                className="rounded-md px-2 py-1 font-medium hover:bg-[color:var(--muted)]/50 disabled:opacity-40"
              >
                Select none
              </button>
              <span>{selectedCount} included</span>
            </div>
            <Button
              type="button"
              onClick={onGenerateCategory}
              disabled={running || selectedCount === 0}
              className="h-8 px-3 text-xs"
            >
              {running ? "Generating..." : "Generate References"}
            </Button>
          </div>
          {category.items.length > 0 ? (
            <ul className="max-h-[32rem] space-y-2.5 overflow-y-auto pr-1">
              {category.items.map((item) => (
                <DigestSignalRow
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  disabled={running}
                  onToggle={() => onToggleItem(item.id)}
                />
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-[color:var(--border)]/70 px-3 py-6 text-center text-sm text-[color:var(--muted-foreground)]">
              No signals in this category for this month.
            </p>
          )}
        </div>
      ) : null}
    </Card>
  );
}

export type DigestItemPayload = {
  id: string;
  title: string;
  published_at: string | null;
  found_at: string;
  category: ItemCategory | null;
  source_type: SourceType;
  source_url: string | null;
  raw_summary: string | null;
  /** Primary + junction-linked watchlist investigators, sorted by name */
  investigators: { id: string; name: string; first_name: string; last_name: string }[];
  /** Primary `source_items.tracked_entity_id` (e.g. funding: contact / lead PI). */
  primary_tracked_entity_id: string | null;
  /** For papers, PubMed co–last / co–corresponding (second author from the end) when available. */
  penultimate_author_name: string | null;
  pi_name: string | null;
  /** Image snapshot bundle: source, schematic, and stock candidates; legacy rows are upgraded on read. */
  digest_cover: DigestVisualBundle | null;
  summaries: Summary[];
};

function DigestItemRow({
  item,
  model,
  expanded,
  onToggleExpanded,
}: {
  item: DigestItemPayload;
  model: string;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const router = useRouter();
  const [summaries, setSummaries] = useState<Summary[]>(item.summaries);
  const [genStyle, setGenStyle] = useState<string>("newsletter");
  const [generating, setGenerating] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(item.summaries.length > 0);
  const [illustrating, setIllustrating] = useState(false);
  const [summariesSectionOpen, setSummariesSectionOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const activeSummary = summaries[0] ?? null;
  const briefReady = summaries.some((s) => Boolean(s.edited_text?.trim()));
  const workflowStatus = digestWorkflowStatus(item, summaries);
  const briefPreview = digestSummaryPreview(activeSummary);

  const refreshSummaries = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("summaries")
      .select("*")
      .eq("source_item_id", item.id)
      .order("created_at", { ascending: false });
    if (!error && data) setSummaries(data as Summary[]);
  }, [item.id]);

  async function generateSummary() {
    setGenerating(true);
    const hadExisting = summaries.length > 0;
    try {
      const res = await fetch("/api/generate-blurb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_item_id: item.id,
          style: genStyle,
          model: model || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; record?: Summary };
      if (!res.ok) {
        throw new Error(data.error ?? "Request failed");
      }
      toast.success(hadExisting ? "Summary regenerated" : "Summary drafted");
      setSummariesSectionOpen(true);
      setSummaryOpen(true);
      await refreshSummaries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function archiveSignal() {
    if (!confirm("Archive this signal? You can still view it later in Signals with status = Archived.")) {
      return;
    }
    setArchiving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("source_items")
        .update({ status: "archived", archive_reason: "other" })
        .eq("id", item.id);
      if (error) throw error;
      toast.success("Signal archived");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not archive item");
    } finally {
      setArchiving(false);
    }
  }

  const dateLabel = item.published_at
    ? new Date(item.published_at).toLocaleDateString()
    : `Found ${new Date(item.found_at).toLocaleDateString()} (no publish date)`;
  const sourceLabel = item.source_type === "pubmed" ? "PubMed" : item.source_type.replace(/_/g, " ");
  const piListedSeparately =
    Boolean(item.pi_name) &&
    item.investigators.length > 0 &&
    !item.investigators.some(
      (inv) => inv.name.trim().toLowerCase() === (item.pi_name ?? "").trim().toLowerCase(),
    );

  async function copyBriefPreview() {
    const text = digestSummaryClipboardText(activeSummary);
    if (!text) {
      toast.error("No summary to copy yet.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Summary copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  async function copySignalLink() {
    try {
      const link = item.source_url ?? `${window.location.origin}/items/${item.id}`;
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!actionsMenuRef.current?.contains(event.target as Node)) {
        setActionsMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionsMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [actionsMenuOpen]);

  const imageSrc = activeVisualImageDataUrl(getActiveCandidate(item.digest_cover));

  return (
    <Card
      className={`min-w-0 overflow-hidden border transition-all ${
        expanded
          ? "border-[color:var(--accent)]/55 bg-[color:var(--background)]/98 shadow-[0_18px_48px_-32px_rgba(67,42,33,0.45)]"
          : "border-[color:var(--border)]/85 bg-[color:var(--card)]/95 shadow-[0_12px_34px_-30px_rgba(44,28,22,0.72)]"
      }`}
    >
      <div className="space-y-3.5 p-4 sm:p-[1.125rem]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {digestStatusPill(workflowStatus)}
              <StatusPill>{sourceLabel}</StatusPill>
              <StatusPill>{dateLabel}</StatusPill>
            </div>
          <h3 className="text-xl font-semibold leading-snug tracking-tight text-[color:var(--foreground)]">
            <Link href={`/items/${item.id}`} className="hover:underline">
              {item.title}
            </Link>
          </h3>
          <p className="mt-1.5 text-sm leading-snug text-[color:var(--muted-foreground)]">
            {item.investigators.length > 0 ? (
              <>
                {item.investigators.map((inv, i) => {
                  const profileUrl = ucsfProfilesUrl(inv.first_name, inv.last_name);
                  return (
                    <Fragment key={inv.id}>
                      {i > 0 ? (
                        <span className="text-[color:var(--muted-foreground)]/45">, </span>
                      ) : null}
                      {profileUrl ? (
                        <a
                          href={profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 transition-colors hover:text-[color:var(--foreground)]"
                        >
                          {inv.name}
                        </a>
                      ) : (
                        <span>{inv.name}</span>
                      )}
                    </Fragment>
                  );
                })}
                {piListedSeparately ? (
                  <>
                    <span className="text-[color:var(--muted-foreground)]/50"> · </span>
                    <span className="text-[color:var(--muted-foreground)]/90">
                      Last author: {item.pi_name}
                    </span>
                  </>
                ) : null}
              </>
            ) : item.pi_name ? (
              <span>{item.pi_name}</span>
            ) : (
              <span>Unassigned</span>
            )}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-[color:var(--muted-foreground)]">
            <SourceTypeTag type={item.source_type} />
            <CategoryTag category={item.category} />
          </div>
          </div>
          <div className="relative shrink-0" ref={actionsMenuRef}>
            <div className="inline-flex h-9 items-stretch overflow-hidden rounded-xl border border-[color:var(--border)]/65 bg-[color:var(--background)]/85 text-[color:var(--foreground)]/85 shadow-none">
              {item.source_url ? (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noreferrer"
                  title="Open source"
                  aria-label="Open source"
                  className="inline-flex h-full items-center gap-1 px-2 text-[13px] font-medium text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M15 3h6v6" />
                    <path d="M10 14 21 3" />
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  </svg>
                  <span className="hidden sm:inline">Open</span>
                  <span className="sr-only sm:hidden">Open source</span>
                </a>
              ) : (
                <Link
                  href={`/items/${item.id}`}
                  title="Open record"
                  aria-label="Open record"
                  className="inline-flex h-full items-center gap-1 px-2 text-[13px] font-medium text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M14 3h7v7" />
                    <path d="M10 14 21 3" />
                    <path d="M5 5v14h14" />
                  </svg>
                  <span className="hidden sm:inline">Open</span>
                  <span className="sr-only sm:hidden">Open record</span>
                </Link>
              )}
              <button
                type="button"
                onClick={onToggleExpanded}
                aria-expanded={expanded}
                title={expanded ? "Collapse" : "Expand"}
                aria-label={expanded ? "Collapse details" : "Expand details"}
                className="inline-flex h-full items-center gap-1 border-l border-[color:var(--border)]/60 px-2 text-[13px] font-medium text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              >
                <CollapseChevron open={expanded} />
                <span className="hidden sm:inline">{expanded ? "Collapse" : "Expand"}</span>
              </button>
              <button
                type="button"
                onClick={() => setActionsMenuOpen((v) => !v)}
                aria-expanded={actionsMenuOpen}
                aria-haspopup="menu"
                title="More actions"
                aria-label="More actions"
                className="inline-flex h-full items-center gap-1 border-l border-[color:var(--border)]/60 px-2 text-[13px] font-medium text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden
                >
                  <circle cx="5" cy="12" r="1.9" />
                  <circle cx="12" cy="12" r="1.9" />
                  <circle cx="19" cy="12" r="1.9" />
                </svg>
                <span className="hidden sm:inline">More</span>
              </button>
            </div>
            {actionsMenuOpen ? (
              <div
                role="menu"
                aria-label="Signal actions"
                className="absolute right-0 top-[calc(100%+0.45rem)] z-30 min-w-[12.5rem] overflow-hidden rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--background)]/98 p-1.5 shadow-[0_18px_30px_-20px_rgba(49,31,24,0.7)]"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionsMenuOpen(false);
                    void copyBriefPreview();
                  }}
                  disabled={!activeSummary}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[color:var(--foreground)]/90 transition-colors hover:bg-[color:var(--muted)]/35 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ReferencesCopyIcon className="h-4 w-4 text-current" />
                  Copy summary
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionsMenuOpen(false);
                    void copySignalLink();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[color:var(--foreground)]/90 transition-colors hover:bg-[color:var(--muted)]/35"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l2.12-2.12a5 5 0 0 0-7.07-7.07L11.3 5.64" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54L4.34 12.6a5 5 0 1 0 7.07 7.07l1.27-1.27" />
                  </svg>
                  Copy link
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionsMenuOpen(false);
                    void archiveSignal();
                  }}
                  disabled={archiving || generating || illustrating}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[#8f4d45] transition-colors hover:bg-[#f2dfd9] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="15"
                    height="15"
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
                  </svg>
                  Archive signal
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {!expanded ? (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <div className="grid gap-3.5 rounded-2xl border border-[color:var(--border)]/75 bg-[color:var(--background)]/80 p-3 md:grid-cols-[minmax(0,1fr)_minmax(11rem,28%)]">
            <div className="min-w-0 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">Summary preview</p>
              <p className="line-clamp-1 text-sm font-semibold leading-snug text-[color:var(--foreground)]">{briefPreview.headline}</p>
              <p className="line-clamp-1 text-sm leading-relaxed text-[color:var(--muted-foreground)]">
                {briefPreview.blurb || "No summary generated yet. Draft one when ready."}
              </p>
            </div>
            <div className="relative aspect-video w-full min-w-0 overflow-hidden rounded-xl border border-[color:var(--border)]/70 bg-[#faf6ef]">
              {imageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageSrc}
                  alt=""
                  className="box-border h-full w-full object-contain object-center"
                  decoding="async"
                />
              ) : (
                <div className="flex min-h-[4.5rem] w-full items-center justify-center px-3 text-center text-xs font-medium text-[color:var(--muted-foreground)]">
                  No visual generated yet
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {expanded ? (
        <div className="border-t border-[color:var(--border)]/45 bg-[color:var(--muted)]/6 px-4 py-4 sm:px-5">
          {digestQueueChecklist(item, summaries)}
          <div className="mt-4 grid items-start gap-6 lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.14fr)]">
            <div className="min-w-0 space-y-5">
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted-foreground)]">
                    Summary
                  </h4>
                  <button
                    type="button"
                    onClick={copyBriefPreview}
                    disabled={!activeSummary}
                    className="text-[11px] font-medium text-[color:var(--muted-foreground)] underline-offset-2 transition-colors hover:text-[color:var(--foreground)] hover:underline disabled:pointer-events-none disabled:opacity-40"
                  >
                    Copy
                  </button>
                </div>
                <div className="rounded-lg border border-[color:var(--border)]/45 bg-[color:var(--background)]/55 px-3 py-3 sm:px-4">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[color:var(--muted-foreground)]">
                    <StatusPill className="py-0 text-[10px]">{activeSummary?.style ?? "No channel"}</StatusPill>
                    <span>{briefPreview.words} words</span>
                  </div>
                  <p className="text-base font-semibold leading-snug text-[color:var(--foreground)]">{briefPreview.headline}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--foreground)]/90">
                    {briefPreview.blurb || "No summary generated yet. Draft one when ready."}
                  </p>
                </div>
              </div>
              <div className="h-px bg-[color:var(--border)]/35" aria-hidden />
              <div>
                <button
                  type="button"
                  onClick={() => setSummariesSectionOpen((o) => !o)}
                  aria-expanded={summariesSectionOpen}
                  className="flex w-full items-center justify-between gap-2 rounded-lg py-1.5 text-left transition-colors hover:bg-[color:var(--muted)]/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                >
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-[color:var(--foreground)]">Refine summary</span>
                    <span className="mt-0.5 block text-xs text-[color:var(--muted-foreground)]">
                      Channel, length, and AI-assisted edits.
                    </span>
                  </div>
                  <CollapseChevron open={summariesSectionOpen} />
                </button>
                {summariesSectionOpen ? (
                  <div className="mt-3 space-y-3 pl-0.5">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-end">
                      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-[14rem]">
                        <span className="text-[11px] font-medium text-[color:var(--muted-foreground)]">Channel</span>
                        <Select
                          value={genStyle}
                          onChange={(e) => setGenStyle(e.target.value)}
                          className="w-full"
                          aria-label="Summary format"
                        >
                          <option value="newsletter">Newsletter</option>
                          <option value="linkedin">LinkedIn</option>
                          <option value="bluesky_x">Social Media</option>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        onClick={generateSummary}
                        disabled={generating || archiving || illustrating}
                        className="h-8 whitespace-nowrap px-3 text-xs"
                      >
                        {generating ? "Drafting…" : summaries.length > 0 ? "Regenerate" : "Draft summary"}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setSummaryOpen((o) => !o)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          summaryOpen
                            ? "border-[color:var(--accent)]/45 bg-[color:var(--accent)]/10 text-[color:var(--foreground)]"
                            : "border-[color:var(--border)]/70 bg-transparent text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                        }`}
                      >
                        {summaryOpen ? "Hide editor" : "Show editor"}
                      </button>
                    </div>
                    {summaryOpen ? (
                      <div className="w-full min-w-0 pt-1">
                        {summaries.length === 0 ? (
                          <p className="py-4 text-center text-sm text-[color:var(--muted-foreground)]">
                            No draft yet. Pick a channel and tap{" "}
                            <span className="font-medium text-[color:var(--foreground)]">Draft summary</span>.
                          </p>
                        ) : (
                          <SummaryEditor
                            key={summaries[0]!.id}
                            summary={summaries[0]!}
                            onSaved={refreshSummaries}
                            variant="embedded"
                            onRequestClose={() => setSummaryOpen(false)}
                          />
                        )}
                      </div>
                    ) : (
                      <p className="text-xs leading-relaxed text-[color:var(--muted-foreground)]">
                        Open the editor to lock in digest-ready copy.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="min-w-0 xl:border-l xl:border-[color:var(--border)]/35 xl:pl-6">
              <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted-foreground)]">
                Visual
              </h4>
              <DigestVisualPanel
                digestQueueLayout
                sourceItemId={item.id}
                bundle={item.digest_cover}
                busy={illustrating}
                onStarted={() => setIllustrating(true)}
                onComplete={() => {
                  setIllustrating(false);
                  router.refresh();
                }}
                disabled={generating || archiving}
              />
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

type DigestQueueFilter = "all" | "needs_work" | "ready" | "missing_visual" | "missing_brief";

function matchesDigestFilter(status: DigestWorkflowStatus, filter: DigestQueueFilter): boolean {
  if (filter === "all") return true;
  if (filter === "ready") return status === "ready";
  if (filter === "missing_visual") return status === "missing_visual";
  if (filter === "missing_brief") return status === "missing_brief";
  return status !== "ready";
}

function digestFilterLabel(filter: DigestQueueFilter): string {
  switch (filter) {
    case "needs_work":
      return "Needs work";
    case "ready":
      return "Ready";
    case "missing_visual":
      return "Missing visual";
    case "missing_brief":
      return "Missing summary";
    case "all":
    default:
      return "All";
  }
}

export function MonthlyDigestView({
  monthLabel,
  items,
  selectedMonth,
  minMonth,
  maxMonth,
}: {
  monthLabel: string;
  items: DigestItemPayload[];
  selectedMonth?: string;
  minMonth?: string;
  maxMonth?: string;
}) {
  const router = useRouter();
  const [monthInput, setMonthInput] = useState(selectedMonth ?? "");
  const [aiModel, setAiModel] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"copy_illustrator" | "references">(
    "copy_illustrator",
  );
  const [queueFilter, setQueueFilter] = useState<DigestQueueFilter>("all");
  const [expandedDigestItemId, setExpandedDigestItemId] = useState<string | null>(items[0]?.id ?? null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [numberedLines, setNumberedLines] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<RefCategoryKey>>(
    () => new Set<RefCategoryKey>(["papers"]),
  );
  /** Category the sticky “Generate selected” action targets (last interacted). */
  const [stickyGenerateTarget, setStickyGenerateTarget] = useState<RefCategoryKey>("papers");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<RefCategoryKey | "all">("all");
  const [runningCategory, setRunningCategory] = useState<RefCategoryKey | null>(null);
  const [statusLine, setStatusLine] = useState("");
  const paperItems = useMemo(() => items.filter((item) => item.category === "paper"), [items]);
  const fundingItems = useMemo(() => items.filter((item) => item.category === "funding"), [items]);
  const categories = useMemo<DigestRefCategory[]>(
    () => [
      {
        key: "papers",
        title: "Papers",
        description: "Curate publication references and generate citation-ready lines.",
        items: paperItems,
      },
      {
        key: "funding",
        title: "Funding",
        description: "Curate grants and awards for digest references.",
        items: fundingItems,
      },
    ],
    [paperItems, fundingItems],
  );
  const [selectedByCategory, setSelectedByCategory] = useState<Record<RefCategoryKey, Set<string>>>({
    papers: new Set(),
    funding: new Set(),
  });
  const [resultsByCategory, setResultsByCategory] = useState<Record<RefCategoryKey, BulkRefResult[]>>({
    papers: [],
    funding: [],
  });
  const referencesLeftColRef = useRef<HTMLDivElement>(null);
  /** Preview scroll cap follows Papers height when both columns show; Funding accordion does not stretch the preview. */
  const referencesPapersCardWrapRef = useRef<HTMLDivElement>(null);
  const referencesFundingCardWrapRef = useRef<HTMLDivElement>(null);
  const referencesPreviewScrollRef = useRef<HTMLDivElement>(null);
  const sourceDiscoveryAttemptedIdsRef = useRef<Set<string>>(new Set());
  const sourceDiscoveryRunningRef = useRef(false);
  /** Max height (px) for the scrollable reference list — only applied while/after generation so empty preview stays compact. */
  const [referencesPreviewScrollMaxHeightPx, setReferencesPreviewScrollMaxHeightPx] = useState<number | null>(null);

  useEffect(() => {
    if (selectedMonth) setMonthInput(selectedMonth);
  }, [selectedMonth]);
  useEffect(() => {
    setSelectedByCategory({
      papers: new Set(paperItems.map((item) => item.id)),
      funding: new Set(fundingItems.map((item) => item.id)),
    });
    setResultsByCategory({ papers: [], funding: [] });
    setStatusLine("");
  }, [paperItems, fundingItems]);

  const totalSelectedCount = selectedByCategory.papers.size + selectedByCategory.funding.size;
  const totalGeneratedCount = resultsByCategory.papers.length + resultsByCategory.funding.length;
  const queueStats = useMemo(() => {
    const statuses = items.map((item) => digestWorkflowStatus(item, item.summaries));
    return {
      total: items.length,
      ready: statuses.filter((s) => s === "ready").length,
      needsReview: statuses.filter((s) => s === "needs_review").length,
      missingVisual: statuses.filter((s) => s === "missing_visual").length,
      missingBrief: statuses.filter((s) => s === "missing_brief").length,
      notStarted: statuses.filter((s) => s === "not_started").length,
    };
  }, [items]);
  const filteredDigestItems = useMemo(
    () =>
      items.filter((item) => matchesDigestFilter(digestWorkflowStatus(item, item.summaries), queueFilter)),
    [items, queueFilter],
  );
  useEffect(() => {
    if (filteredDigestItems.length === 0) {
      setExpandedDigestItemId(null);
      return;
    }
    if (!expandedDigestItemId || !filteredDigestItems.some((i) => i.id === expandedDigestItemId)) {
      setExpandedDigestItemId(filteredDigestItems[0]!.id);
    }
  }, [filteredDigestItems, expandedDigestItemId]);

  useEffect(() => {
    if (activeTab !== "copy_illustrator") return;
    if (sourceDiscoveryRunningRef.current) return;
    const pending = items.filter(
      (item) =>
        !sourceDiscoveryAttemptedIdsRef.current.has(item.id) &&
        !hasDiscoveredSourceCandidate(item.digest_cover),
    );
    if (pending.length === 0) return;

    sourceDiscoveryRunningRef.current = true;
    let cancelled = false;

    void (async () => {
      let shouldRefresh = false;
      for (const item of pending) {
        sourceDiscoveryAttemptedIdsRef.current.add(item.id);
        try {
          const res = await fetch("/api/digest-visuals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "discover_source",
              source_item_id: item.id,
            }),
          });
          if (res.ok) shouldRefresh = true;
        } catch {
          // Keep silent for background auto-discovery.
        }
        if (cancelled) break;
      }
      sourceDiscoveryRunningRef.current = false;
      if (!cancelled && shouldRefresh) router.refresh();
    })();

    return () => {
      cancelled = true;
      sourceDiscoveryRunningRef.current = false;
    };
  }, [activeTab, items, router]);
  /** Cap scroll region to Papers card bottom (or Funding-only when filtered) while generating or after any references exist. */
  const shouldCapReferencesPreviewScroll = useMemo(
    () => runningCategory !== null || totalGeneratedCount > 0,
    [runningCategory, totalGeneratedCount],
  );

  useLayoutEffect(() => {
    if (activeTab !== "references") {
      setReferencesPreviewScrollMaxHeightPx(null);
      return;
    }
    if (typeof ResizeObserver === "undefined") return;

    const leftEl = referencesLeftColRef.current;
    if (!leftEl) return;

    function measurePreviewScrollMax() {
      if (typeof window === "undefined") return;
      const xl = window.matchMedia("(min-width: 1280px)");
      if (!xl.matches || !shouldCapReferencesPreviewScroll) {
        setReferencesPreviewScrollMaxHeightPx(null);
        return;
      }
      const scrollEl = referencesPreviewScrollRef.current;
      const leftNode = referencesLeftColRef.current;
      if (!scrollEl || !leftNode) {
        setReferencesPreviewScrollMaxHeightPx(null);
        return;
      }
      const scrollRect = scrollEl.getBoundingClientRect();
      const paperWrap = referencesPapersCardWrapRef.current;
      const fundingWrap = referencesFundingCardWrapRef.current;
      let capBottom: number;
      if (activeCategoryFilter === "funding") {
        capBottom = (fundingWrap ?? leftNode).getBoundingClientRect().bottom;
      } else {
        /** Papers card only: Funding accordion height does not change the preview cap. */
        capBottom = (paperWrap ?? leftNode).getBoundingClientRect().bottom;
      }
      /** Extra room below the anchor so the scroll region feels less cramped (still page-scrolls if needed). */
      const previewMaxHeightBonusPx = 737;
      const maxList = Math.floor(capBottom - scrollRect.top + previewMaxHeightBonusPx);
      setReferencesPreviewScrollMaxHeightPx(Math.max(200, maxList));
    }

    const ro = new ResizeObserver(() => measurePreviewScrollMax());
    ro.observe(leftEl);
    window.addEventListener("resize", measurePreviewScrollMax);
    measurePreviewScrollMax();
    const scrollForObserve = referencesPreviewScrollRef.current;
    const cardForObserve = scrollForObserve?.parentElement ?? null;
    if (cardForObserve) ro.observe(cardForObserve);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measurePreviewScrollMax);
    };
  }, [
    activeTab,
    expandedCategories,
    activeCategoryFilter,
    paperItems.length,
    fundingItems.length,
    totalGeneratedCount,
    runningCategory,
    shouldCapReferencesPreviewScroll,
  ]);
  const visibleCategories =
    activeCategoryFilter === "all"
      ? categories
      : categories.filter((category) => category.key === activeCategoryFilter);

  function toggleSelected(categoryKey: RefCategoryKey, itemId: string) {
    setSelectedByCategory((prev) => {
      const next = new Set(prev[categoryKey]);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return { ...prev, [categoryKey]: next };
    });
  }

  function selectAll(categoryKey: RefCategoryKey) {
    const category = categories.find((c) => c.key === categoryKey);
    if (!category) return;
    setSelectedByCategory((prev) => ({
      ...prev,
      [categoryKey]: new Set(category.items.map((item) => item.id)),
    }));
  }

  function selectNone(categoryKey: RefCategoryKey) {
    setSelectedByCategory((prev) => ({ ...prev, [categoryKey]: new Set() }));
  }

  async function runCategoryGeneration(categoryKey: RefCategoryKey) {
    const category = categories.find((c) => c.key === categoryKey);
    if (!category) return;
    const selectedItems = category.items.filter((item) => selectedByCategory[categoryKey].has(item.id));
    if (selectedItems.length === 0) {
      toast.error(`Select at least one ${category.title.toLowerCase()} signal.`);
      return;
    }

    setRunningCategory(categoryKey);
    const out: BulkRefResult[] = [];
    for (let i = 0; i < selectedItems.length; i++) {
      const item = selectedItems[i]!;
      const short = item.title.length > 58 ? `${item.title.slice(0, 58)}…` : item.title;
      setStatusLine(`${category.title}: ${i + 1} / ${selectedItems.length} — ${short}`);
      try {
        const res = await fetch("/api/draft-reference", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_item_id: item.id,
            model: aiModel.trim() || undefined,
          }),
        });
        const data = (await res.json()) as { error?: string; reference?: string };
        if (!res.ok || !data.reference) throw new Error(data.error ?? "Request failed");
        out.push({ source_item_id: item.id, title: item.title, reference: data.reference });
      } catch (e) {
        out.push({
          source_item_id: item.id,
          title: item.title,
          error: e instanceof Error ? e.message : "Failed",
        });
      }
      setResultsByCategory((prev) => ({ ...prev, [categoryKey]: [...out] }));
    }
    setRunningCategory(null);
    setStatusLine("");
    const ok = out.filter((r) => r.reference).length;
    const bad = out.filter((r) => r.error).length;
    toast.success(`${category.title}: ${ok} generated${bad ? `, ${bad} failed` : ""}.`);
  }

  async function runGenerateAllSelectedCategories() {
    const keys = categories
      .filter((category) => selectedByCategory[category.key].size > 0)
      .map((category) => category.key);
    if (keys.length === 0) {
      toast.error("Select at least one signal before generating.");
      return;
    }
    for (const key of keys) {
      await runCategoryGeneration(key);
    }
  }

  function clearGeneratedOutput() {
    setResultsByCategory({ papers: [], funding: [] });
    setStatusLine("");
  }

  const itemSortById = useMemo(() => buildDigestItemSortMap(items), [items]);
  const orderedResultsByCategory = useMemo(
    () =>
      ({
        papers: sortOutputPreviewReferenceRows(resultsByCategory.papers, "papers", itemSortById),
        funding: sortOutputPreviewReferenceRows(resultsByCategory.funding, "funding", itemSortById),
      }) as const,
    [itemSortById, resultsByCategory.papers, resultsByCategory.funding],
  );
  const combinedOutputText = useMemo(() => {
    const lines: string[] = [`References — ${monthLabel}`, ""];
    for (const category of categories) {
      const results = orderedResultsByCategory[category.key];
      if (results.length === 0) continue;
      lines.push(`${category.title}`);
      lines.push(...formatReferenceLines(results, numberedLines));
      lines.push("");
    }
    return lines.join("\n").trim();
  }, [categories, orderedResultsByCategory, numberedLines, monthLabel]);

  async function copyText(text: string, successMsg: string) {
    if (!text.trim()) {
      toast.error("Nothing to copy yet.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMsg);
    } catch {
      toast.error("Copy failed — select text and copy manually.");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Digest for {monthLabel}</h1>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
            Curate, generate, review, and publish from one monthly editorial workflow.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!monthInput) return;
            router.push(`/digest/${monthInput}`);
          }}
          className="surface-subtle flex w-full max-w-sm items-end gap-2 rounded-2xl p-2.5 sm:w-auto sm:min-w-[320px]"
        >
          <label className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
            Month
            <div className="relative mt-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] normal-case">
              <span
                className="pointer-events-none absolute left-3 top-1/2 z-0 max-w-[calc(100%-2.75rem)] -translate-y-1/2 truncate text-base font-normal tracking-[-0.012em] text-[color:var(--foreground)]"
                aria-hidden
              >
                {monthInput ? formatYearMonthLabel(monthInput) : "Select month"}
              </span>
              <input
                type="month"
                name="month"
                value={monthInput}
                onChange={(e) => setMonthInput(e.target.value)}
                min={minMonth}
                max={maxMonth}
                className="relative z-10 mt-0 w-full cursor-pointer rounded-xl border-0 bg-transparent px-3 py-2 text-base text-transparent caret-transparent outline-none focus:ring-0 normal-case"
              />
            </div>
          </label>
          <Button type="submit" className="shrink-0 whitespace-nowrap px-4">
            Go
          </Button>
        </form>
      </div>
      <div
        className="surface-subtle inline-flex w-full items-center gap-1 rounded-xl p-1 sm:w-fit"
        role="tablist"
        aria-label="Digest workspaces"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "copy_illustrator"}
          onClick={() => setActiveTab("copy_illustrator")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "copy_illustrator"
              ? "bg-[color:var(--card)] text-[color:var(--foreground)] shadow-sm"
              : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
          }`}
        >
          Summaries
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "references"}
          onClick={() => setActiveTab("references")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "references"
              ? "bg-[color:var(--card)] text-[color:var(--foreground)] shadow-sm"
              : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
          }`}
        >
          References
        </button>
      </div>
      {items.length === 0 ? (
        <Card>
          <CardTitle>No approved items this month</CardTitle>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
            Approve items in Signals (or adjust published/found dates) so they appear here for this
            month.
          </p>
        </Card>
      ) : (
        <>
          {activeTab === "copy_illustrator" ? (
            <div className="space-y-4">
              <Card className="rounded-xl border-[color:var(--border)]/55 bg-[color:var(--background)]/75 p-3 shadow-none">
                <div className="flex flex-wrap items-start justify-between gap-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ["total", "Total highlights", queueStats.total],
                        ["ready", "Ready", queueStats.ready],
                        ["needs", "Needs review", queueStats.needsReview],
                        ["visual", "Missing visual", queueStats.missingVisual],
                        ["brief", "Missing summary", queueStats.missingBrief],
                      ] as const
                    ).map(([key, label, value]) => (
                      <div
                        key={key}
                        className="min-w-[6.75rem] rounded-lg border border-[color:var(--border)]/50 bg-[color:var(--card)]/70 px-2.5 py-1.5"
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted-foreground)]">
                          {label}
                        </p>
                        <p className="mt-0.5 text-base font-semibold tracking-tight text-[color:var(--foreground)]">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        const first = filteredDigestItems.find(
                          (it) => digestWorkflowStatus(it, it.summaries) !== "ready",
                        );
                        if (first) setExpandedDigestItemId(first.id);
                      }}
                      className="h-7 px-2.5 text-[11px]"
                    >
                      Expand first unfinished
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setExpandedDigestItemId(null)}
                      className="h-7 px-2.5 text-[11px]"
                    >
                      Collapse all
                    </Button>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-[color:var(--border)]/40 pt-2.5">
                  {(["all", "needs_work", "ready", "missing_visual", "missing_brief"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setQueueFilter(f)}
                      className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        queueFilter === f
                          ? "border-[color:var(--accent)]/50 bg-[color:var(--accent)]/12 text-[color:var(--foreground)]"
                          : "border-[color:var(--border)]/60 bg-[color:var(--background)]/60 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                      }`}
                    >
                      {digestFilterLabel(f)}
                    </button>
                  ))}
                </div>
              </Card>
              {filteredDigestItems.length === 0 ? (
                <Card className="rounded-2xl border-dashed border-[color:var(--border)]/70 bg-[color:var(--background)]/65 p-6 text-center">
                  <p className="text-sm text-[color:var(--muted-foreground)]">
                    No highlights match this filter for the selected month.
                  </p>
                </Card>
              ) : (
                <ul className="space-y-4">
                  {filteredDigestItems.map((item) => (
                    <li key={item.id}>
                      <DigestItemRow
                        item={item}
                        model={aiModel}
                        expanded={expandedDigestItemId === item.id}
                        onToggleExpanded={() =>
                          setExpandedDigestItemId((prev) => (prev === item.id ? null : item.id))
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <Card className="rounded-2xl border-[color:var(--border)]/75 bg-[color:var(--background)]/88 p-4 shadow-[0_12px_32px_-26px_rgba(52,31,24,0.75)]">
                <div className="flex flex-wrap items-stretch gap-2.5">
                  {categories.map((category) => (
                    <button
                      key={category.key}
                      type="button"
                      onClick={() => {
                        setActiveCategoryFilter(category.key);
                        setExpandedCategories((prev) => new Set(prev).add(category.key));
                        setStickyGenerateTarget(category.key);
                      }}
                      className={`flex min-h-[5.75rem] flex-col rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                        activeCategoryFilter === category.key
                          ? "border-[color:var(--accent)]/65 bg-[color:var(--accent)]/12 shadow-[0_8px_20px_-18px_rgba(127,86,76,0.95)]"
                          : "border-[color:var(--border)]/75 bg-[color:var(--card)]/92 hover:border-[color:var(--accent)]/45 hover:bg-[color:var(--muted)]/28"
                      }`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted-foreground)]">
                        {category.title}
                      </p>
                      <p className="mt-1 text-base font-semibold tracking-tight text-[color:var(--foreground)]">
                        {selectedByCategory[category.key].size}
                        <span className="ml-1 text-xs font-medium text-[color:var(--muted-foreground)]">
                          of {category.items.length} selected
                        </span>
                      </p>
                      <p className="text-[11px] text-[color:var(--muted-foreground)]">
                        {resultsByCategory[category.key].filter((r) => r.reference).length} generated
                      </p>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setActiveCategoryFilter("all")}
                    className={`flex min-h-[5.75rem] flex-col rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                      activeCategoryFilter === "all"
                        ? "border-[color:var(--accent)]/65 bg-[color:var(--accent)]/12 shadow-[0_8px_20px_-18px_rgba(127,86,76,0.95)]"
                        : "border-[color:var(--border)]/75 bg-[color:var(--card)]/92 hover:border-[color:var(--accent)]/45 hover:bg-[color:var(--muted)]/28"
                    }`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted-foreground)]">
                      Total selected
                    </p>
                    <p className="mt-1 text-base font-semibold tracking-tight text-[color:var(--foreground)]">
                      {totalSelectedCount}
                      <span className="ml-1 text-xs font-medium text-[color:var(--muted-foreground)]">
                        signals
                      </span>
                    </p>
                    <p className="text-[11px] text-[color:var(--muted-foreground)]">
                      {categories.reduce(
                        (n, c) => n + resultsByCategory[c.key].filter((r) => r.reference).length,
                        0,
                      )}{" "}
                      generated
                    </p>
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedSettings((open) => !open)}
                    className="rounded-lg border border-[color:var(--border)]/80 bg-[color:var(--background)]/95 px-2.5 py-1 text-xs font-semibold text-[color:var(--muted-foreground)] transition-colors hover:text-[color:var(--foreground)]"
                  >
                    {showAdvancedSettings ? "Hide generation settings" : "Generation settings"}
                  </button>
                  <label className="flex items-center gap-2 rounded-lg border border-[color:var(--border)]/80 bg-[color:var(--background)]/95 px-2.5 py-1 text-xs font-medium text-[color:var(--muted-foreground)]">
                    <input
                      type="checkbox"
                      checked={numberedLines}
                      onChange={(e) => setNumberedLines(e.target.checked)}
                      className="rounded border-[color:var(--border)]"
                    />
                    Numbered lines
                  </label>
                </div>
                {showAdvancedSettings ? (
                  <div className="mt-3 max-w-sm space-y-1.5 rounded-xl border border-[color:var(--border)]/70 bg-[color:var(--muted)]/28 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
                      AI model
                    </p>
                    <Select
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      aria-label="AI model for reference generation"
                    >
                      {AI_MODEL_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
              </Card>
              <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)]">
                <div ref={referencesLeftColRef} className="min-w-0 space-y-4">
                  {visibleCategories.map((category) => (
                    <div
                      key={category.key}
                      ref={
                        category.key === "papers"
                          ? referencesPapersCardWrapRef
                          : category.key === "funding"
                            ? referencesFundingCardWrapRef
                            : undefined
                      }
                      className="min-w-0"
                    >
                      <DigestCategoryCard
                        category={category}
                        expanded={expandedCategories.has(category.key)}
                        generatedCount={resultsByCategory[category.key].filter((r) => r.reference).length}
                        selectedCount={selectedByCategory[category.key].size}
                        running={runningCategory === category.key}
                        selectedIds={selectedByCategory[category.key]}
                        onExpand={() => {
                          setExpandedCategories((prev) => {
                            const next = new Set(prev);
                            if (next.has(category.key)) next.delete(category.key);
                            else next.add(category.key);
                            return next;
                          });
                          setStickyGenerateTarget(category.key);
                        }}
                        onToggleItem={(id) => toggleSelected(category.key, id)}
                        onSelectAll={() => selectAll(category.key)}
                        onSelectNone={() => selectNone(category.key)}
                        onGenerateCategory={() => void runCategoryGeneration(category.key)}
                      />
                    </div>
                  ))}
                </div>
                <div className="min-w-0 h-fit xl:min-h-0">
                  <Card className="h-fit min-w-0 rounded-2xl border-[color:var(--border)]/75 bg-[color:var(--background)]/92 p-5 shadow-[0_20px_40px_-30px_rgba(43,27,21,0.75)]">
                  <div className="shrink-0 flex items-center justify-between gap-2 border-b border-[color:var(--border)]/55 pb-3.5">
                    <div>
                      <p className="text-base font-semibold tracking-tight text-[color:var(--foreground)]">Output preview</p>
                      <p className="text-xs leading-relaxed text-[color:var(--muted-foreground)]">
                        Review digest-ready references before copy/export.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void copyText(combinedOutputText, "Combined references copied")}
                      disabled={!combinedOutputText}
                      className="h-10 min-h-10 w-10 min-w-10 shrink-0 overflow-visible p-0 leading-none"
                      aria-label="Copy all references"
                      title="Copy all references"
                    >
                      <ReferencesCopyIcon />
                      <span className="sr-only">Copy all references</span>
                    </Button>
                  </div>
                  <div
                    ref={referencesPreviewScrollRef}
                    className={`mt-4 overflow-y-auto pr-1 ${
                      shouldCapReferencesPreviewScroll && referencesPreviewScrollMaxHeightPx != null
                        ? "max-xl:max-h-[min(44rem,88vh)] xl:max-h-none"
                        : shouldCapReferencesPreviewScroll
                          ? "max-h-[min(44rem,88vh)]"
                          : ""
                    }`}
                    style={
                      shouldCapReferencesPreviewScroll && referencesPreviewScrollMaxHeightPx != null
                        ? { maxHeight: referencesPreviewScrollMaxHeightPx }
                        : undefined
                    }
                  >
                    {categories.map((category) => {
                      const lines = formatReferenceLines(orderedResultsByCategory[category.key], numberedLines);
                      if (lines.length === 0) return null;
                      return (
                        <section key={category.key} className="border-b border-[color:var(--border)]/45 py-4 first:pt-0 last:border-b-0 last:pb-0">
                          <div className="mb-2.5 flex items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold tracking-tight text-[color:var(--foreground)]">{category.title}</h3>
                            <button
                              type="button"
                              onClick={() =>
                                void copyText(
                                  formatBulkReferenceList(orderedResultsByCategory[category.key], {
                                    numberedLines,
                                    monthLabel,
                                  }),
                                  `${category.title} references copied`,
                                )
                              }
                              className="inline-flex h-9 min-h-9 w-9 min-w-9 shrink-0 items-center justify-center overflow-visible rounded-md border border-[color:var(--border)]/70 bg-[color:var(--background)]/85 leading-none text-[color:var(--foreground)] transition-colors hover:text-[color:var(--foreground)]"
                              aria-label={`Copy ${category.title} references`}
                              title={`Copy ${category.title} references`}
                            >
                              <ReferencesCopyIcon />
                            </button>
                          </div>
                          <ol className="space-y-2.5 text-sm leading-relaxed text-[color:var(--foreground)]">
                            {lines.map((line, index) => (
                              <li key={`${category.key}-${index}`} className="break-words rounded-lg border border-[color:var(--border)]/45 bg-[color:var(--background)]/96 px-3 py-2.5 font-mono text-[13px] leading-relaxed text-[color:var(--foreground)]/95">
                                {line}
                              </li>
                            ))}
                          </ol>
                        </section>
                      );
                    })}
                    {totalGeneratedCount === 0 ? (
                      <p className="rounded-xl border border-dashed border-[color:var(--border)]/75 bg-[color:var(--muted)]/12 px-3 py-8 text-center text-sm text-[color:var(--muted-foreground)]">
                        Generate one or more categories to populate the preview.
                      </p>
                    ) : null}
                  </div>
                  </Card>
                </div>
              </div>
              {statusLine ? (
                <p className="rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--muted)]/22 px-3 py-2 text-xs text-[color:var(--muted-foreground)]" aria-live="polite">
                  {statusLine}
                </p>
              ) : null}
            </div>
          )}
        </>
      )}
      {(totalSelectedCount > 0 || totalGeneratedCount > 0) && activeTab === "references" ? (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-5xl rounded-2xl border border-[color:var(--border)]/85 bg-[color:var(--background)]/96 p-3.5 shadow-[0_24px_68px_-34px_rgba(33,20,15,0.85)] backdrop-blur-md">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-[color:var(--muted-foreground)]">
              <span className="font-semibold text-[color:var(--foreground)]">{totalSelectedCount}</span> selected ·{" "}
              <span className="font-semibold text-[color:var(--foreground)]">{totalGeneratedCount}</span> generated
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-[color:var(--border)]/80 bg-[color:var(--muted)]/15 px-2.5 py-1 text-xs font-medium text-[color:var(--muted-foreground)]">
                <input
                  type="checkbox"
                  checked={numberedLines}
                  onChange={(e) => setNumberedLines(e.target.checked)}
                  className="rounded border-[color:var(--border)]"
                />
                Format: Numbering
              </label>
              <Button
                type="button"
                onClick={() => void runCategoryGeneration(stickyGenerateTarget)}
                disabled={Boolean(runningCategory) || selectedByCategory[stickyGenerateTarget].size === 0}
                className="h-8 px-3 text-xs shadow-[0_10px_18px_-14px_rgba(87,57,45,0.85)]"
              >
                Generate selected
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void runGenerateAllSelectedCategories()}
                disabled={Boolean(runningCategory) || totalSelectedCount === 0}
                className="h-8 px-3 text-xs"
              >
                Generate all categories
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void copyText(combinedOutputText, "Combined references copied")}
                disabled={!combinedOutputText}
                className="h-10 min-h-10 w-10 min-w-10 shrink-0 overflow-visible p-0 leading-none"
                aria-label="Copy output"
                title="Copy output"
              >
                <ReferencesCopyIcon />
                <span className="sr-only">Copy output</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={clearGeneratedOutput}
                disabled={totalGeneratedCount === 0 || Boolean(runningCategory)}
                className="h-8 px-3 text-xs text-[color:var(--muted-foreground)]"
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
