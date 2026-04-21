/** Uppercase, trim, collapse internal spaces — stored on source_items.nih_project_num */
export function formatNihProjectNumStored(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
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
