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

/** Server-side upload — avoids browser Storage client writing owner_id as "". */
export async function uploadInvestigatorHeadshotViaApi(
  entityId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const fd = new FormData();
  fd.set("entityId", entityId);
  fd.set("contentType", file.type);
  fd.set("file", file);
  const res = await fetch("/api/entities/investigator-headshot-upload", {
    method: "POST",
    body: fd,
    credentials: "same-origin",
  });
  let payload: { error?: string; path?: string } = {};
  try {
    payload = (await res.json()) as { error?: string; path?: string };
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: typeof payload.error === "string" ? payload.error : `Upload failed (HTTP ${res.status})`,
    };
  }
  const path = typeof payload.path === "string" ? payload.path.trim() : "";
  if (!path) {
    return { ok: false, error: "Upload succeeded but no storage path was returned" };
  }
  return { ok: true, path };
}
