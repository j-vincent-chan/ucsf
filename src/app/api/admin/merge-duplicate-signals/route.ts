import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getSessionUser } from "@/lib/auth";

/**
 * Merges duplicate source_items rows that share the same signal_group_key
 * (same URL or same title + UTC day). Keeps the oldest row; links investigators;
 * reassigns summaries; deletes extras.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("merge_duplicate_source_items_by_signal_group");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ merged: typeof data === "number" ? data : 0 });
}
