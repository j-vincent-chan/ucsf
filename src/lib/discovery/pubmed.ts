import type { ItemCategory } from "@/types/database";
import { combinePubMedTerm } from "./institution-query";
import type { DiscoveryCandidate } from "./types";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

/** esearch page size; esummary is batched to the same chunk size. */
const PMID_PAGE = 200;

/** Hard safety cap per investigator per run (even deep backfills). */
const PMID_HARD_CAP = 5000;

function ncbiParams(): string {
  const key = process.env.NCBI_API_KEY?.trim();
  return key ? `&api_key=${encodeURIComponent(key)}` : "";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Reads the `term` query from a PubMed / NCBI search URL for use as an esearch query.
 */
export function extractPubMedSearchTermFromUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let url: URL;
  try {
    url = new URL(s, "https://pubmed.ncbi.nlm.nih.gov/");
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (
    !host.includes("pubmed.ncbi.nlm.nih.gov") &&
    !host.endsWith("ncbi.nlm.nih.gov")
  ) {
    return null;
  }
  const term = url.searchParams.get("term");
  if (!term?.trim()) return null;
  return term.trim();
}

function parseSortPubDate(sortpubdate: string | undefined): string | null {
  if (!sortpubdate) return null;
  const m = sortpubdate.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`;
}

function extractLastAuthorName(art: Record<string, unknown>): string | null {
  const authors = Array.isArray(art.authors)
    ? (art.authors as { name?: string }[])
    : [];
  const names = authors
    .map((a) => (typeof a?.name === "string" ? a.name.trim() : ""))
    .filter(Boolean);
  if (names.length === 0) return null;
  return names[names.length - 1] ?? null;
}

export type PubMedFetchOptions = {
  /** Base query (from PubMed URL term= or author-style fallback) */
  term: string;
  /** When set, AND affiliation clauses so hits match this school/org */
  institution: string | null;
  mindate: Date;
  maxdate: Date;
  trackedEntityId: string;
  /** Max PubMed IDs to fetch (paginates esearch until reached or no more hits). */
  maxResults: number;
  throttleMs: number;
};

function termAlreadyHasAffiliationFilter(term: string): boolean {
  return /\[[^\]]*affiliation[^\]]*\]/i.test(term);
}

async function esummaryBatch(
  ids: string[],
  throttleMs: number,
): Promise<{ result?: Record<string, unknown> & { uids?: string[] } }> {
  await sleep(throttleMs);
  const sumUrl =
    `${EUTILS}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}${ncbiParams()}`;
  const uRes = await fetch(sumUrl, {
    headers: { "User-Agent": "CommunitySignalDigest/1.0 (faculty-discovery)" },
  });
  if (!uRes.ok) {
    return {};
  }
  return (await uRes.json()) as {
    result?: Record<string, unknown> & { uids?: string[] };
  };
}

export async function fetchPubMedCandidates(
  opts: PubMedFetchOptions,
): Promise<{ candidates: DiscoveryCandidate[]; error?: string }> {
  const candidates: DiscoveryCandidate[] = [];
  const base = opts.term.trim();
  if (!base) return { candidates };

  const inst =
    opts.institution?.trim() && !termAlreadyHasAffiliationFilter(base)
      ? opts.institution
      : null;
  const term = combinePubMedTerm(base, inst).trim();
  if (!term) return { candidates };

  const md = `${opts.mindate.getFullYear()}/${String(opts.mindate.getMonth() + 1).padStart(2, "0")}/${String(opts.mindate.getDate()).padStart(2, "0")}`;
  const xd = `${opts.maxdate.getFullYear()}/${String(opts.maxdate.getMonth() + 1).padStart(2, "0")}/${String(opts.maxdate.getDate()).padStart(2, "0")}`;

  const cap = Math.min(Math.max(opts.maxResults, 1), PMID_HARD_CAP);
  const allIds: string[] = [];
  let retstart = 0;
  let totalAvailable = Number.POSITIVE_INFINITY;

  try {
    while (allIds.length < cap && retstart < totalAvailable) {
      const batchWant = Math.min(PMID_PAGE, cap - allIds.length);
      if (batchWant <= 0) break;

      await sleep(opts.throttleMs);
      const searchUrl =
        `${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&retmax=${batchWant}&retstart=${retstart}` +
        `&sort=pub+date&datetype=pdat&mindate=${md}&maxdate=${xd}` +
        `&term=${encodeURIComponent(term)}${ncbiParams()}`;

      const sRes = await fetch(searchUrl, {
        headers: { "User-Agent": "CommunitySignalDigest/1.0 (faculty-discovery)" },
      });
      if (!sRes.ok) {
        return { candidates, error: `PubMed esearch ${sRes.status}` };
      }
      const sJson = (await sRes.json()) as {
        esearchresult?: {
          idlist?: string[];
          count?: string;
        };
      };
      const er = sJson.esearchresult;
      if (typeof er?.count === "string") {
        const c = Number.parseInt(er.count, 10);
        if (Number.isFinite(c)) totalAvailable = c;
      }

      const ids = er?.idlist?.filter(Boolean) ?? [];
      if (ids.length === 0) break;

      allIds.push(...ids);
      retstart += ids.length;

      if (ids.length < batchWant) break;
    }

    if (allIds.length === 0) return { candidates };

    const idsForSummary = allIds.slice(0, cap);
    for (let i = 0; i < idsForSummary.length; i += PMID_PAGE) {
      const chunk = idsForSummary.slice(i, i + PMID_PAGE);
      const uJson = await esummaryBatch(chunk, opts.throttleMs);
      const result = uJson.result;
      const uids = result?.uids;
      if (!result || !Array.isArray(uids)) continue;

      for (const uid of uids) {
        const art = result[uid] as Record<string, unknown> | undefined;
        if (!art || typeof art !== "object") continue;
        const title = String(art.title ?? "").trim();
        if (!title) continue;
        const pmid = String(art.uid ?? uid);
        const published = parseSortPubDate(
          typeof art.sortpubdate === "string" ? art.sortpubdate : undefined,
        );
        const journal =
          typeof art.fulljournalname === "string" ? art.fulljournalname : "";
        const doiEntry = Array.isArray(art.articleids)
          ? (art.articleids as { idtype?: string; value?: string }[]).find(
              (x) => x.idtype === "doi",
            )
          : undefined;
        const doi = doiEntry?.value;
        const lastAuthor = extractLastAuthorName(art);

        candidates.push({
          tracked_entity_id: opts.trackedEntityId,
          title,
          source_url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
          source_domain: "pubmed.ncbi.nlm.nih.gov",
          published_at: published,
          raw_summary:
            [journal, doi ? `doi:${doi}` : null, lastAuthor ? `last_author:${lastAuthor}` : null]
              .filter(Boolean)
              .join(" · ") || null,
          source_type: "pubmed",
          category: "paper" as ItemCategory,
        });
      }
    }
  } catch (e) {
    return {
      candidates,
      error: e instanceof Error ? e.message : "PubMed request failed",
    };
  }

  return { candidates };
}
