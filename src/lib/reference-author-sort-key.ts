/**
 * Sort keys for digest reference ordering — derived from formatted reference lines
 * (`draft-reference` output), not from signal titles.
 */

function normalizeFamilyKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Text before the article title quote in a paper reference: `Author list. "Title." …` */
function extractPaperAuthorListPrefix(reference: string | null | undefined): string {
  if (!reference?.trim()) return "";
  const t = reference.replace(/[\r\n\t]+/g, " ").trim();
  const m = /^(.+?)\.\s+[\u201c"]/.exec(t);
  const segment = (m?.[1] ?? t.split(".")[0] ?? "").trim();
  return segment.replace(/,\s*et al\.?$/i, "").trim();
}

/**
 * PubMed-style first author segment: `Smith JA` or `De Silva MA` — drop trailing initials,
 * keep compound surnames as one string for localeCompare.
 */
function familyKeyFromFirstAuthorSegment(firstAuthorSegment: string): string {
  const seg = firstAuthorSegment.trim();
  if (!seg) return "";
  const tokens = seg.split(/\s+/).filter(Boolean);
  while (
    tokens.length > 1 &&
    (/^[A-Z]\.?$/i.test(tokens[tokens.length - 1]!) ||
      /^[A-Z]{2,4}$/.test(tokens[tokens.length - 1]!))
  ) {
    tokens.pop();
  }
  return normalizeFamilyKey(tokens.join(" "));
}

/** Papers: first listed author's family name (best-effort). */
export function paperFirstAuthorFamilySortKey(reference: string | null | undefined): string {
  const prefix = extractPaperAuthorListPrefix(reference);
  const firstAuthor = prefix.split(",")[0]?.trim() ?? "";
  return familyKeyFromFirstAuthorSegment(firstAuthor);
}

/**
 * Funding refs: `PI Name. Project title…` — PI last token (Western order) or segment before comma.
 */
export function fundingPiFamilySortKey(reference: string | null | undefined): string {
  const seg = reference?.split(".")[0]?.trim() ?? "";
  if (!seg) return "";
  if (seg.includes(",")) {
    return normalizeFamilyKey(seg.split(",")[0]!.trim());
  }
  const tokens = seg.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";
  while (
    tokens.length > 1 &&
    (/^[A-Z]\.?$/i.test(tokens[tokens.length - 1]!) ||
      /^[A-Z]{2,4}$/.test(tokens[tokens.length - 1]!))
  ) {
    tokens.pop();
  }
  return normalizeFamilyKey(tokens[tokens.length - 1] ?? "");
}
