/**
 * NIH RePORTER `raw_summary` is joined with ` · `. Discovery may prefix
 * `Award class: …` (new vs continuation). Structural parsers should skip that segment
 * so the first “fact” segment stays institute / org / award line.
 */

function segmentsFromRawSummary(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(" · ")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Segments with an optional leading `Award class:` chunk removed. */
export function reporterRawSummarySegmentsAfterAwardClass(
  raw: string | null | undefined,
): string[] {
  const parts = segmentsFromRawSummary(raw);
  if (parts.length > 0 && /^award class:/i.test(parts[0]!)) {
    return parts.slice(1);
  }
  return parts;
}

/** First non–award-class segment (e.g. NIH IC abbreviation) or null. */
export function reporterFirstFactAfterAwardClass(raw: string | null | undefined): string | null {
  const segs = reporterRawSummarySegmentsAfterAwardClass(raw);
  return segs[0] ?? null;
}
