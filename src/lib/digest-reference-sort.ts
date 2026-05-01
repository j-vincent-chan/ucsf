import { authorNameMatchesAnyPerson } from "@/lib/person-name-match";
import { fundingAwardAmountUsdFromRawSummary } from "@/lib/funding-award-amount-from-summary";
import type { ScimagoSjrLookup } from "@/lib/scimago-sjr-lookup";
import { scimagoSjrScoreForPaper } from "@/lib/scimago-sjr-lookup";
import { fundingPiFamilySortKey, paperFirstAuthorFamilySortKey } from "@/lib/reference-author-sort-key";

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
  published_at: string | null;
  found_at: string;
};

export type ReferencePreviewRow = {
  source_item_id: string;
  title: string;
  reference?: string;
  error?: string;
  /** PubMed author lists for papers — enables author truncate toggle in preview/copy without regenerating. */
  paper_author_list_full?: string | null;
  paper_author_list_truncated?: string | null;
};

/** How Publications / references are ordered in the digest preview and bulk copy. */
export type ReferencePublicationsSortMode = "recent" | "alphabetical" | "impact";

function paperLedByWatchlistInv(item: DigestReferenceSortableItem): boolean {
  if (item.category !== "paper") return false;
  if (item.investigators.length === 0) return false;
  if (item.pi_name && authorNameMatchesAnyPerson(item.pi_name, item.investigators)) return true;
  if (item.penultimate_author_name && authorNameMatchesAnyPerson(item.penultimate_author_name, item.investigators)) {
    return true;
  }
  return false;
}

function signalDateMs(item: DigestReferenceSortableItem | undefined): number {
  if (!item) return 0;
  const iso = item.published_at ?? item.found_at;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * **Papers — recent:** newest `published_at` / `found_at` first, then title.
 * **Papers — alphabetical:** first author’s family name (from formatted reference line), then title.
 * **Papers — impact:** Impact factor sort via SCImago SJR (highest first); ties → watchlist-led paper first → title.
 * **Funding — recent:** same date rule; title tie-break.
 * **Funding — alphabetical:** PI family name from formatted reference (first segment before `.`), then title.
 * **Funding — impact:** parsed award USD from `raw_summary` (highest first; NIH: `Award: $…`); ties → title.
 */
export function sortOutputPreviewReferenceRows(
  results: ReferencePreviewRow[],
  category: "papers" | "funding",
  byId: Map<string, DigestReferenceSortableItem>,
  mode: ReferencePublicationsSortMode,
  scimagoLookup: ScimagoSjrLookup | null,
): ReferencePreviewRow[] {
  return [...results].sort((a, b) => {
    const A = byId.get(a.source_item_id);
    const B = byId.get(b.source_item_id);

    if (category === "papers") {
      if (mode === "recent") {
        const tb = signalDateMs(B);
        const ta = signalDateMs(A);
        if (tb !== ta) return tb - ta;
      } else if (mode === "alphabetical") {
        const ka = paperFirstAuthorFamilySortKey(a.reference);
        const kb = paperFirstAuthorFamilySortKey(b.reference);
        const cmp = ka.localeCompare(kb, undefined, { sensitivity: "base" });
        if (cmp !== 0) return cmp;
      } else {
        const ia = A ? scimagoSjrScoreForPaper(scimagoLookup, A.raw_summary, a.reference) : 0;
        const ib = B ? scimagoSjrScoreForPaper(scimagoLookup, B.raw_summary, b.reference) : 0;
        if (ib !== ia) return ib - ia;
        const pa = A ? (paperLedByWatchlistInv(A) ? 1 : 0) : 0;
        const pb = B ? (paperLedByWatchlistInv(B) ? 1 : 0) : 0;
        if (pb !== pa) return pb - pa;
      }
    } else {
      if (mode === "recent") {
        const tb = signalDateMs(B);
        const ta = signalDateMs(A);
        if (tb !== ta) return tb - ta;
      } else if (mode === "alphabetical") {
        const ka = fundingPiFamilySortKey(a.reference);
        const kb = fundingPiFamilySortKey(b.reference);
        const cmp = ka.localeCompare(kb, undefined, { sensitivity: "base" });
        if (cmp !== 0) return cmp;
      } else {
        const fa = A ? fundingAwardAmountUsdFromRawSummary(A.raw_summary) : 0;
        const fb = B ? fundingAwardAmountUsdFromRawSummary(B.raw_summary) : 0;
        if (fb !== fa) return fb - fa;
      }
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
    | "published_at"
    | "found_at"
  >[],
): Map<string, DigestReferenceSortableItem> {
  const m = new Map<string, DigestReferenceSortableItem>();
  for (const it of items) m.set(it.id, it);
  return m;
}
