const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function ncbiKeyParam(): string {
  const key = process.env.NCBI_API_KEY?.trim();
  return key ? `&api_key=${encodeURIComponent(key)}` : "";
}

function tagText(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i").exec(block);
  const v = m?.[1]?.trim();
  return v || null;
}

/**
 * PubMed-style abbreviated listing (eSummary / stored last_author), e.g. "Li J",
 * "Eyquem J", "MacKenzie TC". Not used for full names like "Jingjing Li".
 */
export function isPubmedStyleAbbrevAuthor(name: string): boolean {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  const last = parts[parts.length - 1]!;
  return /^[A-Z]{1,4}$/.test(last);
}

/** Last listed author block in a PubMedArticle `efetch` XML payload. */
export function parseLastAuthorFullNameFromPubmedFetchXml(xml: string): string | null {
  const blocks = [...xml.matchAll(/<Author\b[^>]*>([\s\S]*?)<\/Author>/gi)];
  if (blocks.length === 0) return null;
  const lastBlock = blocks[blocks.length - 1]![1]!;
  const collective = tagText(lastBlock, "CollectiveName");
  if (collective) return collective.replace(/\s+/g, " ").trim();
  const lastName = tagText(lastBlock, "LastName");
  if (!lastName) return null;
  const foreName = tagText(lastBlock, "ForeName");
  const initials = tagText(lastBlock, "Initials");
  const suffix = tagText(lastBlock, "Suffix");
  const fore = foreName?.trim() || null;
  if (fore) {
    const parts = [fore, lastName];
    if (suffix) parts.push(suffix);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }
  if (initials) {
    const parts = [initials, lastName];
    if (suffix) parts.push(suffix);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }
  return lastName;
}

/** ForeName + LastName (or collective) for the last author via `efetch` XML. */
export async function fetchPubmedLastAuthorFullNameByPmid(pmid: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${EUTILS}/efetch.fcgi?db=pubmed&retmode=xml&id=${encodeURIComponent(pmid)}${ncbiKeyParam()}`,
      { headers: { "User-Agent": "CommunitySignalDigest/1.0 (pubmed-last-author)" } },
    );
    if (!res.ok) return null;
    const xml = await res.text();
    return parseLastAuthorFullNameFromPubmedFetchXml(xml);
  } catch {
    return null;
  }
}
