import { NextResponse } from "next/server";
import { z } from "zod";
import { refreshReporterFundingItemFromApi } from "@/lib/discovery/reporter-funding-refresh";
import { resolveNihProjectNumForItem } from "@/lib/nih-project-num";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  source_item_id: z.string().uuid(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { data: item, error: itemErr } = await supabase
    .from("source_items")
    .select("id, source_type, title, nih_project_num, tracked_entity_id")
    .eq("id", parsed.data.source_item_id)
    .maybeSingle();

  if (itemErr || !item) {
    return NextResponse.json({ error: "Signal not found" }, { status: 404 });
  }
  if (item.source_type !== "reporter") {
    return NextResponse.json({ error: "Not a RePORTER funding signal" }, { status: 400 });
  }
  if (!item.tracked_entity_id) {
    return NextResponse.json({ error: "No investigator linked" }, { status: 400 });
  }

  const projectNum = resolveNihProjectNumForItem({
    nih_project_num: item.nih_project_num,
    title: item.title,
  });
  if (!projectNum) {
    return NextResponse.json({ error: "No NIH project number on this signal" }, { status: 400 });
  }

  const result = await refreshReporterFundingItemFromApi(
    supabase,
    item.id,
    item.tracked_entity_id,
    projectNum,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Refresh failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
