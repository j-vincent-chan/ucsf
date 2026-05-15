import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function trimEnv(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t && t.length > 0 ? t : undefined;
}

/** Service-role client for server-only auth helpers (never import in client code). */
export function createAdminClient(): SupabaseClient<Database> {
  const url = trimEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRole = trimEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Same as {@link createAdminClient} but returns null when env is missing (e.g. local dev without service role). */
export function tryCreateAdminClient(): SupabaseClient<Database> | null {
  const url = trimEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRole = trimEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceRole) return null;
  return createClient<Database>(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
