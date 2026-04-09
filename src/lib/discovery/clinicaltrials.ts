import { textMatchesInstitution } from "./institution-query";
import type { DiscoveryCandidate } from "./types";

const API = "https://clinicaltrials.gov/api/v2/studies";

export type ClinicalTrialsFetchOptions = {
  /** e.g. "Jane Smith" or organization + topic */
  queryTerm: string;
  /** When set, keep studies whose sites / sponsors mention this org */
  institution: string | null;
  trackedEntityId: string;
  maxResults: number;
  minStudyFirstPostDate: Date;
};

function protocolDate(
  struct: { date?: string; type?: string } | undefined,
): string | null {
  if (!struct?.date) return null;
  const d = struct.date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d}T12:00:00.000Z`;
  return null;
}

export async function fetchClinicalTrialsCandidates(
  opts: ClinicalTrialsFetchOptions,
): Promise<{ candidates: DiscoveryCandidate[]; error?: string }> {
  const candidates: DiscoveryCandidate[] = [];
  const q = opts.queryTerm.trim();
  if (!q) return { candidates };

  const min = opts.minStudyFirstPostDate.toISOString().slice(0, 10);
  const params = new URLSearchParams({
    "query.term": q,
    pageSize: String(Math.min(opts.maxResults, 100)),
    format: "json",
    sort: "LastUpdatePostDate:desc",
  });

  try {
    const url = `${API}?${params}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "CommunitySignalDigest/1.0 (faculty-discovery)" },
    });
    if (!res.ok) {
      return { candidates, error: `ClinicalTrials.gov ${res.status}` };
    }
    const json = (await res.json()) as {
      studies?: Array<{ protocolSection?: Record<string, unknown> }>;
    };
    const studies = json.studies ?? [];

    for (const row of studies) {
      const ps = row.protocolSection;
      if (!ps) continue;
      const idMod = ps.identificationModule as
        | {
            nctId?: string;
            briefTitle?: string;
            officialTitle?: string;
          }
        | undefined;
      const statusMod = ps.statusModule as
        | {
            studyFirstPostDateStruct?: { date?: string };
            lastUpdatePostDateStruct?: { date?: string };
          }
        | undefined;
      const nctId = idMod?.nctId;
      if (!nctId) continue;
      const title = (idMod?.briefTitle || idMod?.officialTitle || "").trim();
      if (!title) continue;

      const post =
        statusMod?.studyFirstPostDateStruct?.date ||
        statusMod?.lastUpdatePostDateStruct?.date;
      if (post && post < min) continue;

      const published =
        protocolDate(statusMod?.studyFirstPostDateStruct) ||
        (post && /^\d{4}-\d{2}-\d{2}$/.test(post)
          ? `${post}T12:00:00.000Z`
          : null);

      const desc = ps.descriptionModule as { briefSummary?: string } | undefined;
      const snippet = desc?.briefSummary
        ? desc.briefSummary.replace(/\s+/g, " ").trim().slice(0, 400)
        : null;

      const locMod = ps.contactsLocationsModule as
        | {
            locations?: Array<{
              facility?: string;
              city?: string;
              state?: string;
              country?: string;
            }>;
            overallOfficials?: Array<{ name?: string; affiliation?: string }>;
          }
        | undefined;
      const locBits = (locMod?.locations ?? [])
        .map(
          (l) =>
            [l.facility, l.city, l.state, l.country].filter(Boolean).join(" "),
        )
        .join(" ");
      const offBits = (locMod?.overallOfficials ?? [])
        .map((o) => [o.name, o.affiliation].filter(Boolean).join(" "))
        .join(" ");
      const sponsorMod = ps.sponsorCollaboratorsModule as
        | {
            leadSponsor?: { name?: string };
            collaborators?: Array<{ name?: string }>;
          }
        | undefined;
      const sponsorBits = [
        sponsorMod?.leadSponsor?.name,
        ...(sponsorMod?.collaborators?.map((c) => c.name) ?? []),
      ]
        .filter(Boolean)
        .join(" ");
      const instHaystack = [locBits, offBits, sponsorBits, title].join(" ");
      if (!textMatchesInstitution(instHaystack, opts.institution)) {
        continue;
      }

      candidates.push({
        tracked_entity_id: opts.trackedEntityId,
        title: `${title} (${nctId})`,
        source_url: `https://clinicaltrials.gov/study/${nctId}`,
        source_domain: "clinicaltrials.gov",
        published_at: published,
        raw_summary: snippet,
        source_type: "web",
        category: "other",
      });
    }
  } catch (e) {
    return {
      candidates,
      error:
        e instanceof Error ? e.message : "ClinicalTrials.gov request failed",
    };
  }

  return { candidates };
}
