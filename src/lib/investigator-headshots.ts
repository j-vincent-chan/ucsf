import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const INVESTIGATOR_HEADSHOTS_BUCKET = "investigator-headshots";

/** Stable object name under `{community_id}/{entity_id}/`. */
export const INVESTIGATOR_HEADSHOT_OBJECT_NAME = "headshot";

export function investigatorHeadshotObjectPath(
  communityId: string,
  entityId: string,
): string {
  return `${communityId}/${entityId}/${INVESTIGATOR_HEADSHOT_OBJECT_NAME}`;
}

export function investigatorHeadshotPublicUrl(
  supabase: SupabaseClient<Database>,
  storagePath: string | null | undefined,
): string | null {
  const p = storagePath?.trim();
  if (!p) return null;
  const { data } = supabase.storage.from(INVESTIGATOR_HEADSHOTS_BUCKET).getPublicUrl(p);
  return data.publicUrl ?? null;
}

/** Storage-backed path wins over external `headshot_url` (e.g. CSV import). */
export function resolveTrackedEntityHeadshotSrc(
  supabase: SupabaseClient<Database>,
  row: { headshot_storage_path?: string | null; headshot_url?: string | null },
): string | null {
  const fromStorage = investigatorHeadshotPublicUrl(supabase, row.headshot_storage_path);
  if (fromStorage) return fromStorage;
  const u = row.headshot_url?.trim() ?? "";
  if (u && /^https?:\/\//i.test(u)) return u;
  return null;
}
