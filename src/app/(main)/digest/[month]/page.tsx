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
import { parseDigestCoverFromDb } from "@/lib/digest-cover";

export const dynamic = "force-dynamic";

const ITEM_SELECT = `
  id,
  title,
  published_at,
  found_at,
  category,
  source_type,
  source_url,
  raw_summary,
  digest_cover,
  tracked_entities!tracked_entity_id ( id, name, first_name, last_name ),
  summaries ( * )
`;

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function extractPubmedPmidFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
  return m?.[1] ?? null;
}

async function fetchPubmedLastAuthorByPmid(
  pmid: string,
  cache: Map<string, string | null>,
): Promise<string | null> {
  if (cache.has(pmid)) return cache.get(pmid) ?? null;
  const apiKey = process.env.NCBI_API_KEY?.trim();
  const keyParam = apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : "";
  try {
    const res = await fetch(
      `${EUTILS}/esummary.fcgi?db=pubmed&retmode=json&id=${encodeURIComponent(pmid)}${keyParam}`,
      { headers: { "User-Agent": "CommunitySignalDigest/1.0 (digest-view)" } },
    );
    if (!res.ok) {
      cache.set(pmid, null);
      return null;
    }
    const json = (await res.json()) as {
      result?: Record<string, unknown> & { uids?: string[] };
    };
    const record = json.result?.[pmid] as { authors?: { name?: string }[] } | undefined;
    const names = Array.isArray(record?.authors)
      ? record.authors
          .map((a) => (typeof a?.name === "string" ? a.name.trim() : ""))
          .filter(Boolean)
      : [];
    const last = names.length > 0 ? (names[names.length - 1] ?? null) : null;
    cache.set(pmid, last);
    return last;
  } catch {
    cache.set(pmid, null);
    return null;
  }
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

function mapRow(
  r: {
    id: string;
    title: string;
    published_at: string | null;
    found_at: string;
    category: DigestItemPayload["category"];
    source_type: DigestItemPayload["source_type"];
    source_url: string | null;
    raw_summary: string | null;
    digest_cover: unknown;
    tracked_entities: unknown;
    summaries: unknown;
  },
  junctionRows: unknown[],
): DigestItemPayload {
  const rawSummaries = r.summaries;
  const summaries = (Array.isArray(rawSummaries) ? rawSummaries : []) as Summary[];
  summaries.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const investigators = investigatorsFromSourceItemRow(r.tracked_entities, junctionRows).map(
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
    investigators,
    pi_name: r.source_type === "pubmed" ? parsePubmedLastAuthor(r.raw_summary) : null,
    digest_cover: parseDigestCoverFromDb(r.digest_cover),
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
  await requireProfile();
  const { month: monthParam } = await params;
  const parsed = parseYearMonth(monthParam);
  if (!parsed) {
    redirect(`/digest/${currentYearMonth()}`);
  }
  const { year, month } = parsed;
  const { startISO, endISO } = monthRangeUtc(year, month);

  const supabase = await createClient();

  const [minPubRes, minFoundRes] = await Promise.all([
    supabase
      .from("source_items")
      .select("published_at")
      .eq("status", "approved")
      .not("published_at", "is", null)
      .order("published_at", { ascending: true })
      .limit(1),
    supabase
      .from("source_items")
      .select("found_at")
      .eq("status", "approved")
      .is("published_at", null)
      .order("found_at", { ascending: true })
      .limit(1),
  ]);

  const [pubRes, foundRes] = await Promise.all([
    supabase
      .from("source_items")
      .select(ITEM_SELECT)
      .eq("status", "approved")
      .gte("published_at", startISO)
      .lte("published_at", endISO),
    supabase
      .from("source_items")
      .select(ITEM_SELECT)
      .eq("status", "approved")
      .is("published_at", null)
      .gte("found_at", startISO)
      .lte("found_at", endISO),
  ]);

  const byPub = pubRes.data ?? [];
  const byFound = foundRes.data ?? [];
  const loadErr = pubRes.error ?? foundRes.error;

  const junctionByItem = new Map<string, unknown[]>();
  if (!loadErr) {
    const allIds = [...new Set([...byPub, ...byFound].map((row) => row.id))];
    if (allIds.length > 0) {
      const { data: junctionRows, error: junctionErr } = await supabase
        .from("source_item_tracked_entities")
        .select(
          `
          source_item_id,
          tracked_entity_id,
          tracked_entities!tracked_entity_id ( id, name, first_name, last_name, lab_website )
        `,
        )
        .in("source_item_id", allIds);
      if (junctionErr) {
        return (
          <div className="mx-auto max-w-4xl">
            <h1 className="text-2xl font-semibold">Monthly Digest</h1>
            <p className="mt-4 text-red-600">Failed to load digest: {junctionErr.message}</p>
          </div>
        );
      }
      for (const row of junctionRows ?? []) {
        const sid = row.source_item_id as string;
        const arr = junctionByItem.get(sid) ?? [];
        arr.push(row);
        junctionByItem.set(sid, arr);
      }
    }
  }

  const seen = new Set<string>();
  const merged: DigestItemPayload[] = [];
  const pubmedAuthorCache = new Map<string, string | null>();
  const pubmedFullAuthorCache = new Map<string, string | null>();

  for (const r of byPub) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    merged.push(
      mapRow(r as Parameters<typeof mapRow>[0], junctionByItem.get(r.id) ?? []),
    );
  }
  for (const r of byFound) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    merged.push(
      mapRow(r as Parameters<typeof mapRow>[0], junctionByItem.get(r.id) ?? []),
    );
  }

  for (let i = 0; i < merged.length; i++) {
    const row = merged[i]!;
    if (row.source_type !== "pubmed" || row.pi_name) continue;
    const pmid = extractPubmedPmidFromUrl(row.source_url);
    if (!pmid) continue;
    let piName = await fetchPubmedLastAuthorByPmid(pmid, pubmedAuthorCache);
    if (!pubmedFullAuthorCache.has(pmid)) {
      pubmedFullAuthorCache.set(pmid, await fetchPubmedLastAuthorFullNameByPmid(pmid));
    }
    const fullName = pubmedFullAuthorCache.get(pmid);
    if (fullName && (!piName || isPubmedStyleAbbrevAuthor(piName))) {
      piName = fullName;
    }
    if (piName) {
      merged[i] = { ...row, pi_name: piName };
    }
  }

  merged.sort((a, b) => {
    const ta = new Date(a.published_at ?? a.found_at).getTime();
    const tb = new Date(b.published_at ?? b.found_at).getTime();
    return tb - ta;
  });

  const heading = formatMonthHeading(year, month);
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
        <h1 className="text-2xl font-semibold">Monthly Digest</h1>
        <p className="mt-4 text-red-600">Failed to load digest: {loadErr.message}</p>
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
