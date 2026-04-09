import type { ItemCategory, ItemStatus, SourceType } from "@/types/database";
import { archiveReasonLabel } from "@/lib/archive-reasons";

const pill =
  "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize tracking-tight";

const SOURCE_STYLES: Record<SourceType, string> = {
  pubmed:
    "bg-sky-100 text-sky-900 ring-1 ring-inset ring-sky-500/20 dark:bg-sky-950/55 dark:text-sky-100 dark:ring-sky-400/25",
  web: "bg-violet-100 text-violet-900 ring-1 ring-inset ring-violet-500/20 dark:bg-violet-950/55 dark:text-violet-100 dark:ring-violet-400/25",
  manual:
    "bg-amber-100 text-amber-950 ring-1 ring-inset ring-amber-500/25 dark:bg-amber-950/45 dark:text-amber-100 dark:ring-amber-400/20",
  lab_website:
    "bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-500/20 dark:bg-emerald-950/55 dark:text-emerald-100 dark:ring-emerald-400/25",
  reporter:
    "bg-orange-100 text-orange-950 ring-1 ring-inset ring-orange-500/30 dark:bg-orange-950/55 dark:text-orange-100 dark:ring-orange-400/25",
};

const STATUS_STYLES: Record<ItemStatus, string> = {
  new: "bg-blue-100 text-blue-900 ring-1 ring-inset ring-blue-500/20 dark:bg-blue-950/55 dark:text-blue-100 dark:ring-blue-400/25",
  reviewed:
    "bg-amber-100 text-amber-950 ring-1 ring-inset ring-amber-500/25 dark:bg-amber-950/45 dark:text-amber-100 dark:ring-amber-400/20",
  approved:
    "bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-500/20 dark:bg-emerald-950/55 dark:text-emerald-100 dark:ring-emerald-400/25",
  archived:
    "bg-neutral-200 text-neutral-800 ring-1 ring-inset ring-neutral-400/30 dark:bg-neutral-700 dark:text-neutral-100 dark:ring-neutral-500/40",
};

const CATEGORY_STYLES: Record<ItemCategory, string> = {
  paper:
    "bg-indigo-100 text-indigo-900 ring-1 ring-inset ring-indigo-500/20 dark:bg-indigo-950/55 dark:text-indigo-100 dark:ring-indigo-400/25",
  award:
    "bg-yellow-100 text-yellow-950 ring-1 ring-inset ring-yellow-500/30 dark:bg-yellow-950/40 dark:text-yellow-100 dark:ring-yellow-400/25",
  event:
    "bg-rose-100 text-rose-900 ring-1 ring-inset ring-rose-500/20 dark:bg-rose-950/55 dark:text-rose-100 dark:ring-rose-400/25",
  media:
    "bg-fuchsia-100 text-fuchsia-900 ring-1 ring-inset ring-fuchsia-500/20 dark:bg-fuchsia-950/55 dark:text-fuchsia-100 dark:ring-fuchsia-400/25",
  funding:
    "bg-teal-100 text-teal-900 ring-1 ring-inset ring-teal-500/20 dark:bg-teal-950/55 dark:text-teal-100 dark:ring-teal-400/25",
  community_update:
    "bg-cyan-100 text-cyan-900 ring-1 ring-inset ring-cyan-500/20 dark:bg-cyan-950/55 dark:text-cyan-100 dark:ring-cyan-400/25",
  other:
    "bg-neutral-200 text-neutral-800 ring-1 ring-inset ring-neutral-400/30 dark:bg-neutral-700 dark:text-neutral-100 dark:ring-neutral-500/40",
};

function categoryLabel(c: ItemCategory | null): string {
  if (!c) return "—";
  return c.replace(/_/g, " ");
}

const SOURCE_LABEL: Record<SourceType, string> = {
  pubmed: "PubMed",
  web: "Web",
  manual: "Manual",
  lab_website: "Lab website",
  reporter: "RePORTER",
};

export function sourceTypeDisplayLabel(type: SourceType): string {
  return SOURCE_LABEL[type];
}

export function SourceTypeTag({ type }: { type: SourceType }) {
  return (
    <span className={`${pill} ${SOURCE_STYLES[type]}`}>{SOURCE_LABEL[type]}</span>
  );
}

export function StatusTag({
  status,
  archiveReason,
}: {
  status: ItemStatus;
  archiveReason?: string | null;
}) {
  if (status === "archived" && archiveReason) {
    const label = archiveReasonLabel(archiveReason);
    if (label) {
      return (
        <span
          className={`${pill} ${STATUS_STYLES.archived} normal-case tracking-normal`}
          title="Archived"
        >
          {label}
        </span>
      );
    }
  }
  return <span className={`${pill} ${STATUS_STYLES[status]}`}>{status}</span>;
}

export function CategoryTag({ category }: { category: ItemCategory | null }) {
  if (!category) {
    return (
      <span
        className={`${pill} bg-neutral-100 text-neutral-500 ring-1 ring-inset ring-neutral-300/40 dark:bg-neutral-800 dark:text-neutral-400 dark:ring-neutral-600/50`}
      >
        —
      </span>
    );
  }
  return (
    <span className={`${pill} ${CATEGORY_STYLES[category]}`}>
      {categoryLabel(category)}
    </span>
  );
}
