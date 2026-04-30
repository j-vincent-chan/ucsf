import { authorNameMatchesAnyPerson } from "@/lib/person-name-match";
import { approxImpactFactorForPaperSort } from "@/lib/journal-impact-sort";

/** Minimal fields for ordering references in the monthly digest output preview. */
export type DigestReferenceSortableItem = {
  id: string;
  title: string;
  category: string | null;
  raw_summary: string | null;
  pi_name: string | null;
  /** Second-to-last PubMed author when available (co–corresponding / co-senior heuristic). */
  penultimate_author_name: string | null;
  /** Primary `tracked_entity_id` on the source item (funding: contact / lead PI in our model). */
  primary_tracked_entity_id: string | null;
  investigators: { id: string; name: string }[];
};

export type ReferencePreviewRow = {
  source_item_id: string;
  title: string;
  reference?: string;
  error?: string;
};

function paperLedByWatchlistInv(item: DigestReferenceSortableItem): boolean {
  if (item.category !== "paper") return false;
  if (item.investigators.length === 0) return false;
  if (item.pi_name && authorNameMatchesAnyPerson(item.pi_name, item.investigators)) return true;
  if (item.penultimate_author_name && authorNameMatchesAnyPerson(item.penultimate_author_name, item.investigators)) {
    return true;
  }
  return false;
}

function fundingLeadPIOnWatchlist(item: DigestReferenceSortableItem): boolean {
  if (item.category !== "funding") return false;
  if (!item.primary_tracked_entity_id) return false;
  return item.investigators.some((i) => i.id === item.primary_tracked_entity_id);
}

/**
 * **Papers:** (1) Journal impact (approximate IF, highest first) — the main signal editors expect.
 * (2) If IF ties, watchlist-led (last or co–last author matches a linked investigator) is listed first.
 * (3) Title, last. **Funding:** lead PI on watchlist first, then title.
 */
export function sortOutputPreviewReferenceRows(
  results: ReferencePreviewRow[],
  category: "papers" | "funding",
  byId: Map<string, DigestReferenceSortableItem>,
): ReferencePreviewRow[] {
  return [...results].sort((a, b) => {
    const A = byId.get(a.source_item_id);
    const B = byId.get(b.source_item_id);
    if (category === "papers") {
      const ia = A ? approxImpactFactorForPaperSort(A.raw_summary, a.reference) : 0;
      const ib = B ? approxImpactFactorForPaperSort(B.raw_summary, b.reference) : 0;
      if (ib !== ia) return ib - ia; // higher IF first
      const pa = A ? (paperLedByWatchlistInv(A) ? 1 : 0) : 0;
      const pb = B ? (paperLedByWatchlistInv(B) ? 1 : 0) : 0;
      if (pb !== pa) return pb - pa;
    } else {
      const fa = A ? (fundingLeadPIOnWatchlist(A) ? 1 : 0) : 0;
      const fb = B ? (fundingLeadPIOnWatchlist(B) ? 1 : 0) : 0;
      if (fa !== fb) return fb - fa;
    }
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

export function buildDigestItemSortMap(
  items: Pick<
    DigestReferenceSortableItem,
    | "id"
    | "title"
    | "category"
    | "raw_summary"
    | "pi_name"
    | "penultimate_author_name"
    | "primary_tracked_entity_id"
    | "investigators"
  >[],
): Map<string, DigestReferenceSortableItem> {
  const m = new Map<string, DigestReferenceSortableItem>();
  for (const it of items) m.set(it.id, it);
  return m;
}
