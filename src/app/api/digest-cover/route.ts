import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveDigestCover } from "@/lib/digest-cover";
import type { Json } from "@/types/database";

const bodySchema = z.object({
  source_item_id: z.string().uuid(),
});

function extractPubmedPmidFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
  return m?.[1] ?? null;
}

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

  const pmid = item.source_type === "pubmed" ? extractPubmedPmidFromUrl(item.source_url) : null;
  const abstractOrSummary =
    (item.raw_text?.trim() && item.raw_text.trim().slice(0, 4000)) ||
    (item.raw_summary?.trim() && item.raw_summary.trim().slice(0, 4000)) ||
    item.title;

  const cover = await resolveDigestCover({
    pmid,
    title: item.title,
    abstractOrSummary,
  });

  if (!cover) {
    return NextResponse.json(
      { error: "Could not resolve an illustration (PMC image or image generation unavailable)." },
      { status: 502 },
    );
  }

  const { error: upErr } = await supabase
    .from("source_items")
    .update({ digest_cover: cover as unknown as Json })
    .eq("id", item.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message ?? "Could not save illustration" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cover });
}
