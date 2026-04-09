/**
 * Institution is used to disambiguate common names across discovery sources.
 * Multiple synonyms: separate with ; or | (e.g. "UCSF; University of California San Francisco").
 */

const UCSF_CANONICAL = "University of California San Francisco";

export function splitInstitutionTokens(
  raw: string | null | undefined,
): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True when institution tokens indicate UCSF / UC San Francisco affiliation. */
export function institutionMentionsUcsf(
  institution: string | null | undefined,
): boolean {
  for (const t of splitInstitutionTokens(institution)) {
    const s = t.toLowerCase();
    if (/^ucsf\b/i.test(t)) return true;
    if (s.includes("university of california san francisco")) return true;
  }
  return false;
}

/** PubMed affiliations: UCSF is expanded to match short and long org strings. */
function pubmedAffiliationTokens(institution: string | null | undefined): string[] {
  const out: string[] = [];
  for (const t of splitInstitutionTokens(institution)) {
    if (/^ucsf$/i.test(t)) {
      out.push("UCSF", UCSF_CANONICAL);
    } else {
      out.push(t);
    }
  }
  return out;
}

/** PubMed: require author affiliation to match at least one token (OR). */
export function pubmedAffiliationClause(
  institution: string | null | undefined,
): string | null {
  const tokens = pubmedAffiliationTokens(institution);
  if (tokens.length === 0) return null;
  const parts = tokens.map((t) => {
    const safe = t.replace(/"/g, " ").trim();
    if (!safe) return null;
    if (/[\s,]/.test(safe)) return `"${safe}"[Affiliation]`;
    return `${safe}[Affiliation]`;
  }).filter((x): x is string => Boolean(x));
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0]! : `(${parts.join(" OR ")})`;
}

export function combinePubMedTerm(
  baseTerm: string,
  institution: string | null | undefined,
): string {
  const base = baseTerm.trim();
  const aff = pubmedAffiliationClause(institution);
  if (!aff) return base;
  if (!base) return aff;
  return `(${base}) AND (${aff})`;
}

export function textMatchesInstitution(
  haystack: string,
  institution: string | null | undefined,
): boolean {
  const tokens = splitInstitutionTokens(institution);
  if (tokens.length === 0) return true;
  const h = haystack.toLowerCase();
  return tokens.some((t) => h.includes(t.toLowerCase()));
}
