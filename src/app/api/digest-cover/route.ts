import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { bundleToJson } from "@/lib/digest-visual-types";
import { runFullVisualPipeline } from "@/lib/digest-visual-pipeline";
import type { Json } from "@/types/database";

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
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data: item, error: itemErr } = await supabase
    .from("source_items")
    .select("id, title, raw_text, raw_summary, source_type, source_url")
    .eq("id", parsed.data.source_item_id)
    .maybeSingle();

  if (itemErr || !item) {
    return NextResponse.json({ error: "Source item not found" }, { status: 404 });
  }

  let bundle;
  try {
    bundle = await runFullVisualPipeline({
      title: item.title,
      rawText: item.raw_text,
      rawSummary: item.raw_summary,
      sourceType: item.source_type,
      sourceUrl: item.source_url,
    });
  } catch {
    return NextResponse.json({ error: "Visual pipeline failed." }, { status: 502 });
  }

  if (!bundle.candidates.length) {
    return NextResponse.json(
      { error: "Could not resolve visuals (source images and/or image generation unavailable)." },
      { status: 502 },
    );
  }

  const { error: upErr } = await supabase
    .from("source_items")
    .update({ digest_cover: bundleToJson(bundle) as Json })
    .eq("id", item.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message ?? "Could not save visuals" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, bundle });
}
