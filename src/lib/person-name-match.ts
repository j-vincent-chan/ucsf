/**
 * Order-insensitive person-name matching (aligned with generate-blurb rules)
 * for comparing PubMed author strings to watchlist investigator display names.
 */
export function normalizePersonNameForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True if `author` is the same person as one of `candidates` (e.g. watchlist names). */
export function authorNameMatchesAnyPerson(
  author: string,
  candidates: { name: string }[],
): boolean {
  const a = author.trim();
  if (!a) return false;
  const L = normalizePersonNameForMatch(a);
  if (!L) return false;
  for (const c of candidates) {
    const p = c.name;
    if (!p.trim()) continue;
    const P = normalizePersonNameForMatch(p);
    if (!P) continue;
    if (L === P) return true;
    const lTok = L.split(" ").filter(Boolean).sort().join(" ");
    const pTok = P.split(" ").filter(Boolean).sort().join(" ");
    if (lTok === pTok) return true;
  }
  return false;
}
