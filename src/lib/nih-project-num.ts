/** Uppercase, trim, collapse internal spaces — stored on source_items.nih_project_num */
export function formatNihProjectNumStored(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** NIH application type prefix digit (1=new, 5=non-competing continuation, …). */
export function parseNihApplTypeCodeFromProjectNum(raw: string | null | undefined): string | null {
  const s = formatNihProjectNumStored(raw ?? "");
  if (!s) return null;
  const m = /^([1-9])/.exec(s);
  return m ? m[1]! : null;
}

/** Support year from trailing segment (e.g. `5R01HL178954-02` → 2, `2R01HL134183-09A1` → 9). */
export function parseNihSupportYearFromProjectNum(raw: string | null | undefined): number | null {
  const s = formatNihProjectNumStored(raw ?? "");
  if (!s) return null;
  const m = /-(\d{2})(?:[A-Z]\d*)?(?:S\d+)?$/i.exec(s);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return n >= 1 && n <= 99 ? n : null;
}

/** Grant number in title suffix `(5R01HL178954-02)`. */
export function extractNihProjectNumFromTitle(title: string | null | undefined): string | null {
  const t = (title ?? "").trim();
  const m = /\(([0-9][0-9A-Z]{4,}-[0-9]{2}[A-Z0-9,]*)\)\s*$/i.exec(t);
  return m ? formatNihProjectNumStored(m[1]!) : null;
}

export function resolveNihProjectNumForItem(input: {
  nih_project_num?: string | null;
  title?: string | null;
}): string | null {
  const stored = input.nih_project_num?.trim();
  if (stored) return formatNihProjectNumStored(stored);
  return extractNihProjectNumFromTitle(input.title);
}

/** Human label for digest UI + generation (distinguishes year-2+ continuation from new awards). */
export function nihFundingSupportYearLabel(projNum: string | null | undefined): string | null {
  const sy = parseNihSupportYearFromProjectNum(projNum);
  if (sy == null) return null;
  const code = parseNihApplTypeCodeFromProjectNum(projNum);
  if (code === "1" && sy === 1) return "New award";
  if (code === "5" && sy >= 2) {
    return `Support year ${sy} · continuing award`;
  }
  if (sy >= 2) return `Support year ${sy}`;
  return `Support year ${sy}`;
}

/** True when grant suffix indicates renewal (yr 2+) rather than a new award. */
export function isNihContinuingSupportYear(projNum: string | null | undefined): boolean {
  const sy = parseNihSupportYearFromProjectNum(projNum);
  if (sy == null) return false;
  const code = parseNihApplTypeCodeFromProjectNum(projNum);
  return (code === "5" && sy >= 2) || sy >= 2;
}

export type NihFundingDashboardBucket = "new_funding" | "active_grant";

/** Dashboard KPIs / charts: new NIH awards (type 1, yr 1) vs continuing (type 5, yr 2+, etc.). */
export function nihFundingDashboardBucket(input: {
  category: string | null;
  source_type: string | null;
  nih_project_num?: string | null;
  title?: string | null;
}): NihFundingDashboardBucket | null {
  if (input.category !== "funding") return null;
  if (input.source_type !== "reporter") return "new_funding";
  return isNihNewFundingForSignalsQueue(input) ? "new_funding" : "active_grant";
}

/** NIH continuing / non–year-1 funding (RePORTER type 5 and similar). */
export function isNihActiveGrantForDashboard(input: {
  category: string | null;
  source_type: string | null;
  nih_project_num?: string | null;
  title?: string | null;
}): boolean {
  return nihFundingDashboardBucket(input) === "active_grant";
}

/** Signals approval queue: only new (type 1) year-1 NIH funding; continuing awards use grant_type=active on Signals. */
export function isNihNewFundingForSignalsQueue(input: {
  category: string | null;
  source_type: string | null;
  nih_project_num?: string | null;
  title?: string | null;
}): boolean {
  if (input.category !== "funding" || input.source_type !== "reporter") return true;
  const proj = resolveNihProjectNumForItem({
    nih_project_num: input.nih_project_num,
    title: input.title,
  });
  if (!proj) return true;
  if (isNihContinuingSupportYear(proj)) return false;
  const code = parseNihApplTypeCodeFromProjectNum(proj);
  const sy = parseNihSupportYearFromProjectNum(proj);
  return code === "1" && (sy == null || sy === 1);
}

/**
 * Digest Active Drafts: NIH new awards only (application type 1, support year 1).
 * Competing renewals (type 2+), continuances (type 5 yr 2+), etc. are excluded.
 */
export function isNihFundingForDigestActiveDrafts(input: {
  category: string | null;
  source_type: string | null;
  nih_project_num?: string | null;
  title?: string | null;
}): boolean {
  if (input.category !== "funding" || input.source_type !== "reporter") return true;
  const proj = resolveNihProjectNumForItem({
    nih_project_num: input.nih_project_num,
    title: input.title,
  });
  if (!proj) return true;
  if (isNihContinuingSupportYear(proj)) return false;
  const code = parseNihApplTypeCodeFromProjectNum(proj);
  const sy = parseNihSupportYearFromProjectNum(proj);
  return code === "1" && (sy == null || sy === 1);
}

/**
 * Digest References → Funding: same as Active Drafts — new NIH (type 1, yr 1) and non-RePORTER grants only.
 * Continuing / renewal awards (type 5 yr 2+, competing renewals, etc.) are excluded from the digest workspace.
 */
export function isNihFundingForDigestReferences(input: {
  category: string | null;
  source_type: string | null;
  nih_project_num?: string | null;
  title?: string | null;
}): boolean {
  return isNihFundingForDigestActiveDrafts(input);
}

/**
 * Canonical key for signal_group_key + RePORTER per-run dedupe: same underlying award across
 * NIH application-type prefixes (1–9 before the activity code) and supplement suffixes (S1, S2, …).
 * Example: 3R01AI175312-04S2, 5R01AI175312-04, 3R01AI175312-04S1 → R01AI175312-04
 */
export function canonicalNihProjectNumForDedup(raw: string): string {
  let s = formatNihProjectNumStored(raw);
  s = s.replace(/S\d+$/i, "");
  s = s.replace(/^([1-9])([A-Z].*)$/, "$2");
  return s;
}
