import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

function readSupabaseBrowserConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured for the browser: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (e.g. in .env.local), then restart `next dev`.",
    );
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL must start with http:// or https:// (got: ${url.slice(0, 24)}…).`,
    );
  }
  return { url, anonKey };
}

export function createClient() {
  const { url, anonKey } = readSupabaseBrowserConfig();
  return createBrowserClient<Database>(url, anonKey);
}
