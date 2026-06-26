import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "entity";
}

/** Default faculty slug: last-first, with optional middle initial when present. */
export function facultySlugFromNames(
  firstName: string,
  lastName: string,
  middleInitial?: string,
): string {
  const f = firstName.trim();
  const l = lastName.trim();
  const mi = (middleInitial ?? "").trim().slice(0, 1).toUpperCase();
  const parts = [l, mi, f].filter(Boolean);
  return slugify(parts.join("-") || "faculty");
}

/** First unused slug in `base`, `base-2`, `base-3`, … within a community. */
export async function uniqueEntitySlugInCommunity(
  supabase: SupabaseClient<Database>,
  communityId: string,
  preferred: string,
  excludeEntityId?: string,
): Promise<string> {
  const base = slugify(preferred) || "faculty";
  let candidate = base;
  for (let n = 2; n <= 100; n++) {
    let q = supabase
      .from("tracked_entities")
      .select("id")
      .eq("community_id", communityId)
      .eq("slug", candidate)
      .limit(1);
    if (excludeEntityId) q = q.neq("id", excludeEntityId);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return candidate;
    candidate = `${base}-${n}`;
  }
  throw new Error("Could not allocate a unique slug for this investigator");
}
