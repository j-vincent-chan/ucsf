import type { DiscoveryCandidate } from "./types";
import {
  canonicalNihProjectNumForDedup,
  formatNihProjectNumStored,
} from "@/lib/nih-project-num";

const API = "https://api.reporter.nih.gov/v2/projects/search";

/** NIH asks for ≤1 request per second to RePORTER APIs. */
export const NIH_REPORTER_THROTTLE_MS = 1000;

type ReporterProjectNumSplit = {
  appl_type_code?: string | null;
  activity_code?: string | null;
  ic_code?: string | null;
  serial_num?: string | null;
  support_year?: string | null;
  full_support_year?: string | null;
  suffix_code?: string | null;
};

type ReporterProjectRow = {
  appl_id?: number;
  project_num?: string;
  project_title?: string;
  award_notice_date?: string | null;
  project_start_date?: string | null;
  budget_start?: string | null;
  date_added?: string | null;
  project_detail_url?: string | null;
  abstract_text?: string | null;
  organization?: { org_name?: string | null };
  award_amount?: number | null;
  agency_ic_admin?: { abbreviation?: string | null; name?: string | null };
  /** NIH APPLICATION_TYPE (same meaning as `project_num_split.appl_type_code` when present). */
  award_type?: string | number | null;
  project_num_split?: ReporterProjectNumSplit | null;
};

function reporterApplTypeCode(
  row: ReporterProjectRow,
): string | null {
  const fromSplit = (row.project_num_split?.appl_type_code ?? "").trim();
  if (fromSplit) return fromSplit;
  const at = row.award_type;
  if (at == null) return null;
  const s = String(at).trim();
  return s || null;
}

/** NIH support year from ProjectNum (e.g. `…-04` → 4). */
export function reporterSupportYear(row: ReporterProjectRow): number | null {
  const syRaw = (row.project_num_split?.support_year ?? "").trim();
  if (!syRaw || !/^\d+$/.test(syRaw)) return null;
  return Number.parseInt(syRaw, 10);
}

/**
 * New funding: application type 1 (new) and support year 1.
 */
export function isNihReporterNewFundingAward(row: ReporterProjectRow): boolean {
  if (reporterApplTypeCode(row) !== "1") return false;
  const sy = reporterSupportYear(row);
  if (sy != null && sy !== 1) return false;
  return true;
}

/**
 * Digest funding signals: new awards (type 1, yr 1) and annual non-competing continuances (type 5, yr 2+).
 */
export function isNihReporterDigestFundingAward(row: ReporterProjectRow): boolean {
  const code = reporterApplTypeCode(row);
  const sy = reporterSupportYear(row);
  if (code === "1") return sy == null || sy === 1;
  if (code === "5") return sy != null && sy >= 2;
  return false;
}

/**
 * NIH application / award action type (RePORTER APPLICATION_TYPE).
 * @see https://api.reporter.nih.gov/documents/Data%20Elements%20for%20RePORTER%20Project%20API_V2.pdf
 */
export function reporterAwardClassSummary(row: ReporterProjectRow): string | null {
  const code = reporterApplTypeCode(row);
  if (!code) return null;
  const syRaw = (row.project_num_split?.support_year ?? "").trim();
  const syDisp =
    syRaw && /^\d+$/.test(syRaw)
      ? String(Number.parseInt(syRaw, 10))
      : syRaw || null;
  const yearSuffix =
    syDisp && ["2", "3", "4", "5"].includes(code)
      ? ` · Support year ${syDisp}`
      : syDisp && code === "1"
        ? ` · Support year ${syDisp}`
        : "";

  switch (code) {
    case "1":
      return `Award class: New grant${yearSuffix}`;
    case "2":
      return `Award class: Competing renewal${yearSuffix}`;
    case "3":
      return `Award class: Supplement or revision${yearSuffix}`;
    case "4":
      return `Award class: Extension / Fast-Track transition${yearSuffix}`;
    case "5":
      return `Award class: Continuing (non-competing)${yearSuffix}`;
    case "6":
      return `Award class: Change of organization (successor)`;
    case "7":
      return `Award class: Change of grantee institution`;
    case "8":
      return `Award class: IC transfer (non-competing)`;
    case "9":
      return `Award class: IC change (on competing renewal)`;
    default:
      return `Award class: NIH application type ${code}${yearSuffix}`;
  }
}

export type NihReporterFundingFetchMode = "signals_new_only" | "digest_including_continuing";

export type NihReporterFetchOptions = {
  profileId: string;
  trackedEntityId: string;
  maxResults: number;
  mindate: Date;
  maxdate: Date;
  /** Signals discovery uses new year-1 only; digest can include type-5 continuances. */
  mode?: NihReporterFundingFetchMode;
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

function formatReporterApiDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * RePORTER `project_start_date` filter — widen so year-2+ continuances (project began years ago,
 * award notice / budget in the discovery window) are still returned from the API.
 */
function reporterProjectStartFromDate(mindate: Date): Date {
  const d = new Date(mindate);
  d.setUTCFullYear(d.getUTCFullYear() - 12);
  return d;
}

/** New awards: project start. Continuing (type 5, yr 2+): award notice / budget period start. */
function fundingActivityDate(row: ReporterProjectRow): Date | null {
  const code = reporterApplTypeCode(row);
  const sy = reporterSupportYear(row);
  if (code === "5" && sy != null && sy >= 2) {
    return (
      parseApiDate(row.award_notice_date ?? undefined) ??
      parseApiDate(row.budget_start ?? undefined) ??
      parseApiDate(row.project_start_date ?? undefined) ??
      parseApiDate(row.date_added ?? undefined)
    );
  }
  return (
    parseApiDate(row.project_start_date ?? undefined) ??
    parseApiDate(row.date_added ?? undefined)
  );
}

function publishedAt(row: ReporterProjectRow): string | null {
  const d = fundingActivityDate(row);
  return d ? d.toISOString() : null;
}

const REPORTER_FUNDING_INCLUDE_FIELDS = [
  "ApplId",
  "ProjectNum",
  "ProjectTitle",
  "ProjectStartDate",
  "AwardNoticeDate",
  "BudgetStart",
  "DateAdded",
  "ProjectDetailUrl",
  "AbstractText",
  "Organization",
  "AwardAmount",
  "AgencyIcAdmin",
  "AwardType",
  "ProjectNumSplit",
] as const;

/** Build a discovery candidate from one RePORTER project row (null if not digest funding). */
export function reporterRowToDiscoveryCandidate(
  row: ReporterProjectRow,
  trackedEntityId: string,
): DiscoveryCandidate | null {
  if (!isNihReporterDigestFundingAward(row)) return null;

  const titleBase = (row.project_title ?? "").trim();
  const proj = (row.project_num ?? "").trim();
  const title =
    titleBase && proj
      ? `${titleBase} (${proj})`
      : titleBase || proj || `NIH award ${row.appl_id ?? ""}`.trim();

  const url =
    (row.project_detail_url ?? "").trim() ||
    (row.appl_id != null ? `https://reporter.nih.gov/project-details/${row.appl_id}` : null);

  const org = row.organization?.org_name?.trim();
  const ic = row.agency_ic_admin?.abbreviation ?? row.agency_ic_admin?.name;
  const amount =
    row.award_amount != null && row.award_amount > 0
      ? `Award: $${row.award_amount.toLocaleString("en-US")}`
      : null;
  const abstract = row.abstract_text
    ? row.abstract_text.replace(/\s+/g, " ").trim().slice(0, 420)
    : null;
  const awardClass = reporterAwardClassSummary(row);
  const raw_summary =
    [awardClass, ic, org, amount, abstract].filter(Boolean).join(" · ").slice(0, 2000) || null;

  return {
    tracked_entity_id: trackedEntityId,
    title,
    source_url: url,
    source_domain: "reporter.nih.gov",
    published_at: publishedAt(row),
    raw_summary,
    source_type: "reporter",
    category: "funding",
    nih_project_num: proj || undefined,
  };
}

/** Latest RePORTER row for a ProjectNum (e.g. refresh year-7 continuation on an older signal). */
export async function fetchReporterFundingCandidateByProjectNum(
  projectNum: string,
  trackedEntityId: string,
): Promise<DiscoveryCandidate | null> {
  const stored = formatNihProjectNumStored(projectNum);
  if (!stored) return null;

  await sleep(NIH_REPORTER_THROTTLE_MS);
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "CommunitySignalDigest/1.0 (faculty-discovery)",
    },
    body: JSON.stringify({
      criteria: { project_nums: [stored] },
      include_fields: [...REPORTER_FUNDING_INCLUDE_FIELDS],
      offset: 0,
      limit: 25,
    }),
  });
  if (!res.ok) return null;

  const json = (await res.json()) as { results?: ReporterProjectRow[] };
  const rows = json.results ?? [];
  if (rows.length === 0) return null;

  let best: ReporterProjectRow | null = null;
  let bestSy = -1;
  for (const row of rows) {
    if (!isNihReporterDigestFundingAward(row)) continue;
    const pn = formatNihProjectNumStored(row.project_num ?? "");
    if (pn === stored) {
      best = row;
      break;
    }
    const sy = reporterSupportYear(row) ?? 0;
    if (sy > bestSy) {
      bestSy = sy;
      best = row;
    }
  }
  if (!best) return null;

  let candidate = reporterRowToDiscoveryCandidate(best, trackedEntityId);
  if (!candidate) return null;

  const parentTitles = await fetchParentProgramTitlesByProjectNums([stored]);
  const base = parentTitles.get(canonicalNihProjectNumForDedup(stored));
  if (base && candidate.nih_project_num) {
    candidate = {
      ...candidate,
      title: `${base} (${formatNihProjectNumStored(candidate.nih_project_num)})`,
    };
  }
  return candidate;
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
  const mode = opts.mode ?? "signals_new_only";
  const candidates: DiscoveryCandidate[] = [];
  const id = opts.profileId.trim();
  if (!isValidNihProfileId(id)) return { candidates };

  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId)) {
    return { candidates, error: "NIH profile ID out of range" };
  }

  const digestMode = mode === "digest_including_continuing";
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
          award_types: digestMode ? [1, 5] : [1],
          project_start_date: {
            from_date: formatReporterApiDate(
              digestMode ? reporterProjectStartFromDate(opts.mindate) : opts.mindate,
            ),
            to_date: formatReporterApiDate(opts.maxdate),
          },
          ...(digestMode
            ? {}
            : {
                project_num_split: {
                  support_year: "01",
                },
              }),
        },
        include_fields: [...REPORTER_FUNDING_INCLUDE_FIELDS],
        sort_field: "project_start_date",
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
        const awardOk = digestMode
          ? isNihReporterDigestFundingAward(row)
          : isNihReporterNewFundingAward(row);
        if (!awardOk) continue;

        const activity = digestMode
          ? fundingActivityDate(row)
          : (parseApiDate(row.project_start_date ?? undefined) ??
            parseApiDate(row.date_added ?? undefined));
        if (
          !activity ||
          activity < opts.mindate ||
          activity > opts.maxdate
        ) {
          continue;
        }

        const candidate = reporterRowToDiscoveryCandidate(row, opts.trackedEntityId);
        if (candidate) built.push(candidate);
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
