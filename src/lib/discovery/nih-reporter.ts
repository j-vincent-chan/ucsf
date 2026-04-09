import type { DiscoveryCandidate } from "./types";

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
    offset: 0,
    limit: 500,
  };

  try {
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

    for (const row of rows) {
      if (candidates.length >= opts.maxResults) break;
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

      candidates.push({
        tracked_entity_id: opts.trackedEntityId,
        title,
        source_url: url,
        source_domain: "reporter.nih.gov",
        published_at: publishedAt(row),
        raw_summary,
        source_type: "reporter",
        category: "funding",
      });
    }
  } catch (e) {
    return {
      candidates,
      error:
        e instanceof Error ? e.message : "NIH RePORTER request failed",
    };
  }

  return { candidates };
}
