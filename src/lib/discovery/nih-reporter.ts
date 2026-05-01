import type { DiscoveryCandidate } from "./types";
import {
  canonicalNihProjectNumForDedup,
  formatNihProjectNumStored,
} from "@/lib/nih-project-num";

const API = "https://api.reporter.nih.gov/v2/projects/search";

/** NIH asks for ≤1 request per second to RePORTER APIs. */
export const NIH_REPORTER_THROTTLE_MS = 1000;

type ReporterProjectRow = {
  appl_id?: number;
  project_num?: string;
  project_title?: string;
  award_notice_date?: string | null;
  project_start_date?: string | null;
  date_added?: string | null;
  project_detail_url?: string | null;
  abstract_text?: string | null;
  organization?: { org_name?: string | null };
  award_amount?: number | null;
  agency_ic_admin?: { abbreviation?: string | null; name?: string | null };
};

export type NihReporterFetchOptions = {
  profileId: string;
  trackedEntityId: string;
  maxResults: number;
  mindate: Date;
  maxdate: Date;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * RePORTER lists the same ProjectNum for umbrella + cores/subprojects. Searching with
 * exclude_subprojects:true returns only the parent program (subproject_id null) so we use
 * its ProjectTitle as the signal title for every investigator on that grant.
 */
async function fetchParentProgramTitlesByProjectNums(
  rawNums: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [
    ...new Set(rawNums.map((p) => formatNihProjectNumStored(p)).filter(Boolean)),
  ];
  if (unique.length === 0) return out;

  for (let i = 0; i < unique.length; i += 50) {
    await sleep(NIH_REPORTER_THROTTLE_MS);
    const chunk = unique.slice(i, i + 50);
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "CommunitySignalDigest/1.0 (faculty-discovery)",
      },
      body: JSON.stringify({
        criteria: {
          project_nums: chunk,
          exclude_subprojects: true,
        },
        include_fields: ["ProjectNum", "ProjectTitle"],
        offset: 0,
        limit: 50,
      }),
    });
    if (!res.ok) continue;
    const json = (await res.json()) as {
      results?: { project_num?: string; project_title?: string }[];
    };
    for (const row of json.results ?? []) {
      const pn = (row.project_num ?? "").trim();
      const pt = (row.project_title ?? "").trim();
      if (!pn || !pt) continue;
      out.set(canonicalNihProjectNumForDedup(pn), pt);
    }
  }
  return out;
}

function parseApiDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function effectiveActivityDate(row: ReporterProjectRow): Date | null {
  return (
    parseApiDate(row.award_notice_date ?? undefined) ??
    parseApiDate(row.project_start_date ?? undefined) ??
    parseApiDate(row.date_added ?? undefined)
  );
}

function publishedAt(row: ReporterProjectRow): string | null {
  const d = effectiveActivityDate(row);
  return d ? d.toISOString() : null;
}

export function isValidNihProfileId(raw: string | null | undefined): boolean {
  const t = (raw ?? "").trim();
  return t.length > 0 && /^\d+$/.test(t);
}

/** Strip trailing "(5U19AI077439-19)"-style grant suffix for title pattern checks */
function titleWithoutTrailingGrantParen(title: string): string {
  return title.replace(/\s*\([0-9A-Za-z]+-[0-9A-Za-z0-9,-]+\)\s*$/i, "").trim();
}

/**
 * True when this row looks like a U-series subproject or core, not the overall program grant.
 * Same ProjectNum can appear as parent + cores + Project 1/2…; we keep one overall row.
 */
export function isNihReporterSubprojectOrCoreTitle(title: string): boolean {
  const core = titleWithoutTrailingGrantParen(title);
  if (/^project\s+\d+\s*:/i.test(core)) return true;
  if (/^administrative\s+core\b/i.test(core)) return true;
  if (/^(clinical|research|data|genomics|informatics|biostatistics)\s+(resource\s+)?core\b/i.test(core))
    return true;
  if (/^leadership\s+core\b/i.test(core)) return true;
  return false;
}

/** Stored column value (full ProjectNum from API, compact). */
export function normalizeNihProjectNum(s: string): string {
  return formatNihProjectNumStored(s);
}

/** For each distinct ProjectNum, keep at most one row: prefer overall grant over cores/subprojects */
function dedupeNihReporterOverallGrants(
  items: DiscoveryCandidate[],
): DiscoveryCandidate[] {
  const withNum: DiscoveryCandidate[] = [];
  const withoutNum: DiscoveryCandidate[] = [];
  for (const c of items) {
    const p = c.nih_project_num?.trim();
    if (p) withNum.push(c);
    else withoutNum.push(c);
  }

  const groups = new Map<string, DiscoveryCandidate[]>();
  for (const c of withNum) {
    const k = canonicalNihProjectNumForDedup(c.nih_project_num!);
    const arr = groups.get(k) ?? [];
    arr.push(c);
    groups.set(k, arr);
  }

  const out: DiscoveryCandidate[] = [...withoutNum];

  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]!);
      continue;
    }
    const overall = group.filter((c) => !isNihReporterSubprojectOrCoreTitle(c.title));
    if (overall.length >= 1) {
      overall.sort((a, b) => {
        const da = a.published_at ? new Date(a.published_at).getTime() : 0;
        const db = b.published_at ? new Date(b.published_at).getTime() : 0;
        return db - da;
      });
      out.push(overall[0]!);
    } else {
      group.sort((a, b) => {
        const da = a.published_at ? new Date(a.published_at).getTime() : 0;
        const db = b.published_at ? new Date(b.published_at).getTime() : 0;
        return db - da;
      });
      out.push(group[0]!);
    }
  }

  return out;
}

export async function fetchNihReporterFundingCandidates(
  opts: NihReporterFetchOptions,
): Promise<{ candidates: DiscoveryCandidate[]; error?: string }> {
  const candidates: DiscoveryCandidate[] = [];
  const id = opts.profileId.trim();
  if (!isValidNihProfileId(id)) return { candidates };

  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId)) {
    return { candidates, error: "NIH profile ID out of range" };
  }

  const pageLimit = 500;
  /** Pull multiple pages until empty or deep enough for mindate filtering + maxResults cap. */
  const offsetHardStop = 5000;

  try {
    const built: DiscoveryCandidate[] = [];
    let offset = 0;

    while (offset < offsetHardStop) {
      const payload = {
        criteria: {
          pi_profile_ids: [numericId],
        },
        include_fields: [
          "ApplId",
          "ProjectNum",
          "ProjectTitle",
          "AwardNoticeDate",
          "ProjectStartDate",
          "DateAdded",
          "ProjectDetailUrl",
          "AbstractText",
          "Organization",
          "AwardAmount",
          "AgencyIcAdmin",
        ],
        sort_field: "award_notice_date",
        sort_order: "desc",
        offset,
        limit: pageLimit,
      };

      const res = await fetch(API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "CommunitySignalDigest/1.0 (faculty-discovery)",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return {
          candidates,
          error: `NIH RePORTER ${res.status}`,
        };
      }
      const json = (await res.json()) as {
        results?: ReporterProjectRow[];
      };
      const rows = json.results ?? [];
      if (rows.length === 0) break;

      for (const row of rows) {
        const activity = effectiveActivityDate(row);
        if (
          !activity ||
          activity < opts.mindate ||
          activity > opts.maxdate
        ) {
          continue;
        }

        const titleBase = (row.project_title ?? "").trim();
        const proj = (row.project_num ?? "").trim();
        const title =
          titleBase && proj
            ? `${titleBase} (${proj})`
            : titleBase || proj || `NIH award ${row.appl_id ?? ""}`.trim();

        const url =
          (row.project_detail_url ?? "").trim() ||
          (row.appl_id != null
            ? `https://reporter.nih.gov/project-details/${row.appl_id}`
            : null);

        const org = row.organization?.org_name?.trim();
        const ic = row.agency_ic_admin?.abbreviation ?? row.agency_ic_admin?.name;
        const amount =
          row.award_amount != null && row.award_amount > 0
            ? `Award: $${row.award_amount.toLocaleString("en-US")}`
            : null;
        const abstract = row.abstract_text
          ? row.abstract_text.replace(/\s+/g, " ").trim().slice(0, 420)
          : null;
        const raw_summary = [ic, org, amount, abstract]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 2000) || null;

        built.push({
          tracked_entity_id: opts.trackedEntityId,
          title,
          source_url: url,
          source_domain: "reporter.nih.gov",
          published_at: publishedAt(row),
          raw_summary,
          source_type: "reporter",
          category: "funding",
          nih_project_num: proj || undefined,
        });
      }

      if (rows.length < pageLimit) break;
      offset += pageLimit;
      await sleep(NIH_REPORTER_THROTTLE_MS);
    }

    const nums = built
      .map((c) => c.nih_project_num)
      .filter((p): p is string => Boolean(p?.trim()));
    if (nums.length > 0) {
      await sleep(NIH_REPORTER_THROTTLE_MS);
      const parentTitles = await fetchParentProgramTitlesByProjectNums(nums);
      for (const c of built) {
        if (!c.nih_project_num?.trim()) continue;
        const can = canonicalNihProjectNumForDedup(c.nih_project_num);
        const base = parentTitles.get(can);
        if (base) {
          const proj = formatNihProjectNumStored(c.nih_project_num);
          c.title = `${base} (${proj})`;
        }
      }
    }

    const deduped = dedupeNihReporterOverallGrants(built);
    candidates.push(...deduped.slice(0, opts.maxResults));
  } catch (e) {
    return {
      candidates,
      error:
        e instanceof Error ? e.message : "NIH RePORTER request failed",
    };
  }

  return { candidates };
}
