import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { bufferFromDigestVisualCandidate } from "@/lib/digest-visual-media";
import {
  getActiveCandidate,
  getBundleForChannel,
  parseDigestCoverStoreFromDb,
} from "@/lib/digest-visual-types";

export type ResolvedPublishVisual = {
  buffer: Buffer;
  mime: string;
};

/**
 * Loads the selected digest visual for a source item after verifying the user belongs to the same community.
 */
export async function resolvePublishVisualForSourceItem(
  admin: SupabaseClient<Database>,
  userId: string,
  sourceItemId: string,
): Promise<ResolvedPublishVisual | null> {
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("community_id")
    .eq("id", userId)
    .maybeSingle();
  if (pErr || !profile) return null;

  const { data: item, error: iErr } = await admin
    .from("source_items")
    .select("community_id, digest_cover")
    .eq("id", sourceItemId)
    .maybeSingle();
  if (iErr || !item || item.community_id !== profile.community_id) return null;

  const store = parseDigestCoverStoreFromDb(item.digest_cover as Json);
  const bundle = getBundleForChannel(store, "bluesky_x");
  const candidate = getActiveCandidate(bundle);
  if (!candidate) return null;

  return bufferFromDigestVisualCandidate(candidate);
}

/**
 * Returns `source_items.source_url` when the item is in the user’s community and the URL is http(s).
 */
export async function resolvePublishSourceUrlForItem(
  admin: SupabaseClient<Database>,
  userId: string,
  sourceItemId: string,
): Promise<string | null> {
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("community_id")
    .eq("id", userId)
    .maybeSingle();
  if (pErr || !profile) return null;

  const { data: item, error: iErr } = await admin
    .from("source_items")
    .select("community_id, source_url")
    .eq("id", sourceItemId)
    .maybeSingle();
  if (iErr || !item || item.community_id !== profile.community_id) return null;

  const raw = item.source_url?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return raw;
  } catch {
    return null;
  }
}
