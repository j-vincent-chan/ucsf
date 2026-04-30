import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { MonthlyDigestView, type DigestItemPayload } from "@/components/monthly-digest";
import { investigatorsFromSourceItemRow } from "@/lib/source-item-investigators";
import {
  currentYearMonth,
  formatMonthHeading,
  monthRangeUtc,
  parseYearMonth,
} from "@/lib/digest-month";
import type { Summary } from "@/types/database";
import { redirect } from "next/navigation";
import {
  fetchPubmedLastAuthorFullNameByPmid,
  isPubmedStyleAbbrevAuthor,
} from "@/lib/discovery/pubmed-last-author-full";
import { userFacingDbStatementTimeoutMessage } from "@/lib/db-timeout-message";

export const dynamic = "force-dynamic";

const ITEM_SELECT = `
  id,
  title,
  published_at,
  found_at,
  category,
  tracked_entity_id,
  source_type,
  source_url,
  raw_summary,
  digest_cover_has_asset
`;

/** Smaller chunks = shorter per-query work (helps under Postgres statement_timeout). */
const JUNCTION_IN_CHUNK = 120;
const SUMMARY_IN_CHUNK = 120;
const TRACKED_ENTITY_IN_CHUNK = 200;

async function fetchJunctionInChunks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  allIds: string[],
): Promise<{ data: unknown[]; error: { message: string } | null }> {
  const out: unknown[] = [];
  for (let i = 0; i < allIds.length; i += JUNCTION_IN_CHUNK) {
    const chunk = allIds.slice(i, i + JUNCTION_IN_CHUNK);
    const { data, error } = await supabase
      .from("source_item_tracked_entities")
      .select(
        `
        source_item_id,
        tracked_entity_id,
        tracked_entities!tracked_entity_id ( id, name, first_name, last_name, lab_website )
      `,
      )
      .in("source_item_id", chunk);
    if (error) {
      return { data: [], error: { message: error.message } };
    }
    if (data?.length) out.push(...data);
  }
  return { data: out, error: null };
}

async function fetchSummariesInChunks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  allIds: string[],
): Promise<{ data: Summary[]; error: { message: string } | null }> {
  const out: Summary[] = [];
  for (let i = 0; i < allIds.length; i += SUMMARY_IN_CHUNK) {
    const chunk = allIds.slice(i, i + SUMMARY_IN_CHUNK);
    const { data, error } = await supabase
      .from("summaries")
      .select(
        `
        id,
        source_item_id,
        style,
        prompt_version,
        generated_text,
        edited_text,
        final_text,
        model_name,
        created_by,
        created_at,
        updated_at
      `,
      )
      .in("source_item_id", chunk)
      .order("created_at", { ascending: false });
    if (error) return { data: [], error: { message: error.message } };
    if (data?.length) out.push(...(data as Summary[]));
  }
  return { data: out, error: null };
}

async function fetchTrackedEntitiesByIdsInChunks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<{
  data: { id: string; name: string; first_name: string; last_name: string; lab_website: string | null }[];
  error: { message: string } | null;
}> {
  const out: { id: string; name: string; first_name: string; last_name: string; lab_website: string | null }[] = [];
  for (let i = 0; i < ids.length; i += TRACKED_ENTITY_IN_CHUNK) {
    const chunk = ids.slice(i, i + TRACKED_ENTITY_IN_CHUNK);
    const { data, error } = await supabase
      .from("tracked_entities")
      .select("id, name, first_name, last_name, lab_website")
      .in("id", chunk);
    if (error) return { data: [], error: { message: error.message } };
    if (data?.length) out.push(...data);
  }
  return { data: out, error: null };
}

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function extractPubmedPmidFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
  return m?.[1] ?? null;
}

type EsummaryAuthorTail = { last: string | null; penultimate: string | null };

const PUBMED_ESUMMARY_CHUNK = 200;

function chunkStringIds(ids: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/**
 * Batched eSummary: last and penultimate PubMed author per PMID (for watchlist + co-senior ordering).
 */
async function fetchPubmedEsummaryTailsBatched(pmids: string[]): Promise<Map<string, EsummaryAuthorTail>> {
  const out = new Map<string, EsummaryAuthorTail>();
  const unique = [...new Set(pmids.filter(Boolean))];
  if (unique.length === 0) return out;
  const apiKey = process.env.NCBI_API_KEY?.trim();
  const keyParam = apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : "";
  for (const chunk of chunkStringIds(unique, PUBMED_ESUMMARY_CHUNK)) {
    if (chunk.length === 0) continue;
    try {
      const res = await fetch(
        `${EUTILS}/esummary.fcgi?db=pubmed&retmode=json&id=${chunk.map(encodeURIComponent).join(",")}${keyParam}`,
        { headers: { "User-Agent": "CommunitySignalDigest/1.0 (digest-view)" } },
      );
      if (!res.ok) continue;
      const json = (await res.json()) as {
        result?: Record<string, unknown> & { uids?: string[] };
      };
      const result = json.result;
      const uids = result?.uids;
      if (!result || !Array.isArray(uids)) continue;
      for (const uid of uids) {
        const suid = String(uid);
        const record = result[suid] as { authors?: { name?: string }[] } | undefined;
        const names = Array.isArray(record?.authors)
          ? record.authors
              .map((a) => (typeof a?.name === "string" ? a.name.trim() : ""))
              .filter(Boolean)
          : [];
        const last = names.length > 0 ? (names[names.length - 1] ?? null) : null;
        const penultimate = names.length >= 2 ? (names[names.length - 2] ?? null) : null;
        out.set(suid, { last, penultimate });
      }
    } catch {
      // Skip chunk on failure; per-item tails stay unset.
    }
  }
  return out;
}

function parsePubmedLastAuthor(rawSummary: string | null): string | null {
  if (!rawSummary) return null;
  const part = rawSummary
    .split(" · ")
    .map((x) => x.trim())
    .find((x) => x.toLowerCase().startsWith("last_author:"));
  if (!part) return null;
  const v = part.slice("last_author:".length).trim();
  return v || null;
}

function parsePubmedPenultimateFromRawSummary(rawSummary: string | null): string | null {
  if (!rawSummary) return null;
  const part = rawSummary
    .split(" · ")
    .map((x) => x.trim())
    .find((x) => x.toLowerCase().startsWith("penultimate_author:"));
  if (!part) return null;
  const v = part.slice("penultimate_author:".length).trim();
  return v || null;
}

function mapRow(
  r: {
    id: string;
    title: string;
    published_at: string | null;
    found_at: string;
    category: DigestItemPayload["category"];
    tracked_entity_id: string | null;
    source_type: DigestItemPayload["source_type"];
    source_url: string | null;
    raw_summary: string | null;
    digest_cover_has_asset: boolean | null;
  },
  junctionRows: unknown[],
  primaryTrackedEntity: unknown,
  summariesForItem: Summary[],
): DigestItemPayload {
  const summaries = [...summariesForItem];
  summaries.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const investigators = investigatorsFromSourceItemRow(primaryTrackedEntity, junctionRows).map(
    (chip) => ({
      id: chip.id,
      name: chip.name,
      first_name: chip.first_name,
      last_name: chip.last_name,
    }),
  );
  return {
    id: r.id,
    title: r.title,
    published_at: r.published_at,
    found_at: r.found_at,
    category: r.category,
    source_type: r.source_type,
    source_url: r.source_url,
    raw_summary: r.raw_summary,
    primary_tracked_entity_id: r.tracked_entity_id,
    penultimate_author_name: r.category === "paper" ? parsePubmedPenultimateFromRawSummary(r.raw_summary) : null,
    investigators,
    pi_name: r.source_type === "pubmed" ? parsePubmedLastAuthor(r.raw_summary) : null,
    digest_cover: null,
    digestCoverHasAsset: Boolean(r.digest_cover_has_asset),
    summaries,
  };
}

function monthKeyFromIso(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function DigestMonthPage({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const { profile } = await requireProfile();
  const communityId = profile.community_id;
  const { month: monthParam } = await params;
  const parsed = parseYearMonth(monthParam);
  if (!parsed) {
    redirect(`/digest/${currentYearMonth()}`);
  }
  const { year, month } = parsed;
  const heading = formatMonthHeading(year, month);
  const { startISO, endISO } = monthRangeUtc(year, month);

  const supabase = await createClient();

  const [minPubRes, minFoundRes] = await Promise.all([
    supabase
      .from("source_items")
      .select("published_at")
      .eq("community_id", communityId)
      .eq("status", "approved")
      .not("published_at", "is", null)
      .order("published_at", { ascending: true })
      .limit(1),
    supabase
      .from("source_items")
      .select("found_at")
      .eq("community_id", communityId)
      .eq("status", "approved")
      .is("published_at", null)
      .order("found_at", { ascending: true })
      .limit(1),
  ]);

  const [pubRes, foundRes] = await Promise.all([
    supabase
      .from("source_items")
      .select(ITEM_SELECT)
      .eq("community_id", communityId)
      .eq("status", "approved")
      .gte("published_at", startISO)
      .lte("published_at", endISO),
    supabase
      .from("source_items")
      .select(ITEM_SELECT)
      .eq("community_id", communityId)
      .eq("status", "approved")
      .is("published_at", null)
      .gte("found_at", startISO)
      .lte("found_at", endISO),
  ]);

  const byPub = pubRes.data ?? [];
  const byFound = foundRes.data ?? [];
  const loadErr = pubRes.error ?? foundRes.error;

  const junctionByItem = new Map<string, unknown[]>();
  const summariesByItem = new Map<string, Summary[]>();
  const trackedEntityById = new Map<
    string,
    { id: string; name: string; first_name: string; last_name: string; lab_website: string | null }
  >();
  if (!loadErr) {
    const allIds = [...new Set([...byPub, ...byFound].map((row) => row.id))];
    if (allIds.length > 0) {
      const { data: junctionRows, error: junctionErr } = await fetchJunctionInChunks(supabase, allIds);
      if (junctionErr) {
        return (
          <div className="mx-auto max-w-4xl">
            <h1 className="text-2xl font-semibold">Digest for {heading}</h1>
            <p className="mt-4 text-red-600">Failed to load digest: {userFacingDbStatementTimeoutMessage(junctionErr.message)}</p>
          </div>
        );
      }
      const { data: summariesRows, error: summariesErr } = await fetchSummariesInChunks(
        supabase,
        allIds,
      );
      if (summariesErr) {
        return (
          <div className="mx-auto max-w-4xl">
            <h1 className="text-2xl font-semibold">Digest for {heading}</h1>
            <p className="mt-4 text-red-600">Failed to load digest: {userFacingDbStatementTimeoutMessage(summariesErr.message)}</p>
          </div>
        );
      }
      for (const row of junctionRows ?? []) {
        const r = row as { source_item_id: string };
        const sid = r.source_item_id;
        const arr = junctionByItem.get(sid) ?? [];
        arr.push(row);
        junctionByItem.set(sid, arr);
      }
      for (const row of summariesRows ?? []) {
        const sid = row.source_item_id;
        const arr = summariesByItem.get(sid) ?? [];
        arr.push(row);
        summariesByItem.set(sid, arr);
      }

      const trackedEntityIds = [...new Set([...byPub, ...byFound].map((row) => row.tracked_entity_id).filter(Boolean))] as string[];
      if (trackedEntityIds.length > 0) {
        const { data: entities, error: entitiesErr } = await fetchTrackedEntitiesByIdsInChunks(
          supabase,
          trackedEntityIds,
        );
        if (entitiesErr) {
          return (
            <div className="mx-auto max-w-4xl">
              <h1 className="text-2xl font-semibold">Digest for {heading}</h1>
              <p className="mt-4 text-red-600">Failed to load digest: {userFacingDbStatementTimeoutMessage(entitiesErr.message)}</p>
            </div>
          );
        }
        for (const entity of entities) {
          trackedEntityById.set(entity.id, entity);
        }
      }
    }
  }

  const seen = new Set<string>();
  const merged: DigestItemPayload[] = [];
  const pubmedFullAuthorCache = new Map<string, string | null>();

  for (const r of byPub) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    merged.push(
      mapRow(
        r as Parameters<typeof mapRow>[0],
        junctionByItem.get(r.id) ?? [],
        (r.tracked_entity_id && trackedEntityById.get(r.tracked_entity_id)) ?? null,
        summariesByItem.get(r.id) ?? [],
      ),
    );
  }
  for (const r of byFound) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    merged.push(
      mapRow(
        r as Parameters<typeof mapRow>[0],
        junctionByItem.get(r.id) ?? [],
        (r.tracked_entity_id && trackedEntityById.get(r.tracked_entity_id)) ?? null,
        summariesByItem.get(r.id) ?? [],
      ),
    );
  }

  const paperPubmedIndices: { i: number; pmid: string }[] = [];
  for (let i = 0; i < merged.length; i++) {
    const row = merged[i]!;
    if (row.source_type !== "pubmed" || row.category !== "paper") continue;
    const pmid = extractPubmedPmidFromUrl(row.source_url);
    if (pmid) paperPubmedIndices.push({ i, pmid });
  }
  if (paperPubmedIndices.length > 0) {
    const tailByPmid = await fetchPubmedEsummaryTailsBatched(
      paperPubmedIndices.map((e) => e.pmid),
    );
    for (const { i, pmid } of paperPubmedIndices) {
      const tail = tailByPmid.get(pmid);
      if (!tail) continue;
      const row = merged[i]!;
      const next: DigestItemPayload = {
        ...row,
        penultimate_author_name: tail.penultimate ?? row.penultimate_author_name,
      };
      if (!row.pi_name && tail.last) {
        let piName = tail.last;
        if (!pubmedFullAuthorCache.has(pmid)) {
          pubmedFullAuthorCache.set(pmid, await fetchPubmedLastAuthorFullNameByPmid(pmid));
        }
        const fullName = pubmedFullAuthorCache.get(pmid);
        if (fullName && (!piName || isPubmedStyleAbbrevAuthor(piName))) {
          piName = fullName;
        }
        merged[i] = { ...next, pi_name: piName };
      } else {
        merged[i] = next;
      }
    }
  }

  merged.sort((a, b) => {
    const ta = new Date(a.published_at ?? a.found_at).getTime();
    const tb = new Date(b.published_at ?? b.found_at).getTime();
    return tb - ta;
  });

  const minCandidatePublished = minPubRes.data?.[0]?.published_at ?? null;
  const minCandidateFound = minFoundRes.data?.[0]?.found_at ?? null;
  const earliestSignalMonth =
    minCandidatePublished && minCandidateFound
      ? monthKeyFromIso(
          new Date(minCandidatePublished) < new Date(minCandidateFound)
            ? minCandidatePublished
            : minCandidateFound,
        )
      : minCandidatePublished
        ? monthKeyFromIso(minCandidatePublished)
        : minCandidateFound
          ? monthKeyFromIso(minCandidateFound)
          : currentYearMonth();
  const minYear = Number(earliestSignalMonth.slice(0, 4));
  const minMonth = Number.isFinite(minYear) ? `${minYear}-01` : currentYearMonth();
  const maxMonth = currentYearMonth();

  if (loadErr) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold">Digest for {heading}</h1>
        <p className="mt-4 text-red-600">Failed to load digest: {userFacingDbStatementTimeoutMessage(loadErr.message)}</p>
      </div>
    );
  }

  return (
    <MonthlyDigestView
      monthLabel={heading}
      items={merged}
      selectedMonth={`${year}-${String(month).padStart(2, "0")}`}
      minMonth={minMonth}
      maxMonth={maxMonth}
    />
  );
}
