/**
 * Best-effort journal impact for digest reference *ordering*. Values are
 * approximate (recent-year style IF); unknown journals sort as 0 unless
 * `raw_summary` includes an explicit `Impact factor: N` or `JIF: N` segment.
 */
/** Normalize journal labels for SCImago / heuristic substring matching. */
export function normJournalForImpactMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[.,&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const JOURNAL_IF_PATTERNS: { pattern: string; if: number }[] = [
  { pattern: "nature reviews immunology", if: 100 },
  { pattern: "nature reviews cancer", if: 78 },
  { pattern: "nature reviews molecular cell biology", if: 64 },
  { pattern: "nature reviews rheumatology", if: 33 },
  { pattern: "nature medicine", if: 82 },
  { pattern: "nature reviews drug discovery", if: 64 },
  { pattern: "nature biotechnology", if: 46 },
  { pattern: "nature immunology", if: 30 },
  { pattern: "nature communications", if: 16 },
  { pattern: "nature cell biology", if: 21 },
  /**
   * PubMed and citations often use “Nat Rev …” — does not include the letters “nature” as
   * a substring, so a dedicated pattern is required.
   */
  { pattern: "nat rev", if: 32 },
  { pattern: "nature", if: 64 },
  { pattern: "dermatol ther", if: 4.2 },
  { pattern: "dermatology and therapy", if: 4.2 },
  { pattern: "science immunology", if: 17 },
  { pattern: "science", if: 45 },
  { pattern: "cell", if: 64 },
  { pattern: "immunity", if: 20 },
  { pattern: "new england journal of medicine", if: 91 },
  { pattern: "nejm", if: 91 },
  { pattern: "the lancet", if: 99 },
  { pattern: "jama", if: 120 },
  { pattern: "journal of experimental medicine", if: 16 },
  { pattern: "j exp med", if: 16 },
  { pattern: "j clin invest", if: 15 },
  { pattern: "the journal of clinical investigation", if: 15 },
  { pattern: "jci", if: 15 },
  { pattern: "journal of clinical investigation", if: 15 },
  { pattern: "journal of immunology", if: 4 },
  { pattern: "j immunol", if: 4 },
  { pattern: "blood advances", if: 7 },
  { pattern: "pnas", if: 11 },
  { pattern: "proceedings of the national academy", if: 11 },
  { pattern: "cell host & microbe", if: 20 },
  { pattern: "cell host and microbe", if: 20 },
  { pattern: "cancer cell", if: 44 },
  { pattern: "cell reports", if: 8 },
  { pattern: "cell metabolism", if: 29 },
  { pattern: "cancer research", if: 11 },
  { pattern: "cancer res", if: 11 },
  { pattern: "plos one", if: 3 },
  { pattern: "elife", if: 7 },
  { pattern: "frontiers in immunology", if: 7 },
  { pattern: "european journal of immunology", if: 5 },
  { pattern: "sci adv", if: 11 },
  { pattern: "science advances", if: 11 },
].sort((a, b) => b.pattern.length - a.pattern.length);

export function parseExplicitImpactFactorFromRawSummary(raw: string | null | undefined): number {
  if (!raw) return 0;
  for (const part of raw.split(" · ")) {
    const t = part.trim();
    const low = t.toLowerCase();
    if (low.startsWith("impact factor:")) {
      const v = Number.parseFloat(
        t.slice("impact factor:".length).replace(/[^0-9.+-]/g, "").trim(),
      );
      if (Number.isFinite(v)) return v;
    } else if (low.startsWith("impact_factor:")) {
      const v = Number.parseFloat(
        t.slice("impact_factor:".length).replace(/[^0-9.+-]/g, "").trim(),
      );
      if (Number.isFinite(v)) return v;
    } else if (low.startsWith("jif:")) {
      const v = Number.parseFloat(
        t.slice(3).replace(/[^0-9.+-]/g, "").trim(),
      );
      if (Number.isFinite(v)) return v;
    }
  }
  return 0;
}

export function parseJournalNameFromRawSummaryForPaper(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const part = raw
    .split(" · ")
    .map((x) => x.trim())
    .find((x) => x.toLowerCase().startsWith("journal:"));
  if (!part) return null;
  const v = part.slice("journal:".length).trim();
  return v || null;
}

/**
 * `Author. "Title." **Journal** 2026; …` — the journal is between the close-quote and
 * 4-digit year. Using this fixes ordering when the stored `raw_summary` journal
 * (abbrev/encoding) does not match our heuristics.
 */
export function extractJournalFromFormattedReferenceLine(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const t = ref.replace(/[\r\n\t]+/g, " ");
  // Take the last “Title” … (journal)… Year match; journal has no leading digits.
  const re =
    /[\u201c"]([^\u201c\u201d"]*?)[\u201d"]\s*\.?\s*([^\d]+?)\s*(20[0-9][0-9]|\b19[0-9][0-9]\b)(?=[\s;,:]|\s*\(|$)/gi;
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((m = re.exec(t)) !== null) last = m;
  if (!last?.[2]) return null;
  return last[2].replace(/\s+/g, " ").replace(/^[\s.]+|[\s.]+$/g, "").trim() || null;
}

function firstMatchingPatternScore(n: string): number {
  for (const { pattern, if: score } of JOURNAL_IF_PATTERNS) {
    if (n.includes(pattern)) return score;
  }
  return 0;
}

/** @internal Used by SCImago lookup when `journal:` is missing from raw_summary. */
export function journalLabelFromRawSummaryHeuristic(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw
    .split(" · ")
    .map((x) => x.trim())
    .find(
      (x) =>
        x.length > 0 &&
        !x.toLowerCase().startsWith("doi:") &&
        !x.toLowerCase().startsWith("last_author:") &&
        !x.toLowerCase().startsWith("penultimate_author:") &&
        !x.toLowerCase().startsWith("journal:") &&
        !x.toLowerCase().startsWith("impact factor:") &&
        !x.toLowerCase().startsWith("impact_factor:") &&
        !x.toLowerCase().startsWith("jif:"),
    );
  return first || null;
}

/**
 * @param formattedReferenceLine – optional generated reference line; journal is parsed from
 *   `… "Title." **Journal** YYYY;` which aligns IF ordering with what editors see in preview.
 */
export function approxImpactFactorForPaperSort(
  rawSummary: string | null | undefined,
  formattedReferenceLine: string | null | undefined = undefined,
): number {
  const fromRaw = parseExplicitImpactFactorFromRawSummary(rawSummary ?? null);
  if (fromRaw > 0) return fromRaw;
  const rawLabel =
    parseJournalNameFromRawSummaryForPaper(rawSummary) ?? journalLabelFromRawSummaryHeuristic(rawSummary);
  const fromLine = extractJournalFromFormattedReferenceLine(formattedReferenceLine);
  return Math.max(
    rawLabel ? firstMatchingPatternScore(normJournalForImpactMatch(rawLabel)) : 0,
    fromLine ? firstMatchingPatternScore(normJournalForImpactMatch(fromLine)) : 0,
  );
}
