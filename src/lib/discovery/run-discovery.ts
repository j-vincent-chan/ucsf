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
  isNihReporterSubprojectOrCoreTitle,
  isValidNihProfileId,
  NIH_REPORTER_THROTTLE_MS,
  normalizeNihProjectNum,
} from "./nih-reporter";
import type { DiscoveryCandidate } from "./types";
import { computeSignalGroupKey } from "@/lib/signal-group-key";

export type DiscoveryRunResult = {
  inserted: number;
  /** New source_item rows created */
  skippedDuplicates: number;
  /** Same publication matched an existing signal; investigator linked via junction */
  linkedInvestigators: number;
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
  middle_initial: string;
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
  const miRaw = (e.middle_initial ?? "").trim().slice(0, 1);
  if (!ln || !fn) {
    return { term: (ln || fn).trim(), applyAffiliationInstitution: null };
  }

  // Phrase search as "Lastname Firstname" or "Lastname Firstname M" (MEDLINE-style order).
  // Do not OR with "Lastname FS"[Author] — that matches other people with the same last name
  // and first initial (e.g. Siyu Feng, Sophie Feng when looking for Sandy Feng).
  const parts = [ln, fn];
  if (miRaw && /^[a-zA-Z]$/.test(miRaw)) {
    parts.push(miRaw.toUpperCase());
  }
  const inner = parts
    .join(" ")
    .replace(/"/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const term = `"${inner}"[Author]`;

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
  let linkedInvestigators = 0;
  let labWebsiteCandidates = 0;

  let q = supabase
    .from("tracked_entities")
    .select(
      "id, community_id, first_name, middle_initial, last_name, institution, pubmed_url, lab_website, google_alert_query, nih_profile_id, active, entity_type",
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
      linkedInvestigators: 0,
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
      linkedInvestigators: 0,
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

  const { data: linkRows } = await supabase
    .from("source_item_tracked_entities")
    .select("tracked_entity_id, source_item_id")
    .in("tracked_entity_id", facultyIds);

  const linkItemIds = [...new Set((linkRows ?? []).map((r) => r.source_item_id))];
  const { data: itemsForLinks } =
    linkItemIds.length > 0
      ? await supabase
          .from("source_items")
          .select("id, title, published_at")
          .in("id", linkItemIds)
      : { data: [] as { id: string; title: string; published_at: string | null }[] };

  const itemById = new Map(
    (itemsForLinks ?? []).map((r) => [r.id, r] as const),
  );

  for (const lr of linkRows ?? []) {
    const row = itemById.get(lr.source_item_id);
    if (!row?.title) continue;
    seen.add(
      computeDuplicateKey(row.title, lr.tracked_entity_id, row.published_at),
    );
  }

  const communityIds = [...new Set(rows.map((r) => r.community_id))];
  const sgkToItemId = new Map<string, string>();
  if (communityIds.length > 0) {
    const { data: sgRows } = await supabase
      .from("source_items")
      .select("id, signal_group_key, community_id, source_type, nih_project_num")
      .in("community_id", communityIds)
      .or("signal_group_key.not.is.null,nih_project_num.not.is.null");
    for (const r of sgRows ?? []) {
      if (r.signal_group_key && !sgkToItemId.has(r.signal_group_key)) {
        sgkToItemId.set(r.signal_group_key, r.id);
      }
      if (
        r.source_type === "reporter" &&
        r.nih_project_num?.trim() &&
        r.community_id
      ) {
        const nihKey = computeSignalGroupKey(
          r.community_id,
          "",
          null,
          null,
          "reporter",
          r.nih_project_num,
        );
        if (!sgkToItemId.has(nihKey)) {
          sgkToItemId.set(nihKey, r.id);
        }
      }
    }
  }

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
          middleInitial: ent.middle_initial,
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
    const primaryEntityByItemId = new Map<string, string | null>();

    for (const c of collected) {
      const dk = computeDuplicateKey(
        c.title,
        c.tracked_entity_id,
        c.published_at,
      );

      const sgk = computeSignalGroupKey(
        ent.community_id,
        c.title,
        c.published_at,
        c.source_url,
        c.source_type,
        c.nih_project_num,
      );
      const existingItemId = sgkToItemId.get(sgk);
      if (existingItemId) {
        let primaryId = primaryEntityByItemId.get(existingItemId);
        if (primaryId === undefined) {
          const { data: canon } = await supabase
            .from("source_items")
            .select("tracked_entity_id")
            .eq("id", existingItemId)
            .maybeSingle();
          primaryId = canon?.tracked_entity_id ?? null;
          primaryEntityByItemId.set(existingItemId, primaryId);
        }
        if (primaryId === ent.id) {
          skippedDuplicates += 1;
          continue;
        }

        const { error: linkErr } = await supabase
          .from("source_item_tracked_entities")
          .insert({
            source_item_id: existingItemId,
            tracked_entity_id: ent.id,
          });
        if (linkErr) {
          if (linkErr.code === "23505") {
            skippedDuplicates += 1;
          } else {
            errors.push({
              source: "database",
              entityId: ent.id,
              message: linkErr.message,
            });
          }
        } else {
          linkedInvestigators += 1;
          seen.add(dk);
          if (
            c.source_type === "reporter" &&
            c.nih_project_num?.trim()
          ) {
            const { data: cur } = await supabase
              .from("source_items")
              .select("title")
              .eq("id", existingItemId)
              .maybeSingle();
            const curTitle = cur?.title ?? "";
            if (
              curTitle &&
              isNihReporterSubprojectOrCoreTitle(curTitle) &&
              !isNihReporterSubprojectOrCoreTitle(c.title)
            ) {
              await supabase
                .from("source_items")
                .update({ title: c.title })
                .eq("id", existingItemId);
            }
          }
          const b =
            c.source_type === "lab_website"
              ? "lab_website"
              : c.source_type === "reporter"
                ? "nih_reporter"
                : bucketFromDomain(c.source_domain);
          bySource[b] = (bySource[b] ?? 0) + 1;
        }
        continue;
      }

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
          ...(c.source_type === "reporter" && c.nih_project_num?.trim()
            ? {
                nih_project_num: normalizeNihProjectNum(c.nih_project_num),
              }
            : {}),
        },
      });
    }

    if (batch.length === 0) continue;

    const { data: insertedRows, error: insErr } = await supabase
      .from("source_items")
      .insert(batch.map((x) => x.row))
      .select("id, signal_group_key");

    if (insErr) {
      errors.push({
        source: "database",
        entityId: ent.id,
        message: insErr.message,
      });
      continue;
    }

    inserted += batch.length;
    for (let i = 0; i < batch.length; i++) {
      const x = batch[i]!;
      seen.add(x.dk);
      bySource[x.bucket] = (bySource[x.bucket] ?? 0) + 1;
      const ins = insertedRows?.[i];
      const row = x.row;
      if (ins?.id) {
        if (ins.signal_group_key) {
          sgkToItemId.set(ins.signal_group_key, ins.id);
        }
        if (
          row.source_type === "reporter" &&
          row.nih_project_num?.trim() &&
          row.community_id
        ) {
          const nk = computeSignalGroupKey(
            row.community_id,
            "",
            null,
            null,
            "reporter",
            row.nih_project_num,
          );
          if (!sgkToItemId.has(nk)) {
            sgkToItemId.set(nk, ins.id);
          }
        }
      }
    }
  }

  return {
    inserted,
    skippedDuplicates,
    linkedInvestigators,
    bySource,
    errors,
    facultyProcessed: rows.length,
    labWebsiteFacultyWithUrl,
    labWebsiteCandidates,
    note,
  };
}
