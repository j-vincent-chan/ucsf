import { buildInvestigatorSocialDirectory } from "@/lib/social-signals/ai-companion/investigator-directory";
import type { InvestigatorSocialDirectory } from "@/lib/social-signals/ai-companion/investigator-directory";
import { createClient } from "@/lib/supabase/server";

/** Active watchlist investigators with X / Bluesky handles — for Mentions ingest. */
export async function fetchInvestigatorSocialDirectoryForCommunity(
  communityId: string,
): Promise<InvestigatorSocialDirectory | undefined> {
  const supabase = await createClient();
  const { data: invRows } = await supabase
    .from("tracked_entities")
    .select("x_handle, bluesky_handle, last_name")
    .eq("community_id", communityId)
    .eq("active", true);

  if (!invRows?.length) return undefined;
  return buildInvestigatorSocialDirectory(invRows);
}
