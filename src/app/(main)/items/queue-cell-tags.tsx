import type { ItemCategory, ItemStatus, SourceType } from "@/types/database";
import { archiveReasonLabel } from "@/lib/archive-reasons";

const pill =
  "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize tracking-tight";

const SOURCE_STYLES: Record<SourceType, string> = {
  pubmed:
    "bg-[#e4ebf2] text-[#50657d] ring-1 ring-inset ring-[#7c8fa8]/25",
  web: "bg-[#e6ece9] text-[#5b7560] ring-1 ring-inset ring-[#7b977f]/25",
  manual:
    "bg-[#f2e5d9] text-[#8e6847] ring-1 ring-inset ring-[#c9955b]/25",
  lab_website:
    "bg-[#e5eee8] text-[#5c765f] ring-1 ring-inset ring-[#7b977f]/25",
  reporter:
    "bg-[#f3e3d7] text-[#996648] ring-1 ring-inset ring-[#c9955b]/28",
};

const STATUS_STYLES: Record<ItemStatus, string> = {
  new: "bg-[#e4ebf2] text-[#50657d] ring-1 ring-inset ring-[#7c8fa8]/25",
  reviewed:
    "bg-[#f2e5d9] text-[#8e6847] ring-1 ring-inset ring-[#c9955b]/25",
  approved:
    "bg-[#e5eee8] text-[#5c765f] ring-1 ring-inset ring-[#7b977f]/25",
  archived:
    "bg-[#ede4db] text-[#75665d] ring-1 ring-inset ring-[#9a8d84]/30",
};

const CATEGORY_STYLES: Record<ItemCategory, string> = {
  paper:
    "bg-[#e4ebf2] text-[#50657d] ring-1 ring-inset ring-[#7c8fa8]/25",
  award:
    "bg-[#f3e3d7] text-[#996648] ring-1 ring-inset ring-[#c9955b]/28",
  event:
    "bg-[#f0e0e6] text-[#8a6272] ring-1 ring-inset ring-[#b47f93]/26",
  media:
    "bg-[#f2e0e2] text-[#8a5961] ring-1 ring-inset ring-[#a66b72]/26",
  funding:
    "bg-[#e5eee8] text-[#5c765f] ring-1 ring-inset ring-[#7b977f]/25",
  community_update:
    "bg-[#e3edee] text-[#55797b] ring-1 ring-inset ring-[#73979a]/25",
  other:
    "bg-[#ede4db] text-[#75665d] ring-1 ring-inset ring-[#9a8d84]/30",
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
        className={`${pill} bg-[#f3ece4] text-[#8d7c71] ring-1 ring-inset ring-[#d5c6b8]/65`}
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
