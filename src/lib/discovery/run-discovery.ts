import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { computeDuplicateKey } from "./duplicate-key";
import { fetchClinicalTrialsCandidates } from "./clinicaltrials";
import { institutionMentionsUcsf } from "./institution-query";
import {
  fetchGoogleNewsRssCandidates,
  fetchUcsfNewsArticlePool,
  type UcsfArticle,
  ucsfArticlesToCandidates,
} from "./news-media";
import {
  fetchPubMedCandidates,
} from "./pubmed";
import { fetchLabWebsiteHtmlCandidates } from "./lab-website-html";
import {
  fetchNihReporterFundingCandidates,
  isValidNihProfileId,
  NIH_REPORTER_THROTTLE_MS,
} from "./nih-reporter";
import type { DiscoveryCandidate } from "./types";

export type DiscoveryRunResult = {
  inserted: number;
  skippedDuplicates: number;
  bySource: Record<string, number>;
  errors: { source: string; entityId: string; message: string }[];
  facultyProcessed: number;
  /** Faculty rows with a non-empty Lab website URL (feeds are attempted per run). */
  labWebsiteFacultyWithUrl: number;
  /** Raw RSS/Atom items parsed before duplicate filtering / DB insert. */
  labWebsiteCandidates: number;
  note: string;
};

type FacultyRow = {
  id: string;
  community_id: string;
  first_name: string;
  last_name: string;
  institution: string | null;
  pubmed_url: string | null;
  lab_website: string | null;
  google_alert_query: string | null;
  nih_profile_id: string | null;
};

function throttleMs(): number {
  return process.env.NCBI_API_KEY?.trim() ? 120 : 350;
}

/** PubMed esearch base term + whether to AND affiliation filter. */
function pubmedSearch(e: FacultyRow): {
  term: string;
  applyAffiliationInstitution: string | null;
} {
  const ln = e.last_name?.trim() ?? "";
  const fn = e.first_name?.trim() ?? "";
  if (!ln || !fn) {
    return { term: (ln || fn).trim(), applyAffiliationInstitution: null };
  }

  const parts = fn.split(/\s+/).filter(Boolean);
  const firstInitial = parts[0]?.[0]?.toUpperCase() ?? "";
  const middleInitial = parts.length > 1 ? (parts[1]?.[0]?.toUpperCase() ?? "") : "";
  const initials = `${firstInitial}${middleInitial}`.trim();

  const authorInitials = initials ? `"${ln} ${initials}"[Author]` : `"${ln} ${firstInitial}"[Author]`;
  const authorFull = `"${ln} ${fn}"[Author]`;
  const term = `(${authorInitials} OR ${authorFull})`;

  // Always disambiguate with UCSF affiliation to avoid ambiguous names.
  const applyAffiliationInstitution = "UCSF; University of California San Francisco";
  return { term, applyAffiliationInstitution };
}

function clinicalTrialQuery(e: FacultyRow): string {
  const fn = (e.first_name ?? "").trim();
  const ln = (e.last_name ?? "").trim();
  const base = [fn, ln].filter(Boolean).join(" ");
  const extra = e.google_alert_query?.trim() || "";
  if (extra && extra.length < 80) return `${base} ${extra}`.trim();
  return base;
}

function bucketFromDomain(sourceDomain: string | null): string {
  const d = (sourceDomain ?? "").toLowerCase();
  if (d.includes("pubmed")) return "pubmed";
  if (d.includes("clinicaltrials")) return "clinical_trials";
  if (d.includes("reporter")) return "nih_reporter";
  if (d.includes("news.google")) return "google_news";
  if (d.includes("ucsf.edu")) return "ucsf_news";
  return "web_other";
}

const MAX_PER_SOURCE = 28;
const MAX_FACULTY = 200;

export async function runDiscovery(
  supabase: SupabaseClient<Database>,
  options: {
    entityIds?: string[];
    daysBack?: number;
    /** When set (e.g. cron with service role), only this tenant's faculty are processed. */
    communityId?: string;
  } = {},
): Promise<DiscoveryRunResult> {
  const ENABLE_LAB_WEBSITE_SCRAPE = process.env.DISCOVER_LAB_WEBSITE_SCRAPE === "1";
  const note =
    "Lab website: currently disabled. NIH funding: set NIH profile ID on the watchlist (numeric); Discover queries the RePORTER API (~1 req/s per PI). Media: Google Alert + UCSF News when institution matches.";
  const daysBack = Math.min(
    Math.max(options.daysBack ?? 365, 14),
    730,
  );
  const now = new Date();
  const mindate = new Date(now);
  mindate.setDate(mindate.getDate() - daysBack);

  const delay = throttleMs();
  const errors: DiscoveryRunResult["errors"] = [];
  const bySource: Record<string, number> = {};
  let skippedDuplicates = 0;
  let inserted = 0;
  let labWebsiteCandidates = 0;

  let q = supabase
    .from("tracked_entities")
    .select(
      "id, community_id, first_name, last_name, institution, pubmed_url, lab_website, google_alert_query, nih_profile_id, active, entity_type",
    )
    .eq("active", true)
    .eq("entity_type", "faculty");

  if (options.communityId) {
    q = q.eq("community_id", options.communityId);
  }
  if (options.entityIds?.length) {
    q = q.in("id", options.entityIds);
  }

  const { data: faculty, error: facErr } = await q.limit(MAX_FACULTY);
  if (facErr) {
    return {
      inserted: 0,
      skippedDuplicates: 0,
      bySource: {},
      errors: [{ source: "setup", entityId: "-", message: facErr.message }],
      facultyProcessed: 0,
      labWebsiteFacultyWithUrl: 0,
      labWebsiteCandidates: 0,
      note,
    };
  }

  const rows = (faculty ?? []) as FacultyRow[];
  if (rows.length === 0) {
    return {
      inserted: 0,
      skippedDuplicates: 0,
      bySource: {},
      errors: [],
      facultyProcessed: 0,
      labWebsiteFacultyWithUrl: 0,
      labWebsiteCandidates: 0,
      note,
    };
  }

  const labWebsiteFacultyWithUrl = ENABLE_LAB_WEBSITE_SCRAPE
    ? rows.filter((r) => Boolean(r.lab_website?.trim())).length
    : 0;

  const facultyIds = rows.map((r) => r.id);
  const { data: existRows } = await supabase
    .from("source_items")
    .select("duplicate_key")
    .in("tracked_entity_id", facultyIds);

  const seen = new Set(
    (existRows ?? [])
      .map((r) => r.duplicate_key)
      .filter((k): k is string => Boolean(k)),
  );

  const trialMinPost = new Date(now);
  trialMinPost.setDate(trialMinPost.getDate() - daysBack);

  let ucsfPoolPromise: Promise<{
    articles: UcsfArticle[];
    error?: string;
  }> | null = null;
  let ucsfNewsErrorReported = false;
  let nihReporterCalls = 0;

  function loadUcsfNewsPool() {
    if (!ucsfPoolPromise) {
      ucsfPoolPromise = fetchUcsfNewsArticlePool(mindate, 100);
    }
    return ucsfPoolPromise;
  }

  for (const ent of rows) {
    const collected: DiscoveryCandidate[] = [];

    const pm = pubmedSearch(ent);
    if (pm.term) {
      const r = await fetchPubMedCandidates({
        term: pm.term,
        institution: pm.applyAffiliationInstitution,
        mindate,
        maxdate: now,
        trackedEntityId: ent.id,
        maxResults: MAX_PER_SOURCE,
        throttleMs: delay,
      });
      if (r.error) {
        errors.push({
          source: "pubmed",
          entityId: ent.id,
          message: r.error,
        });
      }
      collected.push(...r.candidates);
    }

    const nihId = ent.nih_profile_id?.trim() ?? "";
    if (isValidNihProfileId(nihId)) {
      if (nihReporterCalls++ > 0) {
        await new Promise((r) => setTimeout(r, NIH_REPORTER_THROTTLE_MS));
      }
      const r = await fetchNihReporterFundingCandidates({
        profileId: nihId,
        trackedEntityId: ent.id,
        maxResults: MAX_PER_SOURCE,
        mindate,
        maxdate: now,
      });
      if (r.error) {
        errors.push({
          source: "nih_reporter",
          entityId: ent.id,
          message: r.error,
        });
      }
      collected.push(...r.candidates);
    }

    const ctQ = clinicalTrialQuery(ent);
    if (ctQ.length >= 2) {
      const r = await fetchClinicalTrialsCandidates({
        queryTerm: ctQ,
        institution: ent.institution,
        trackedEntityId: ent.id,
        maxResults: MAX_PER_SOURCE,
        minStudyFirstPostDate: trialMinPost,
      });
      if (r.error) {
        errors.push({
          source: "clinical_trials",
          entityId: ent.id,
          message: r.error,
        });
      }
      collected.push(...r.candidates);
    }

    const gaq = ent.google_alert_query?.trim();
    if (gaq) {
      const r = await fetchGoogleNewsRssCandidates({
        query: gaq,
        trackedEntityId: ent.id,
        maxResults: MAX_PER_SOURCE,
        notBefore: mindate,
        throttleMs: delay,
      });
      if (r.error) {
        errors.push({
          source: "google_news",
          entityId: ent.id,
          message: r.error,
        });
      }
      collected.push(...r.candidates);
    }

    const labSite = ent.lab_website?.trim();
    if (ENABLE_LAB_WEBSITE_SCRAPE && labSite) {
      const r = await fetchLabWebsiteHtmlCandidates({
        labWebsiteUrl: labSite,
        trackedEntityId: ent.id,
        maxResults: MAX_PER_SOURCE,
        notBefore: mindate,
        throttleMs: delay,
      });
      labWebsiteCandidates += r.candidates.length;
      if (r.error) {
        errors.push({
          source: "lab_website",
          entityId: ent.id,
          message: r.error,
        });
      }
      collected.push(...r.candidates);
    }

    if (institutionMentionsUcsf(ent.institution)) {
      const u = await loadUcsfNewsPool();
      if (u.error && !ucsfNewsErrorReported) {
        errors.push({
          source: "ucsf_news",
          entityId: ent.id,
          message: u.error,
        });
        ucsfNewsErrorReported = true;
      }
      collected.push(
        ...ucsfArticlesToCandidates(u.articles, {
          firstName: ent.first_name,
          lastName: ent.last_name,
          trackedEntityId: ent.id,
          maxResults: MAX_PER_SOURCE,
        }),
      );
    }

    const batch: {
      row: Database["public"]["Tables"]["source_items"]["Insert"];
      dk: string;
      bucket: string;
    }[] = [];
    const batchDk = new Set<string>();

    for (const c of collected) {
      const dk = computeDuplicateKey(
        c.title,
        c.tracked_entity_id,
        c.published_at,
      );
      if (seen.has(dk) || batchDk.has(dk)) {
        skippedDuplicates += 1;
        continue;
      }
      batchDk.add(dk);
      const b =
        c.source_type === "lab_website"
          ? "lab_website"
          : c.source_type === "reporter"
            ? "nih_reporter"
            : bucketFromDomain(c.source_domain);
      batch.push({
        dk,
        bucket: b,
        row: {
          community_id: ent.community_id,
          tracked_entity_id: c.tracked_entity_id,
          title: c.title,
          source_url: c.source_url,
          source_domain: c.source_domain,
          published_at: c.published_at,
          raw_summary: c.raw_summary,
          source_type: c.source_type,
          category: c.category,
          status: "new",
        },
      });
    }

    if (batch.length === 0) continue;

    const { error: insErr } = await supabase
      .from("source_items")
      .insert(batch.map((x) => x.row));

    if (insErr) {
      errors.push({
        source: "database",
        entityId: ent.id,
        message: insErr.message,
      });
      continue;
    }

    inserted += batch.length;
    for (const x of batch) {
      seen.add(x.dk);
      bySource[x.bucket] = (bySource[x.bucket] ?? 0) + 1;
    }
  }

  return {
    inserted,
    skippedDuplicates,
    bySource,
    errors,
    facultyProcessed: rows.length,
    labWebsiteFacultyWithUrl,
    labWebsiteCandidates,
    note,
  };
}
