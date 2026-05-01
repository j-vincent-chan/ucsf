/**
 * Best-effort USD amount for ordering funding references (highest first).
 * NIH RePORTER discovery stores `Award: $1,234,567` in `raw_summary`
 * (see `nih-reporter.ts`).
 */
export function fundingAwardAmountUsdFromRawSummary(rawSummary: string | null | undefined): number {
  if (!rawSummary?.trim()) return 0;
  const award = rawSummary.match(/Award:\s*\$\s*([\d,]+(?:\.\d+)?)/i);
  if (award?.[1]) {
    const n = Number(award[1].replace(/,/g, ""));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  const anyUsd = rawSummary.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (anyUsd?.[1]) {
    const n = Number(anyUsd[1].replace(/,/g, ""));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return 0;
}
