import {
  extractJournalFromFormattedReferenceLine,
  journalLabelFromRawSummaryHeuristic,
  normJournalForImpactMatch,
  parseJournalNameFromRawSummaryForPaper,
} from "@/lib/journal-impact-sort";

/** Shape of `src/data/scimago-sjr-lookup.json` (built from SCImago CSV). */
export type ScimagoSjrLookup = {
  v: number;
  source?: string;
  byIssn: Record<string, number>;
  byTitleNorm: Record<string, number>;
};

function extractIssnDigitKeys(text: string): string[] {
  const keys = new Set<string>();
  if (!text.trim()) return [];
  const hyphen8 = /\b(\d{4})[\s-–](\d{4})\b/g;
  let m: RegExpExecArray | null;
  while ((m = hyphen8.exec(text)) !== null) {
    keys.add(m[1] + m[2]);
  }
  const hyphenX = /\b(\d{4})[\s-–](\d{3}[\dXx])\b/g;
  while ((m = hyphenX.exec(text)) !== null) {
    const left = m[1];
    const right = m[2].replace(/[^0-9]/gi, "");
    if (right.length === 4) keys.add(left + right);
  }
  const labeled = /ISSN[:\s]*([\d\s-–X]{10,25})/gi;
  while ((m = labeled.exec(text)) !== null) {
    const d = m[1].replace(/[^0-9]/gi, "");
    if (d.length === 8) keys.add(d);
  }
  return [...keys];
}

function bumpBest(best: number, v: number): number {
  return v > best ? v : best;
}

/**
 * Highest matching SCImago SJR for a paper row (issn + normalized journal title).
 * Unknown journals → 0.
 */
export function scimagoSjrScoreForPaper(
  lookup: ScimagoSjrLookup | null | undefined,
  rawSummary: string | null | undefined,
  formattedReferenceLine: string | null | undefined,
): number {
  if (!lookup?.byIssn || !lookup.byTitleNorm) return 0;
  const ref = formattedReferenceLine ?? "";
  const raw = rawSummary ?? "";
  let best = 0;
  for (const issn of extractIssnDigitKeys(ref)) {
    best = bumpBest(best, lookup.byIssn[issn] ?? 0);
  }
  for (const issn of extractIssnDigitKeys(raw)) {
    best = bumpBest(best, lookup.byIssn[issn] ?? 0);
  }
  const journalCandidates = [
    extractJournalFromFormattedReferenceLine(ref),
    parseJournalNameFromRawSummaryForPaper(raw),
    journalLabelFromRawSummaryHeuristic(raw),
  ];
  for (const j of journalCandidates) {
    if (!j) continue;
    const key = normJournalForImpactMatch(j);
    if (key) best = bumpBest(best, lookup.byTitleNorm[key] ?? 0);
  }
  return best;
}
