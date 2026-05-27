"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PublishPlatform, WorkspaceSchedulerPost } from "@/lib/social-signals/workspace-types";
import { BLUESKY_CHAR_LIMIT, X_CHAR_LIMIT } from "@/lib/social-signals/workspace-types";
import {
  schedulerPublishUi,
  type SchedulerPublishUiKind,
} from "@/lib/social-signals/scheduler-post-status";
import { InvestigatorMentionTextarea } from "@/components/investigator-mention-textarea";
import { LinkifiedText } from "./linkified-text";
import { PlatformBadge } from "./platform-badge";

/** Legacy slot rounding in dialog (minutes). */
const SLOT_MINUTES = 30;
/** Full week Mon → Sun (Sprout-style columns). */
const WORK_WEEK_DAYS = 7;

/** “Week at a glance” dialog — local hours + row height (Mon–Sun grid). */
const GLANCE_HOUR_START = 7;
/** Inclusive end hour (9 PM); grid shows 7–9 PM plus the 9 PM hour row. */
const GLANCE_HOUR_END = 21;
const GLANCE_PX_PER_HOUR = 28;
const GLANCE_DURATION_MIN = 30;
const GLANCE_HOUR_ROW_COUNT = GLANCE_HOUR_END - GLANCE_HOUR_START + 1;
/** Minutes spanned by the grid (7:00 → end of 9:00 PM hour). */
const GLANCE_WINDOW_MINUTES = GLANCE_HOUR_ROW_COUNT * 60;

/** Calendar + up-arrow (jump to today), Outlook-style affordance. */
function CalendarTodayIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M8 2v4M16 2v4" />
      <rect width="18" height="14" x="3" y="6" rx="2" ry="2" />
      <path d="M3 11h18" />
      <path d="M12 18V9M9 12l3-3 3 3" />
    </svg>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Nested `overflow-y-auto` regions capture wheel events even when they have nothing to scroll.
 * When no ancestor inside `root` can scroll in the wheel direction, scroll the page instead.
 */
function wheelForwardToWindowWhenNoNestedScroll(root: HTMLElement, e: WheelEvent) {
  let el: HTMLElement | null =
    e.target instanceof HTMLElement ? e.target : ((e.target as Node | null)?.parentElement ?? null);
  while (el && root.contains(el)) {
    const cs = window.getComputedStyle(el);
    const oy = cs.overflowY;
    const scrollable = (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1;
    if (scrollable) {
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      const top = el.scrollTop;
      const dy = e.deltaY;
      if (dy > 0 && top < maxScroll - 1) return;
      if (dy < 0 && top > 1) return;
    }
    el = el.parentElement;
  }
  window.scrollBy({ top: e.deltaY, left: 0, behavior: "auto" });
  e.preventDefault();
}

function formatGlanceHourLabel(hour24: number): string {
  const d = new Date(2000, 0, 1, hour24, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", hour12: true });
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date): Date {
  const x = startOfLocalDay(d);
  x.setDate(1);
  return x;
}

/** Monday 00:00 local (work week aligned with Outlook default). */
function startOfWorkWeek(d: Date): Date {
  const x = startOfLocalDay(d);
  const dow = x.getDay(); // 0 Sun … 6 Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + mondayOffset);
  return x;
}

/** Index 0 = Monday … 6 = Sunday for dates in this week row, else -1. */
function workWeekColumnIndex(d: Date, weekStartMonday: Date): number {
  const s = startOfLocalDay(weekStartMonday).getTime();
  const t = startOfLocalDay(d).getTime();
  const diffDays = Math.round((t - s) / (24 * 60 * 60 * 1000));
  if (diffDays < 0 || diffDays >= WORK_WEEK_DAYS) return -1;
  return diffDays;
}

function weekDayDates(weekStartMonday: Date): Date[] {
  return Array.from({ length: WORK_WEEK_DAYS }, (_, i) => {
    const x = new Date(weekStartMonday);
    x.setDate(x.getDate() + i);
    return x;
  });
}

/** e.g. “Week of June 1, 2026” (week begins Monday). */
function formatWeekOfLabel(weekStartMonday: Date): string {
  return `Week of ${weekStartMonday.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`;
}

function formatMonthYearLabel(monthStart: Date): string {
  return monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Sunday-first month grid (42 cells): trailing/padding days from adjacent months. */
function buildMonthCalendarCells(monthStart: Date): { date: Date; inCurrentMonth: boolean }[] {
  const y = monthStart.getFullYear();
  const m = monthStart.getMonth();
  const first = new Date(y, m, 1);
  const lead = first.getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const cells: { date: Date; inCurrentMonth: boolean }[] = [];
  const prevDim = new Date(y, m, 0).getDate();
  for (let i = 0; i < lead; i++) {
    const day = prevDim - lead + i + 1;
    cells.push({ date: new Date(y, m - 1, day), inCurrentMonth: false });
  }
  for (let d = 1; d <= dim; d++) {
    cells.push({ date: new Date(y, m, d), inCurrentMonth: true });
  }
  let next = 1;
  while (cells.length < 42) {
    cells.push({ date: new Date(y, m + 1, next++), inCurrentMonth: false });
  }
  return cells;
}

function dateKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse `<input type="datetime-local" />` value as **local** wall time (Safari-safe). */
function fromDatetimeLocalValue(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const day = Number(m[3]);
    const h = Number(m[4]);
    const min = Number(m[5]);
    const sec = m[6] ? Number(m[6]) : 0;
    const d = new Date(y, mo, day, h, min, sec);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function charLimit(platform: PublishPlatform) {
  return platform === "x" ? X_CHAR_LIMIT : BLUESKY_CHAR_LIMIT;
}

function formatDraftQueuedDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Linked PI/lab from DB, else light parse of common post phrasing (“Work from … and colleagues”). */
function queueInvestigatorsLine(post: WorkspaceSchedulerPost): string | null {
  const s = post.investigatorsSummary?.trim();
  if (s) return s;
  const t = post.text;
  const m1 = t.match(/\bWork from\s+([^.\n]+?)\s+and\s+colleagues\b/i);
  if (m1?.[1]) return m1[1].replace(/\s+/g, " ").trim();
  const m2 = t.match(/\bFrom\s+([A-Z][^.\n]{2,120}?)\s+and\s+colleagues\b/);
  if (m2?.[1]) return m2[1].replace(/\s+/g, " ").trim();
  return null;
}

/** Comma-separated surnames from “Full · Full · Full” (or optional trailing “(institution)”). */
function formatInvestigatorLastNamesComma(summary: string | null | undefined): string | null {
  const s = summary?.trim();
  if (!s) return null;
  const parts = s.split(/\s*·\s*/);
  const lasts = parts
    .map((part) => {
      let nameOnly = part.replace(/\s*\([^)]*\)\s*$/, "").trim();
      nameOnly = nameOnly.replace(/\s+and\s+colleagues\s*$/i, "").trim();
      const words = nameOnly.split(/\s+/).filter(Boolean);
      if (!words.length) return "";
      return words[words.length - 1] ?? "";
    })
    .filter(Boolean);
  return lasts.length ? lasts.join(", ") : null;
}

/** Split post text into a headline and trailing snippet (reference-style queue rows). */
function draftCardPreview(text: string): { headline: string; detail: string } {
  const t = text.trim();
  if (!t) return { headline: "", detail: "" };

  const nl = t.indexOf("\n");
  if (nl > 6 && nl < 320) {
    const headline = t.slice(0, nl).trim();
    const detail = t.slice(nl + 1).trim();
    if (detail.length > 0) return { headline, detail };
  }

  const sent = t.match(/^(.{12,240}?[.!?])(\s+)([\s\S]+)$/);
  if (sent?.[3] && sent[3].trim().length >= 20) {
    return { headline: sent[1].trim(), detail: sent[3].trim() };
  }

  if (t.length > 200) {
    const sliceAt = t.lastIndexOf(" ", 160);
    const at = sliceAt > 80 ? sliceAt : 160;
    const headline = `${t.slice(0, at).trim()}…`;
    const detail = t.slice(at).trim();
    if (detail.length > 12) return { headline, detail };
  }

  return { headline: t, detail: "" };
}

function QueueTrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

function QueueDraftCard({
  post,
  onOpen,
  onRemove,
  removing,
}: {
  post: WorkspaceSchedulerPost;
  onOpen: () => void;
  onRemove: (id: string) => void;
  removing: boolean;
}) {
  const { headline, detail } = draftCardPreview(post.text);
  const queuedLabel = formatDraftQueuedDate(post.created_at);
  const investigatorLasts = formatInvestigatorLastNamesComma(queueInvestigatorsLine(post));

  return (
    <div className="group relative w-full rounded-xl border border-[color:var(--border)]/60 bg-[color:var(--background)]/95 shadow-[0_10px_28px_-22px_rgba(52,38,30,0.28)] transition-[border-color,box-shadow] hover:border-[color:var(--accent)]/45 hover:shadow-[0_14px_36px_-28px_rgba(52,38,30,0.32)]">
      <button
        type="button"
        disabled={removing}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(post.id);
        }}
        aria-label={`Remove draft: ${post.sourceSignalTitle}`}
        title="Remove from queue"
        className="absolute right-1.5 top-1.5 z-10 rounded-lg p-1.5 text-[color:var(--muted-foreground)] opacity-70 transition-[opacity,color,background] hover:bg-[#f4dfd9] hover:text-[#8f4d45] focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--accent)]/45 sm:opacity-0 sm:group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-40"
      >
        <QueueTrashIcon />
      </button>
      <button
        type="button"
        onClick={onOpen}
        disabled={removing}
        className="w-full rounded-xl px-2.5 py-2.5 pr-9 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]/45 disabled:opacity-60"
      >
      <div className="flex gap-2">
        <div className="shrink-0 pt-0.5">
          <PlatformBadge platform={post.platform} size="xs" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="line-clamp-2 text-[11px] leading-snug text-[color:var(--muted-foreground)]">{post.sourceSignalTitle}</p>

          <div className="space-y-1">
            <p className="line-clamp-1 text-[13px] font-semibold leading-snug text-[color:var(--foreground)]">{headline}</p>
            {investigatorLasts ? (
              <p className="line-clamp-2 text-[10px] leading-snug text-[color:var(--muted-foreground)]">{investigatorLasts}</p>
            ) : null}
            {detail ? (
              <p className="line-clamp-2 text-[11px] leading-snug text-[color:var(--muted-foreground)]">{detail}</p>
            ) : null}
          </div>

          {post.image_url ? (
            <div className="overflow-hidden rounded-md border border-[color:var(--border)]/45">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.image_url} alt="" className="aspect-[16/9] max-h-14 w-full object-cover" />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-[color:var(--border)]/40 pt-2 text-[10px]">
            <span className="text-[color:var(--muted-foreground)]">{queuedLabel ? <>Added {queuedLabel}</> : "Draft"}</span>
            <span className="font-semibold text-[color:var(--accent)] transition-colors group-hover:underline">Schedule →</span>
          </div>
        </div>
      </div>
      </button>
    </div>
  );
}

function publishBadgeClass(kind: SchedulerPublishUiKind): string {
  switch (kind) {
    case "published":
      return "border-emerald-600/35 bg-emerald-500/12 text-emerald-900 dark:text-emerald-200";
    case "due":
      return "border-amber-600/40 bg-amber-500/12 text-amber-950 dark:text-amber-100";
    case "failed":
      return "border-red-600/35 bg-red-500/10 text-red-900 dark:text-red-200";
    case "scheduled":
      return "border-sky-600/30 bg-sky-500/10 text-sky-950 dark:text-sky-100";
    default:
      return "border-[color:var(--border)]/60 bg-[color:var(--muted)]/25 text-[color:var(--muted-foreground)]";
  }
}

function SchedulerPublishBadge({ post, compact }: { post: WorkspaceSchedulerPost; compact?: boolean }) {
  const ui = schedulerPublishUi(post);
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold leading-none ${publishBadgeClass(ui.kind)} ${compact ? "text-[9px]" : "text-[10px]"}`}
      title={ui.detail}
    >
      {ui.kind === "published" ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" />
        </svg>
      ) : null}
      <span className="truncate">{ui.label}</span>
    </span>
  );
}

async function flushDueSchedulerPosts(): Promise<{
  published: number;
  failed: number;
  errors: { id: string; message: string }[];
} | null> {
  try {
    const res = await fetch("/api/social-signals/publish-due", { method: "POST" });
    const data = (await res.json()) as {
      error?: string;
      published?: number;
      failed?: number;
      errors?: { id: string; message: string }[];
    };
    if (!res.ok) return null;
    return {
      published: data.published ?? 0,
      failed: data.failed ?? 0,
      errors: (data.errors ?? []).map((e) => ({ id: e.id, message: e.message })),
    };
  } catch {
    return null;
  }
}

function SchedulerPostCard({
  post,
  onClick,
  selected,
  compact,
  monthDense,
}: {
  post: WorkspaceSchedulerPost;
  onClick: () => void;
  selected?: boolean;
  compact?: boolean;
  /** Tighter body (one line) for month cells sized to ~2 cards visible. */
  monthDense?: boolean;
}) {
  const ui = schedulerPublishUi(post);
  const timeStr = post.published_at
    ? new Date(post.published_at).toLocaleTimeString(undefined, { timeStyle: "short" })
    : post.scheduled_at
      ? new Date(post.scheduled_at).toLocaleTimeString(undefined, { timeStyle: "short" })
      : "Draft";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={post.scheduled_at ? `Open editor · ${timeStr}` : "Open editor"}
      className={`group w-full rounded-xl border text-left transition-[box-shadow,border-color] ${
        selected
          ? "border-[color:var(--accent)]/60 bg-[color:var(--accent)]/[0.10] shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_28%,transparent)]"
          : ui.kind === "published"
            ? "border-emerald-600/35 bg-emerald-500/[0.06] shadow-[var(--shadow-soft)] hover:border-emerald-600/50"
            : ui.kind === "failed"
              ? "border-red-600/30 bg-red-500/[0.04] shadow-[var(--shadow-soft)] hover:border-red-600/45"
              : "border-[color:var(--border)]/65 bg-[color:var(--card)]/95 shadow-[var(--shadow-soft)] hover:border-[color:var(--accent)]/40"
      } ${compact ? "p-1.5" : "p-2"}`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <PlatformBadge platform={post.platform} size="xs" />
        <SchedulerPublishBadge post={post} compact={compact} />
      </div>
      <p className={`mt-1 tabular-nums text-[color:var(--muted-foreground)] ${compact ? "text-[9px]" : "text-[10px]"}`}>
        {timeStr}
      </p>
      <p
        className={`mt-1.5 font-semibold leading-snug text-[color:var(--foreground)] ${compact ? "text-[10px] line-clamp-1" : "text-xs line-clamp-1"}`}
      >
        {post.sourceSignalTitle}
      </p>
      <p
        className={`mt-1 leading-snug ${
          compact ? (monthDense ? "text-[9px] line-clamp-1" : "text-[9px] line-clamp-2") : "text-[11px] line-clamp-3"
        }`}
      >
        <LinkifiedText text={post.text} className="text-[color:var(--muted-foreground)]" />
      </p>
      {post.image_url && !compact ? (
        <div className="mt-1.5 overflow-hidden rounded-md border border-[color:var(--border)]/45">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.image_url} alt="" className="aspect-[16/9] max-h-12 w-full object-cover sm:max-h-14" />
        </div>
      ) : null}
    </button>
  );
}

function WeekVolumeStrip({ weekStartMonday, posts }: { weekStartMonday: Date; posts: WorkspaceSchedulerPost[] }) {
  const counts = useMemo(() => {
    const c = Array.from({ length: WORK_WEEK_DAYS }, () => 0);
    for (const p of posts) {
      if (!p.scheduled_at) continue;
      const idx = workWeekColumnIndex(new Date(p.scheduled_at), weekStartMonday);
      if (idx >= 0) c[idx]!++;
    }
    return c;
  }, [posts, weekStartMonday]);
  const max = Math.max(1, ...counts);

  return (
    <div className="mt-3 mb-8 rounded-xl border border-[color:var(--border)]/50 bg-[color:var(--card)]/60 px-3 py-3 shadow-[0_8px_28px_-22px_rgba(52,38,30,0.18)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">Post volume</p>
        <span className="text-[10px] text-[color:var(--muted-foreground)]">This week</span>
      </div>
      <div className="flex gap-1.5">
        {counts.map((n, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex h-11 w-full items-end overflow-hidden rounded-md bg-[color:var(--muted)]/45">
              <div
                className="w-full rounded-t-md bg-[color:var(--accent)]/70 transition-[height] duration-300 dark:bg-[color:var(--accent)]/55"
                style={{ height: `${Math.max(8, (n / max) * 100)}%` }}
              />
            </div>
            <span className="text-[9px] font-semibold tabular-nums text-[color:var(--muted-foreground)]">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type DialogProps = {
  post: WorkspaceSchedulerPost | null;
  weekStartMonday: Date;
  calendarPosts: WorkspaceSchedulerPost[];
  onClose: () => void;
  onSaved: () => void;
  onRemoveFromQueue?: (id: string) => Promise<void>;
};

function SchedulerPostDialog({
  post,
  weekStartMonday,
  calendarPosts,
  onClose,
  onSaved,
  onRemoveFromQueue,
}: DialogProps) {
  const router = useRouter();
  const [text, setText] = useState(post?.text ?? "");
  const [slotLocal, setSlotLocal] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!post) return;
    setText(post.text);
    if (post.scheduled_at) setSlotLocal(toDatetimeLocalValue(post.scheduled_at));
    else {
      const d = new Date();
      const col = workWeekColumnIndex(d, weekStartMonday);
      if (col < 0) d.setTime(startOfLocalDay(weekStartMonday).getTime() + 10 * 60 * 60 * 1000);
      const round = new Date(d);
      round.setMinutes(Math.ceil(round.getMinutes() / SLOT_MINUTES) * SLOT_MINUTES, 0, 0);
      setSlotLocal(toDatetimeLocalValue(round.toISOString()));
    }
  }, [post, weekStartMonday]);

  if (!post) return null;

  const publishUi = schedulerPublishUi(post);
  const investigatorLastsDialog = formatInvestigatorLastNamesComma(queueInvestigatorsLine(post));

  const limit = charLimit(post.platform);
  const over = text.length > limit;

  const save = async (clearSlot: boolean) => {
    if (!clearSlot && !slotLocal.trim()) {
      toast.error("Pick a date and time to schedule.");
      return;
    }
    if (!clearSlot) {
      const isoDraft = fromDatetimeLocalValue(slotLocal);
      if (!isoDraft) {
        toast.error("Pick a valid date and time.");
        return;
      }
    }
    setSaving(true);
    try {
      const scheduled_at = clearSlot ? null : fromDatetimeLocalValue(slotLocal);
      const status = clearSlot ? "draft" : "scheduled";
      const res = await fetch(`/api/social-signals/review-queue/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          status,
          scheduled_at,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (!clearSlot && over) {
        toast.success("Scheduled — note: text is over the platform limit; shorten before publishing.");
      } else {
        toast.success(clearSlot ? "Returned to queue" : "Scheduled");
      }
      if (!clearSlot && scheduled_at && Date.parse(scheduled_at) <= Date.now()) {
        const flush = await flushDueSchedulerPosts();
        if (flush?.published) {
          toast.success(
            flush.published === 1 ? "Published to platform" : `Published ${flush.published} posts`,
          );
        } else if (flush?.failed) {
          const err = flush.errors[0]?.message ?? "Publish failed";
          toast.error(err);
        }
      }
      onSaved();
      router.refresh();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const postNow = async () => {
    if (post.status === "published") return;
    setPublishing(true);
    try {
      const nowIso = new Date().toISOString();
      const res = await fetch(`/api/social-signals/review-queue/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          status: "scheduled",
          scheduled_at: nowIso,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not queue publish");
      const flush = await flushDueSchedulerPosts();
      if (flush?.published) {
        toast.success("Published to platform");
        onSaved();
        router.refresh();
        onClose();
        return;
      }
      if (flush?.failed) {
        throw new Error(flush.errors[0]?.message ?? "Publish failed");
      }
      toast.message("Saved — will publish on the next check.");
      onSaved();
      router.refresh();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
      router.refresh();
    } finally {
      setPublishing(false);
    }
  };

  const removeFromQueue = async () => {
    if (!post || !onRemoveFromQueue) return;
    setRemoving(true);
    try {
      await onRemoveFromQueue(post.id);
      onClose();
    } catch {
      /* toast handled by parent */
    } finally {
      setRemoving(false);
    }
  };

  const dialogBusy = saving || removing || publishing;
  const isPublished = post.status === "published";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="scheduler-dialog-title"
    >
      <button type="button" className="absolute inset-0 z-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[min(92vh,880px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[color:var(--border)]/75 bg-[color:var(--background)] shadow-[0_28px_80px_-40px_rgba(25,14,10,0.85)] lg:grid lg:min-h-0 lg:max-h-[85vh] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.22fr)] lg:divide-x lg:divide-[color:var(--border)]/55">
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5 lg:min-h-0 lg:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="scheduler-dialog-title" className="text-lg font-semibold text-[color:var(--foreground)]">
              Edit &amp; schedule
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[color:var(--border)]/70 px-3 py-1.5 text-xs font-semibold text-[color:var(--foreground)]"
            >
              Close
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <PlatformBadge platform={post.platform} size="xs" />
            <SchedulerPublishBadge post={post} />
            <span className="text-[color:var(--muted-foreground)]">Signal: {post.sourceSignalTitle}</span>
          </div>
          {publishUi.detail ? (
            <p
              className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
                publishUi.kind === "published"
                  ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                  : publishUi.kind === "failed"
                    ? "border-red-600/30 bg-red-500/10 text-red-900 dark:text-red-200"
                    : "border-[color:var(--border)]/55 bg-[color:var(--muted)]/15 text-[color:var(--muted-foreground)]"
              }`}
            >
              {publishUi.detail}
            </p>
          ) : null}
          {investigatorLastsDialog ? (
            <p className="text-xs leading-relaxed text-[color:var(--muted-foreground)]">{investigatorLastsDialog}</p>
          ) : null}

          <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">
            Post body
            <InvestigatorMentionTextarea
              mentionNetwork={post.platform === "x" ? "x" : "bluesky"}
              value={text}
              onChange={(v) => setText(v)}
              rows={10}
              disabled={isPublished}
              className="mt-1.5 min-h-[220px] resize-y border-[color:var(--border)]/80 bg-[color:var(--card)]/90 px-3 py-2.5 text-sm leading-relaxed text-[color:var(--foreground)] disabled:opacity-70"
            />
            <span
              className={`mt-1 block text-[11px] tabular-nums ${over ? "text-red-700 dark:text-red-300" : "text-[color:var(--muted-foreground)]"}`}
            >
              {text.length} / {limit}
            </span>
          </label>

          {post.image_url ? (
            <div className="overflow-hidden rounded-xl border border-[color:var(--border)]/55">
              {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied URLs (digest attach / CMS) */}
              <img src={post.image_url} alt="" className="h-auto max-h-48 w-full object-cover" />
            </div>
          ) : null}

          <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">
            Scheduled time (local)
            <input
              type="datetime-local"
              value={slotLocal}
              onChange={(e) => setSlotLocal(e.target.value)}
              disabled={isPublished}
              className="mt-1.5 w-full rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--card)]/95 px-3 py-2 text-sm disabled:opacity-70"
            />
          </label>

          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[color:var(--border)]/40 pt-4">
            {!isPublished ? (
              <>
                <button
                  type="button"
                  disabled={dialogBusy}
                  onClick={() => void save(false)}
                  className="rounded-xl bg-[color:var(--foreground)] px-4 py-2.5 text-sm font-semibold text-[color:var(--background)] disabled:opacity-50"
                >
                  {saving ? "Saving…" : post.scheduled_at ? "Update schedule" : "Save to calendar"}
                </button>
                <button
                  type="button"
                  disabled={dialogBusy}
                  onClick={() => void postNow()}
                  className="rounded-xl border border-[color:var(--accent)]/50 bg-[color:var(--accent)]/12 px-4 py-2.5 text-sm font-semibold text-[color:var(--foreground)] disabled:opacity-50"
                >
                  {publishing ? "Publishing…" : "Post now"}
                </button>
              </>
            ) : null}
            {post.scheduled_at && !isPublished ? (
              <button
                type="button"
                disabled={dialogBusy}
                onClick={() => void save(true)}
                className="rounded-xl border border-[color:var(--border)]/80 px-4 py-2.5 text-sm font-semibold text-[color:var(--foreground)]"
              >
                Clear slot · keep draft
              </button>
            ) : onRemoveFromQueue && !isPublished ? (
              <button
                type="button"
                disabled={dialogBusy}
                onClick={() => void removeFromQueue()}
                className="rounded-xl border border-[color:var(--border)]/80 px-4 py-2.5 text-sm font-semibold text-[#8f4d45] hover:bg-[#f4dfd9]/80 disabled:opacity-50"
              >
                {removing ? "Removing…" : "Remove from queue"}
              </button>
            ) : null}
          </div>
        </div>

        <aside className="flex min-h-0 min-w-0 flex-col bg-[color:var(--muted)]/08 p-4 lg:overflow-hidden lg:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
            Week at a glance
          </p>
          <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
            Hourly grid (7 AM–9 PM) for this week — click a slot to set the scheduled time above (30-minute steps). Other posts appear in their slots; your edit is highlighted. The dashed box follows the time above.
          </p>
          <div className="mt-4 flex min-h-[200px] flex-1 flex-col overflow-hidden rounded-xl border border-[color:var(--border)]/50 bg-[color:var(--background)]/90 lg:min-h-0">
            <SchedulerWeekGlanceGrid
              weekStartMonday={weekStartMonday}
              posts={calendarPosts}
              highlightedId={post.id}
              previewIso={slotLocal.trim() ? fromDatetimeLocalValue(slotLocal) : null}
              onSlotSelect={(iso) => setSlotLocal(toDatetimeLocalValue(iso))}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

type GlanceInternal = {
  post: WorkspaceSchedulerPost;
  topPx: number;
  heightPx: number;
  startMin: number;
  endMin: number;
};

type GlancePlaced = GlanceInternal & { lane: number; laneCount: number };

function glanceOverlapIv(a: GlanceInternal, b: GlanceInternal): boolean {
  return !(a.endMin <= b.startMin || b.endMin <= a.startMin);
}

function glanceClusterOverlapping(items: GlanceInternal[]): GlanceInternal[][] {
  const n = items.length;
  if (n === 0) return [];
  const parent = [...Array(n).keys()];
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const unite = (i: number, j: number) => {
    const pi = find(i);
    const pj = find(j);
    if (pi !== pj) parent[pi] = pj;
  };
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (glanceOverlapIv(items[i]!, items[j]!)) unite(i, j);
  const groups = new Map<number, GlanceInternal[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(items[i]!);
  }
  return [...groups.values()];
}

function glanceAssignLanesInCluster(items: GlanceInternal[]): GlancePlaced[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const laneEnds: number[] = [];
  const staged: { ev: GlanceInternal; lane: number }[] = [];
  for (const ev of sorted) {
    let lane = laneEnds.findIndex((end) => end <= ev.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(ev.endMin);
    } else {
      laneEnds[lane] = ev.endMin;
    }
    staged.push({ ev, lane });
  }
  const lanesUsed = laneEnds.length || 1;
  return staged.map(({ ev, lane }) => ({ ...ev, lane, laneCount: lanesUsed }));
}

function glanceLayoutColumn(items: GlanceInternal[]): GlancePlaced[] {
  const clusters = glanceClusterOverlapping(items);
  const placed: GlancePlaced[] = [];
  for (const c of clusters) placed.push(...glanceAssignLanesInCluster(c));
  return placed;
}

function postToGlanceInternal(p: WorkspaceSchedulerPost, pxPerHour: number): GlanceInternal | null {
  if (!p.scheduled_at) return null;
  const d = new Date(p.scheduled_at);
  const rawMins = d.getHours() * 60 + d.getMinutes() - GLANCE_HOUR_START * 60;
  const startMin = Math.max(0, Math.min(rawMins, GLANCE_WINDOW_MINUTES - GLANCE_DURATION_MIN));
  const endMin = startMin + GLANCE_DURATION_MIN;
  const topPx = (startMin / 60) * pxPerHour;
  const heightPx = Math.max(22, (GLANCE_DURATION_MIN / 60) * pxPerHour - 2);
  return { post: p, topPx, heightPx, startMin, endMin };
}

function glanceIsoFromGridClick(weekStartMonday: Date, col: number, yRatio: number): string {
  let minsFromStart = yRatio * GLANCE_WINDOW_MINUTES;
  minsFromStart = Math.round(minsFromStart / SLOT_MINUTES) * SLOT_MINUTES;
  const maxStart = GLANCE_WINDOW_MINUTES - GLANCE_DURATION_MIN;
  minsFromStart = Math.max(0, Math.min(maxStart, minsFromStart));
  const day = new Date(weekStartMonday);
  day.setDate(day.getDate() + col);
  const base = startOfLocalDay(day);
  base.setHours(GLANCE_HOUR_START, 0, 0, 0);
  base.setMinutes(minsFromStart);
  return base.toISOString();
}

function SchedulerWeekGlanceGrid({
  weekStartMonday,
  posts,
  highlightedId,
  previewIso,
  onSlotSelect,
}: {
  weekStartMonday: Date;
  posts: WorkspaceSchedulerPost[];
  highlightedId?: string;
  previewIso?: string | null;
  /** Called with UTC ISO when user clicks an empty area of the grid (30-minute steps). */
  onSlotSelect?: (iso: string) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [pxPerHour, setPxPerHour] = useState(GLANCE_PX_PER_HOUR);
  const totalPx = GLANCE_HOUR_ROW_COUNT * pxPerHour;
  const hours = useMemo(
    () => Array.from({ length: GLANCE_HOUR_ROW_COUNT }, (_, i) => GLANCE_HOUR_START + i),
    [],
  );

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const apply = () => {
      const h = el.clientHeight;
      if (h <= 0) return;
      setPxPerHour(Math.max(22, h / GLANCE_HOUR_ROW_COUNT));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const byColumn = useMemo(() => {
    const cols: GlanceInternal[][] = Array.from({ length: WORK_WEEK_DAYS }, () => []);
    for (const p of posts) {
      if (!p.scheduled_at) continue;
      const col = workWeekColumnIndex(new Date(p.scheduled_at), weekStartMonday);
      if (col < 0) continue;
      const ev = postToGlanceInternal(p, pxPerHour);
      if (ev) cols[col]!.push(ev);
    }
    return cols.map((list) => glanceLayoutColumn(list));
  }, [posts, weekStartMonday, pxPerHour]);

  const previewPlacement = useMemo(() => {
    if (!previewIso) return null;
    const col = workWeekColumnIndex(new Date(previewIso), weekStartMonday);
    if (col < 0) return null;
    const d = new Date(previewIso);
    const rawMins = d.getHours() * 60 + d.getMinutes() - GLANCE_HOUR_START * 60;
    const startMin = Math.max(0, Math.min(rawMins, GLANCE_WINDOW_MINUTES - GLANCE_DURATION_MIN));
    const topPx = (startMin / 60) * pxPerHour;
    return { col, topPx };
  }, [previewIso, weekStartMonday, pxPerHour]);

  const nowLine = useMemo(() => {
    const now = new Date();
    const col = workWeekColumnIndex(now, weekStartMonday);
    if (col < 0) return null;
    const rawMins = now.getHours() * 60 + now.getMinutes() - GLANCE_HOUR_START * 60;
    if (rawMins < 0 || rawMins >= GLANCE_WINDOW_MINUTES) return null;
    return { col, topPx: (rawMins / 60) * pxPerHour };
  }, [weekStartMonday, pxPerHour]);

  const dayHeaders = weekDayDates(weekStartMonday);
  const todayColumnIndex = useMemo(() => {
    const idx = workWeekColumnIndex(new Date(), weekStartMonday);
    return idx >= 0 ? idx : null;
  }, [weekStartMonday]);

  const handleSlotGridClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (!onSlotSelect) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.min(WORK_WEEK_DAYS - 1, Math.max(0, Math.floor((x / rect.width) * WORK_WEEK_DAYS)));
    const yRatio = rect.height > 0 ? Math.max(0, Math.min(1, y / rect.height)) : 0;
    onSlotSelect(glanceIsoFromGridClick(weekStartMonday, col, yRatio));
  };

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col text-[9px]">
      <div className="flex min-h-0 flex-1">
        <div className="flex w-10 shrink-0 flex-col border-r border-[color:var(--border)]/50 bg-[color:var(--muted)]/12">
          <div className="h-8 shrink-0 border-b border-[color:var(--border)]/40" aria-hidden />
          <div className="flex min-h-0 flex-1 flex-col">
            {hours.map((h) => (
              <div
                key={h}
                className="flex min-h-0 flex-1 flex-col items-start justify-end border-b border-[color:var(--border)]/25 py-0.5 pr-0.5 text-[8px] leading-none text-[color:var(--muted-foreground)]"
              >
                <span className="max-w-[2.25rem] truncate text-right leading-tight">{formatGlanceHourLabel(h)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="grid h-8 shrink-0 grid-cols-7 border-b border-[color:var(--border)]/45 bg-[color:var(--muted)]/10">
            {dayHeaders.map((d, i) => {
              const isToday = todayColumnIndex === i;
              return (
                <div
                  key={i}
                  className={`flex flex-col items-center justify-center border-l border-[color:var(--border)]/35 px-0.5 py-1 text-center first:border-l-0 ${
                    isToday ? "bg-[color:var(--accent)]/[0.08]" : ""
                  }`}
                >
                  <span className={`font-semibold uppercase ${isToday ? "text-[color:var(--accent)]" : "text-[color:var(--muted-foreground)]"}`}>
                    {d.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <span className={`font-bold tabular-nums ${isToday ? "text-[color:var(--accent)]" : "text-[color:var(--foreground)]"}`}>{d.getDate()}</span>
                </div>
              );
            })}
          </div>

          <div ref={bodyRef} className="relative grid min-h-0 flex-1 grid-cols-7" style={{ minHeight: totalPx }}>
            {hours.map((h) => (
              <div
                key={h}
                className="pointer-events-none absolute inset-x-0 border-b border-[color:var(--border)]/45"
                style={{ top: (h - GLANCE_HOUR_START) * pxPerHour }}
              />
            ))}
            {hours.map((h) => (
              <div
                key={`half-${h}`}
                className="pointer-events-none absolute inset-x-0 border-b border-dashed border-[color:var(--border)]/20"
                style={{ top: (h - GLANCE_HOUR_START) * pxPerHour + pxPerHour / 2 }}
              />
            ))}

            {onSlotSelect ? (
              <button
                type="button"
                tabIndex={-1}
                aria-label="Select time slot"
                className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0"
                onClick={handleSlotGridClick}
              />
            ) : null}

            {nowLine ? (
              <div
                className="pointer-events-none absolute left-0 right-0 z-20 border-t border-[color:var(--accent)]/55"
                style={{ top: nowLine.topPx }}
                title="Now"
              >
                <span className="absolute -left-0.5 -top-1 h-2 w-2 rounded-full bg-[color:var(--accent)] ring-1 ring-[color:var(--background)]" />
              </div>
            ) : null}

            {previewPlacement ? (
              <div
                className="pointer-events-none absolute z-[8] rounded border-2 border-dashed border-[color:var(--accent)]/60 bg-[color:var(--accent)]/10"
                style={{
                  top: previewPlacement.topPx + 1,
                  left: `calc(${previewPlacement.col} * (100% / 7) + 2px)`,
                  width: `calc(100% / 7 - 4px)`,
                  height: Math.max((GLANCE_DURATION_MIN / 60) * pxPerHour - 4, 24),
                }}
              />
            ) : null}

            {byColumn.map((placed, colIdx) => (
              <div
                key={colIdx}
                className={`pointer-events-none relative border-l border-[color:var(--border)]/35 first:border-l-0 ${
                  todayColumnIndex === colIdx ? "bg-[color:var(--accent)]/[0.03]" : ""
                }`}
              >
                {placed.map(({ post: gp, topPx, heightPx, lane, laneCount }) => {
                  const wPct = 100 / laneCount;
                  const leftPct = lane * wPct;
                  const hi = gp.id === highlightedId;
                  const gpUi = schedulerPublishUi(gp);
                  return (
                    <div
                      key={gp.id}
                      className={`pointer-events-auto absolute z-[5] overflow-hidden rounded border px-0.5 py-px text-left shadow-sm ${
                        hi
                          ? "border-[color:var(--accent)]/70 bg-[color:var(--accent)]/15 ring-1 ring-[color:var(--accent)]/35"
                          : gpUi.kind === "published"
                            ? "border-emerald-600/40 bg-emerald-500/12"
                            : gpUi.kind === "due"
                              ? "border-amber-600/40 bg-amber-500/10"
                              : "border-[color:var(--border)]/65 bg-[color:var(--card)]/95"
                      }`}
                      style={{
                        top: topPx + 2,
                        height: heightPx,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${wPct}% - 4px)`,
                      }}
                      title={gp.text}
                    >
                      <span className="flex items-center gap-0.5 truncate">
                        <span className="inline-flex shrink-0 scale-[0.55] origin-left">
                          <PlatformBadge platform={gp.platform} size="xs" />
                        </span>
                        <span className="truncate font-semibold tabular-nums text-[color:var(--foreground)]">
                          {new Date(gp.scheduled_at!).toLocaleTimeString(undefined, { timeStyle: "short" })}
                        </span>
                      </span>
                      <span className="line-clamp-2 text-[8px] leading-tight text-[color:var(--muted-foreground)]">{gp.text}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SchedulerWeekColumns({
  weekStartMonday,
  posts,
  onPickPost,
  highlightedId,
  compact = false,
  showAddDraft = false,
  onAddDraft,
  addDraftPendingColumn,
}: {
  weekStartMonday: Date;
  posts: WorkspaceSchedulerPost[];
  highlightedId?: string;
  onPickPost: (p: WorkspaceSchedulerPost) => void;
  compact?: boolean;
  showAddDraft?: boolean;
  /** Create a draft scheduled on that weekday at 10:00 local (column index 0 = Monday). */
  onAddDraft?: (dayColumnIndex: number) => void | Promise<void>;
  addDraftPendingColumn?: number | null;
}) {
  const dayHeaders = weekDayDates(weekStartMonday);

  const byColumn = useMemo(() => {
    const cols: WorkspaceSchedulerPost[][] = Array.from({ length: WORK_WEEK_DAYS }, () => []);
    for (const p of posts) {
      if (!p.scheduled_at) continue;
      const col = workWeekColumnIndex(new Date(p.scheduled_at), weekStartMonday);
      if (col < 0) continue;
      cols[col]!.push(p);
    }
    for (const col of cols) {
      col.sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!));
    }
    return cols;
  }, [posts, weekStartMonday]);

  const todayColumnIndex = useMemo(() => {
    const idx = workWeekColumnIndex(new Date(), weekStartMonday);
    return idx >= 0 ? idx : null;
  }, [weekStartMonday]);

  const colBodyScrollClass = compact ? "max-h-[min(38vh,240px)]" : "min-h-0 flex-1";

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${compact ? "text-[10px]" : "text-[11px]"}`}>
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-7 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-xl border border-[color:var(--border)]/55 bg-[color:var(--card)]/35 shadow-[var(--shadow-soft)]">
        {dayHeaders.map((d, i) => {
          const isToday = todayColumnIndex === i;
          return (
            <div
              key={i}
              className={`flex min-h-0 min-w-0 flex-1 flex-col border-l border-[color:var(--border)]/40 first:border-l-0 ${
                isToday ? "bg-[color:var(--accent)]/[0.07] ring-1 ring-inset ring-[color:var(--accent)]/22" : "bg-[color:var(--background)]/85"
              }`}
            >
              <div
                className={`shrink-0 border-b border-[color:var(--border)]/45 px-1 py-2 text-center sm:px-1.5 ${
                  isToday ? "border-t-2 border-t-[color:var(--accent)]" : ""
                }`}
              >
                <p
                  className={`text-[10px] font-semibold uppercase tracking-wide ${
                    isToday ? "text-[color:var(--accent)]" : "text-[color:var(--muted-foreground)]"
                  }`}
                >
                  {d.toLocaleDateString(undefined, { weekday: "short" })}
                </p>
                <p
                  className={`text-sm font-bold tabular-nums ${isToday ? "text-[color:var(--accent)]" : "text-[color:var(--foreground)]"}`}
                >
                  {d.getDate()}
                </p>
                {showAddDraft ? (
                  <button
                    type="button"
                    disabled={addDraftPendingColumn !== null}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void onAddDraft?.(i);
                    }}
                    className="mt-2 w-full rounded-lg border border-dashed border-[color:var(--accent)]/50 bg-[color:var(--card)]/90 py-1.5 text-[10px] font-semibold text-[color:var(--accent)] transition-colors hover:bg-[color:var(--accent)]/12 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {addDraftPendingColumn === i ? "Adding…" : "+ Add draft"}
                  </button>
                ) : null}
              </div>
              <div
                className={`flex min-h-0 flex-col gap-2 p-1.5 ${colBodyScrollClass} ${
                  byColumn[i]!.length === 0 ? "overflow-visible" : "overflow-y-auto overscroll-y-auto"
                }`}
              >
                {byColumn[i]!.map((post) => (
                  <SchedulerPostCard
                    key={post.id}
                    post={post}
                    onClick={() => onPickPost(post)}
                    compact={compact}
                    selected={highlightedId === post.id}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SchedulerListView({
  scheduled,
  published,
  onPickPost,
}: {
  scheduled: WorkspaceSchedulerPost[];
  published: WorkspaceSchedulerPost[];
  onPickPost: (p: WorkspaceSchedulerPost) => void;
}) {
  return (
    <div className="p-3">
      <p className="mb-4 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
        Scheduled and published posts. Unscheduled drafts stay in the queue column.
      </p>
      {scheduled.length === 0 && published.length === 0 ? (
        <p className="py-10 text-center text-sm text-[color:var(--muted-foreground)]">No scheduled posts yet.</p>
      ) : (
        <div className="space-y-6">
          {scheduled.length > 0 ? (
            <ul className="space-y-2.5">
              {scheduled.map((p) => (
                <li key={p.id}>
                  <SchedulerPostCard post={p} onClick={() => onPickPost(p)} />
                </li>
              ))}
            </ul>
          ) : null}
          {published.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
                Published
              </p>
              <ul className="space-y-2.5">
                {published.map((p) => (
                  <li key={p.id}>
                    <SchedulerPostCard post={p} onClick={() => onPickPost(p)} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

type SchedulerCalendarView = "list" | "week" | "month";

function SchedulerMonthGrid({
  monthStart,
  posts,
  onPickPost,
}: {
  monthStart: Date;
  posts: WorkspaceSchedulerPost[];
  onPickPost: (p: WorkspaceSchedulerPost) => void;
}) {
  const cells = useMemo(() => buildMonthCalendarCells(startOfMonth(monthStart)), [monthStart]);

  const weeks = useMemo(() => {
    const rows: { date: Date; inCurrentMonth: boolean }[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [cells]);

  const byDay = useMemo(() => {
    const m = new Map<string, WorkspaceSchedulerPost[]>();
    for (const p of posts) {
      if (!p.scheduled_at) continue;
      const k = dateKeyLocal(new Date(p.scheduled_at));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!));
    }
    return m;
  }, [posts]);

  const todayKey = dateKeyLocal(new Date());

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="flex min-h-0 min-w-[280px] flex-1 flex-col text-[11px]">
      <div className="grid shrink-0 grid-cols-7 border-b border-[color:var(--border)]/45 bg-[color:var(--muted)]/10">
        {weekdayLabels.map((w, i) => (
          <div
            key={w}
            className={`py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] ${i === 0 ? "" : "border-l border-[color:var(--border)]/30"}`}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="flex min-h-[28rem] flex-1 flex-col lg:min-h-[32rem]">
        {weeks.map((weekCells, wi) => (
          <div
            key={wi}
            className="grid min-h-[8rem] flex-1 grid-cols-7 border-b border-[color:var(--border)]/35"
          >
            {weekCells.map(({ date, inCurrentMonth }, di) => {
              const i = wi * 7 + di;
              const key = dateKeyLocal(date);
              const isToday = key === todayKey;
              const dayPosts = byDay.get(key) ?? [];

              return (
                <div
                  key={`${key}-${i}`}
                  className={`flex min-h-0 min-w-0 flex-col p-1 ${di === 0 ? "" : "border-l border-[color:var(--border)]/35"} ${
                    !inCurrentMonth ? "bg-[color:var(--muted)]/08 opacity-70" : "bg-[color:var(--background)]/95"
                  } ${isToday ? "bg-[color:var(--accent)]/[0.06] ring-1 ring-inset ring-[color:var(--accent)]/35" : ""}`}
                >
                  <p
                    className={`mb-0.5 shrink-0 text-right text-[11px] font-semibold tabular-nums ${
                      isToday ? "text-[color:var(--accent)]" : inCurrentMonth ? "text-[color:var(--foreground)]" : "text-[color:var(--muted-foreground)]"
                    }`}
                  >
                    {date.getDate()}
                  </p>
                  <ul
                    className={`min-h-0 w-full flex-1 space-y-1 pr-0.5 [scrollbar-width:thin] [max-height:min(9.25rem,calc(100%-1.25rem))] ${
                      dayPosts.length === 0 ? "overflow-visible" : "overflow-y-auto overscroll-y-auto"
                    }`}
                  >
                    {dayPosts.map((p) => (
                      <li key={p.id} className="shrink-0">
                        <SchedulerPostCard post={p} onClick={() => onPickPost(p)} compact monthDense />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SocialSchedulerPanel({ initialPosts }: { initialPosts: WorkspaceSchedulerPost[] }) {
  const router = useRouter();
  const calendarPaneRef = useRef<HTMLDivElement>(null);
  const [posts, setPosts] = useState(initialPosts);
  const [calendarView, setCalendarView] = useState<SchedulerCalendarView>("month");
  const [weekStartMonday, setWeekStartMonday] = useState(() => startOfWorkWeek(new Date()));
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [dialogPost, setDialogPost] = useState<WorkspaceSchedulerPost | null>(null);
  const [addDraftPendingColumn, setAddDraftPendingColumn] = useState<number | null>(null);
  const [removingQueueId, setRemovingQueueId] = useState<string | null>(null);

  useEffect(() => {
    setPosts(initialPosts);
  }, [initialPosts]);

  const refreshAfterPublish = useCallback(() => {
    router.refresh();
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const flush = await flushDueSchedulerPosts();
      if (cancelled || !flush) return;
      if (flush.published > 0 || flush.failed > 0) {
        refreshAfterPublish();
        if (flush.published > 0) {
          toast.success(flush.published === 1 ? "Published 1 scheduled post" : `Published ${flush.published} scheduled posts`);
        }
        if (flush.failed > 0) {
          toast.error(flush.errors[0]?.message ?? `Failed to publish ${flush.failed} post(s)`);
        }
      }
    })();
    const interval = window.setInterval(() => {
      void flushDueSchedulerPosts().then((flush) => {
        if (flush && (flush.published > 0 || flush.failed > 0)) refreshAfterPublish();
      });
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshAfterPublish]);

  useEffect(() => {
    const root = calendarPaneRef.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      wheelForwardToWindowWhenNoNestedScroll(root, e);
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [calendarView]);

  const queued = useMemo(
    () => posts.filter((p) => !p.scheduled_at).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [posts],
  );

  const scheduled = useMemo(
    () =>
      posts
        .filter((p) => Boolean(p.scheduled_at) && p.status !== "published")
        .sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!)),
    [posts],
  );

  const publishedPosts = useMemo(
    () =>
      posts
        .filter((p) => p.status === "published")
        .sort((a, b) => Date.parse(b.published_at ?? b.scheduled_at ?? b.created_at) - Date.parse(a.published_at ?? a.scheduled_at ?? a.created_at)),
    [posts],
  );

  const calendarPosts = useMemo(
    () => posts.filter((p) => Boolean(p.scheduled_at)),
    [posts],
  );

  const weekScheduledCount = useMemo(() => {
    return scheduled.filter((p) => {
      if (!p.scheduled_at) return false;
      return workWeekColumnIndex(new Date(p.scheduled_at), weekStartMonday) >= 0;
    }).length;
  }, [scheduled, weekStartMonday]);

  const monthScheduledCount = useMemo(() => {
    const mc = startOfMonth(monthCursor);
    const end = new Date(mc.getFullYear(), mc.getMonth() + 1, 0, 23, 59, 59, 999);
    const startT = mc.getTime();
    const endT = end.getTime();
    return scheduled.filter((p) => {
      if (!p.scheduled_at) return false;
      const t = new Date(p.scheduled_at).getTime();
      return t >= startT && t <= endT;
    }).length;
  }, [scheduled, monthCursor]);

  const bumpCalendar = useCallback(
    (delta: number) => {
      if (calendarView === "list") return;
      if (calendarView === "week") {
        setWeekStartMonday((ws) => {
          const n = new Date(ws);
          n.setDate(n.getDate() + delta * 7);
          return startOfWorkWeek(n);
        });
      } else {
        setMonthCursor((mc) => {
          const n = new Date(mc);
          n.setMonth(n.getMonth() + delta);
          return startOfMonth(n);
        });
      }
    },
    [calendarView],
  );

  const goToday = useCallback(() => {
    const now = new Date();
    setWeekStartMonday(startOfWorkWeek(now));
    setMonthCursor(startOfMonth(now));
  }, []);

  const periodLabel =
    calendarView === "list"
      ? "All scheduled posts"
      : calendarView === "week"
        ? formatWeekOfLabel(weekStartMonday)
        : formatMonthYearLabel(monthCursor);

  const refreshLocal = () => router.refresh();

  const handleRemoveFromQueue = useCallback(
    async (id: string) => {
      setRemovingQueueId(id);
      try {
        const res = await fetch(`/api/social-signals/review-queue/${id}`, { method: "DELETE" });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not remove draft");
        setPosts((prev) => prev.filter((p) => p.id !== id));
        setDialogPost((current) => (current?.id === id ? null : current));
        toast.success("Removed from queue");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not remove draft");
        throw e;
      } finally {
        setRemovingQueueId(null);
      }
    },
    [router],
  );

  const handleAddDraftForDay = useCallback(
    async (dayColumnIndex: number) => {
      const slotDay = new Date(weekStartMonday);
      slotDay.setDate(slotDay.getDate() + dayColumnIndex);
      slotDay.setHours(10, 0, 0, 0);
      setAddDraftPendingColumn(dayColumnIndex);
      try {
        const res = await fetch("/api/social-signals/review-queue/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: "Draft — edit body and schedule.",
            platforms: ["bluesky"],
            scheduled_at: slotDay.toISOString(),
          }),
        });
        const data = (await res.json()) as { error?: string; posts?: WorkspaceSchedulerPost[] };
        if (!res.ok) throw new Error(data.error ?? "Could not create draft");
        const created = data.posts?.[0];
        if (created) setDialogPost(created);
        toast.success("Draft added for this day");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not create draft");
      } finally {
        setAddDraftPendingColumn(null);
      }
    },
    [weekStartMonday, router],
  );

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-[color:var(--muted-foreground)]">
        Posts you <span className="font-medium text-[color:var(--foreground)]">Schedule</span> from Digest (Social preview) arrive as drafts below. Due slots publish automatically about every 5 minutes (and when you open Scheduler). Use <span className="font-medium text-[color:var(--foreground)]">Post now</span> in the editor to publish immediately. Published posts show a green <span className="font-medium text-[color:var(--foreground)]">Published</span> badge with the time they went live. Connect X in Settings before scheduling X posts.
      </p>

      <div className="grid min-h-[min(82vh,52rem)] gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,8fr)] lg:items-stretch">
        <section
          id="scheduler-queue-panel"
          className="flex h-full min-h-0 min-w-0 flex-col rounded-2xl border border-[color:var(--border)]/65 bg-[color:var(--card)]/82 p-3 shadow-[0_18px_40px_-34px_rgba(38,24,17,0.55)]"
        >
          <header className="flex items-center justify-between gap-2 border-b border-[color:var(--border)]/45 pb-2">
            <h3 className="text-sm font-semibold text-[color:var(--foreground)]">Queue · unscheduled drafts</h3>
            <span className="text-sm tabular-nums font-medium text-[color:var(--muted-foreground)]">{queued.length}</span>
          </header>
          {queued.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[color:var(--border)]/70 bg-[color:var(--background)]/92 px-4 py-10 text-center text-sm text-[color:var(--muted-foreground)]">
              Nothing waiting. Use <span className="font-medium text-[color:var(--foreground)]">Schedule</span> on a Social digest output (X / Bluesky) to send drafts here.
            </div>
          ) : (
            <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {queued.map((p) => (
                <li key={p.id}>
                  <QueueDraftCard
                    post={p}
                    onOpen={() => setDialogPost(p)}
                    onRemove={(id) => void handleRemoveFromQueue(id)}
                    removing={removingQueueId === p.id}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex h-full min-h-0 min-w-0 flex-col rounded-2xl border border-[color:var(--border)]/65 bg-[color:var(--card)]/82 p-4 shadow-[0_18px_40px_-34px_rgba(38,24,17,0.55)]">
          <header className="flex flex-col gap-3 border-b border-[color:var(--border)]/45 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">View</span>
              <div className="inline-flex rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--muted)]/15 p-0.5">
                <button
                  type="button"
                  onClick={() => setCalendarView("list")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    calendarView === "list"
                      ? "bg-[color:var(--foreground)] text-[color:var(--background)] shadow-sm"
                      : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                  }`}
                >
                  List
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCalendarView("week");
                    const mid = new Date(monthCursor);
                    mid.setDate(15);
                    setWeekStartMonday(startOfWorkWeek(mid));
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    calendarView === "week"
                      ? "bg-[color:var(--foreground)] text-[color:var(--background)] shadow-sm"
                      : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                  }`}
                >
                  Week
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCalendarView("month");
                    const anchor = new Date(weekStartMonday);
                    anchor.setDate(anchor.getDate() + 2);
                    setMonthCursor(startOfMonth(anchor));
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    calendarView === "month"
                      ? "bg-[color:var(--foreground)] text-[color:var(--background)] shadow-sm"
                      : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                  }`}
                >
                  Month
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={goToday}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--border)]/80 bg-[color:var(--card)]/90 px-3 py-1.5 text-xs font-semibold text-[color:var(--foreground)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-[color:var(--muted)]/25"
                  aria-label="Go to today"
                >
                  <CalendarTodayIcon className="h-4 w-4 shrink-0 opacity-90" />
                  Today
                </button>
                <button
                  type="button"
                  disabled={calendarView === "list"}
                  onClick={() => bumpCalendar(-1)}
                  className="rounded-lg border border-[color:var(--border)]/75 px-2.5 py-1 text-xs font-semibold text-[color:var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={
                    calendarView === "list" ? "Previous period (disabled in list view)" : calendarView === "week" ? "Previous week" : "Previous month"
                  }
                >
                  ←
                </button>
                <p className="min-w-[10rem] text-sm font-semibold text-[color:var(--foreground)] sm:min-w-[12rem]">{periodLabel}</p>
                <button
                  type="button"
                  disabled={calendarView === "list"}
                  onClick={() => bumpCalendar(1)}
                  className="rounded-lg border border-[color:var(--border)]/75 px-2.5 py-1 text-xs font-semibold text-[color:var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={
                    calendarView === "list" ? "Next period (disabled in list view)" : calendarView === "week" ? "Next week" : "Next month"
                  }
                >
                  →
                </button>
              </div>
              <span className="text-[11px] text-[color:var(--muted-foreground)]">
                {calendarView === "list"
                  ? `${scheduled.length} scheduled · full list`
                  : calendarView === "week"
                    ? `${weekScheduledCount} this week · stacked by day`
                    : `${monthScheduledCount} scheduled · full month`}
              </span>
            </div>
          </header>
          {calendarView === "week" ? <WeekVolumeStrip weekStartMonday={weekStartMonday} posts={calendarPosts} /> : null}
          <div
            ref={calendarPaneRef}
            className={
              calendarView === "month"
                ? "mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[color:var(--border)]/45 bg-[color:var(--background)]/94"
                : calendarView === "week"
                  ? "mt-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[color:var(--border)]/45 bg-[color:var(--background)]/94"
                  : "mt-4 max-h-[min(64vh,42rem)] overflow-auto overscroll-y-auto rounded-xl border border-[color:var(--border)]/45 bg-[color:var(--background)]/94"
            }
          >
            {calendarView === "list" ? (
              <SchedulerListView
                scheduled={scheduled}
                published={publishedPosts}
                onPickPost={(p) => setDialogPost(p)}
              />
            ) : calendarView === "week" ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2">
                <SchedulerWeekColumns
                  weekStartMonday={weekStartMonday}
                  posts={calendarPosts}
                  onPickPost={(p) => setDialogPost(p)}
                  showAddDraft
                  onAddDraft={handleAddDraftForDay}
                  addDraftPendingColumn={addDraftPendingColumn}
                />
              </div>
            ) : (
              <SchedulerMonthGrid monthStart={monthCursor} posts={calendarPosts} onPickPost={(p) => setDialogPost(p)} />
            )}
          </div>
        </section>
      </div>

      <SchedulerPostDialog
        post={dialogPost}
        weekStartMonday={
          dialogPost?.scheduled_at
            ? startOfWorkWeek(new Date(dialogPost.scheduled_at))
            : weekStartMonday
        }
        calendarPosts={calendarPosts}
        onClose={() => setDialogPost(null)}
        onSaved={refreshLocal}
        onRemoveFromQueue={
          dialogPost && !dialogPost.scheduled_at ? handleRemoveFromQueue : undefined
        }
      />
    </div>
  );
}
