import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { DiscoveryCandidate } from "@/lib/discovery/types";
import {
  parseNihSupportYearFromProjectNum,
  resolveNihProjectNumForItem,
} from "@/lib/nih-project-num";
import {
  fetchReporterFundingCandidateByProjectNum,
  isNihReporterSubprojectOrCoreTitle,
  normalizeNihProjectNum,
} from "@/lib/discovery/nih-reporter";

/** Apply latest RePORTER award notice / support year to an existing funding row when discovery finds a newer cycle. */
export async function refreshReporterFundingItemIfNewer(
  supabase: SupabaseClient<Database>,
  itemId: string,
  candidate: DiscoveryCandidate,
): Promise<boolean> {
  if (candidate.source_type !== "reporter") return false;

  const { data: cur, error } = await supabase
    .from("source_items")
    .select("published_at, title, raw_summary, nih_project_num")
    .eq("id", itemId)
    .maybeSingle();

  if (error || !cur) return false;

  const curProj = resolveNihProjectNumForItem({
    nih_project_num: cur.nih_project_num,
    title: cur.title,
  });
  const newProj = candidate.nih_project_num?.trim()
    ? normalizeNihProjectNum(candidate.nih_project_num)
    : null;
  const curSy = curProj ? parseNihSupportYearFromProjectNum(curProj) : null;
  const newSy = newProj ? parseNihSupportYearFromProjectNum(newProj) : null;

  const newPubMs = candidate.published_at ? Date.parse(candidate.published_at) : NaN;
  const oldPubMs = cur.published_at ? Date.parse(cur.published_at) : NaN;
  const newerActivity =
    Number.isFinite(newPubMs) && (!Number.isFinite(oldPubMs) || newPubMs > oldPubMs);
  const newerSupportYear =
    newSy != null && (curSy == null || newSy > curSy);
  const betterTitle =
    Boolean(candidate.title?.trim()) &&
    (cur.title !== candidate.title ||
      (isNihReporterSubprojectOrCoreTitle(cur.title) &&
        !isNihReporterSubprojectOrCoreTitle(candidate.title)));

  if (!newerActivity && !newerSupportYear && !betterTitle) {
    return false;
  }

  const patch: Database["public"]["Tables"]["source_items"]["Update"] = {
    raw_summary: candidate.raw_summary ?? cur.raw_summary,
  };
  if (candidate.title?.trim()) patch.title = candidate.title;
  if (newProj) patch.nih_project_num = newProj;
  if (newerActivity && candidate.published_at) {
    patch.published_at = candidate.published_at;
  }

  const { error: upErr } = await supabase.from("source_items").update(patch).eq("id", itemId);
  return !upErr;
}

/** Pull current RePORTER row for this project number and refresh stored dates / summary / title. */
export async function refreshReporterFundingItemFromApi(
  supabase: SupabaseClient<Database>,
  itemId: string,
  trackedEntityId: string,
  projectNum: string,
): Promise<{ ok: boolean; error?: string }> {
  const candidate = await fetchReporterFundingCandidateByProjectNum(
    projectNum,
    trackedEntityId,
  );
  if (!candidate) {
    return { ok: false, error: "No matching RePORTER award found for this project number." };
  }
  const updated = await refreshReporterFundingItemIfNewer(supabase, itemId, candidate);
  if (!updated) {
    const { error: forceErr } = await supabase
      .from("source_items")
      .update({
        title: candidate.title,
        published_at: candidate.published_at,
        raw_summary: candidate.raw_summary,
        nih_project_num: candidate.nih_project_num
          ? normalizeNihProjectNum(candidate.nih_project_num)
          : undefined,
      })
      .eq("id", itemId);
    if (forceErr) return { ok: false, error: forceErr.message };
  }
  return { ok: true };
}
