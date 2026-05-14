import { NextResponse } from "next/server";
import { getProfile, getSessionUser } from "@/lib/auth";
import type { InvestigatorMentionOption } from "@/lib/investigator-mentions";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getProfile();
  if (!profile?.community_id) {
    return NextResponse.json({ investigators: [] as InvestigatorMentionOption[] });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";

  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("tracked_entities")
    .select("id, name, first_name, last_name, x_handle, bluesky_handle")
    .eq("community_id", profile.community_id)
    .eq("active", true)
    .order("last_name", { ascending: true })
    .limit(800);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  const list = (rows ?? []) as InvestigatorMentionOption[];

  if (!q) {
    return NextResponse.json({ investigators: list.slice(0, 80) });
  }

  const filtered = list.filter((r) => {
    const hay = [
      r.name,
      r.first_name,
      r.last_name,
      r.x_handle ?? "",
      r.bluesky_handle ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  return NextResponse.json({ investigators: filtered.slice(0, 80) });
}
