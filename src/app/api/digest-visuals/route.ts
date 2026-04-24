import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseDigestVisualBundleFromDb, bundleToJson } from "@/lib/digest-visual-types";
import {
  generateSchematicOptions,
  generateIllustrationOptions,
  generateStockOptions,
  mergeCandidates,
  removeAiCandidates,
  removeCandidateById,
  runDiscoverSourceOnly,
  runFullVisualPipeline,
  setSelected,
} from "@/lib/digest-visual-pipeline";
import type { Json } from "@/types/database";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("refresh_all"),
    source_item_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("select"),
    source_item_id: z.string().uuid(),
    candidate_id: z.string().min(1),
  }),
  z.object({
    action: z.literal("discard"),
    source_item_id: z.string().uuid(),
    candidate_id: z.string().min(1),
  }),
  z.object({
    action: z.literal("discover_source"),
    source_item_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("generate_schematic"),
    source_item_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("generate_illustration"),
    source_item_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("generate_stock"),
    source_item_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("clear_ai"),
    source_item_id: z.string().uuid(),
  }),
]);

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = actionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const { data: item, error: itemErr } = await supabase
    .from("source_items")
    .select("id, title, raw_text, raw_summary, source_type, source_url, digest_cover")
    .eq("id", body.source_item_id)
    .maybeSingle();

  if (itemErr || !item) {
    return NextResponse.json({ error: "Source item not found" }, { status: 404 });
  }

  const base = {
    title: item.title,
    rawText: item.raw_text,
    rawSummary: item.raw_summary,
    sourceType: item.source_type,
    sourceUrl: item.source_url,
  };

  const abstractOrSummary =
    (item.raw_text?.trim() && item.raw_text.trim().slice(0, 8000)) ||
    (item.raw_summary?.trim() && item.raw_summary.trim().slice(0, 8000)) ||
    item.title;

  let bundle = parseDigestVisualBundleFromDb(item.digest_cover);

  try {
    switch (body.action) {
      case "refresh_all": {
        const next = await runFullVisualPipeline(base);
        bundle = next;
        break;
      }
      case "discover_source": {
        const discovered = await runDiscoverSourceOnly(base);
        bundle = mergeCandidates(bundle ?? { v: 2, selectedId: null, candidates: [] }, discovered);
        break;
      }
      case "generate_schematic": {
        const gen = await generateSchematicOptions({
          title: item.title,
          abstractText: abstractOrSummary,
          rawText: item.raw_text,
          sourceUrl: item.source_url,
        });
        const merged = mergeCandidates(bundle ?? { v: 2, selectedId: null, candidates: [] }, gen);
        const generatedId = gen.find((c) => c.type === "schematic")?.id ?? null;
        bundle = generatedId ? setSelected(merged, generatedId) : merged;
        break;
      }
      case "generate_illustration": {
        const gen = await generateIllustrationOptions({
          title: item.title,
          abstractText: abstractOrSummary,
          rawText: item.raw_text,
          sourceUrl: item.source_url,
        });
        const merged = mergeCandidates(bundle ?? { v: 2, selectedId: null, candidates: [] }, gen);
        const generatedId = gen.find((c) => c.type === "schematic")?.id ?? null;
        bundle = generatedId ? setSelected(merged, generatedId) : merged;
        break;
      }
      case "generate_stock": {
        const gen = await generateStockOptions({ title: item.title, abstractText: abstractOrSummary });
        bundle = mergeCandidates(bundle ?? { v: 2, selectedId: null, candidates: [] }, gen);
        break;
      }
      case "select": {
        if (!bundle) {
          return NextResponse.json({ error: "No visual bundle yet. Run refresh or discover first." }, { status: 400 });
        }
        bundle = setSelected(bundle, body.candidate_id);
        break;
      }
      case "discard": {
        if (!bundle) {
          return NextResponse.json({ error: "No visual bundle." }, { status: 400 });
        }
        bundle = removeCandidateById(bundle, body.candidate_id);
        break;
      }
      case "clear_ai": {
        if (!bundle) {
          return NextResponse.json({ error: "No visual bundle." }, { status: 400 });
        }
        bundle = removeAiCandidates(bundle);
        break;
      }
      default:
        return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Visual pipeline failed" },
      { status: 502 },
    );
  }

  if (!bundle || bundle.candidates.length === 0) {
    if (body.action === "clear_ai") {
      const { error: upErr } = await supabase
        .from("source_items")
        .update({ digest_cover: null })
        .eq("id", item.id);
      if (upErr) {
        return NextResponse.json({ error: upErr.message ?? "Could not save visuals" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, bundle: null });
    }
    return NextResponse.json(
      { error: "Could not produce visual candidates (check OpenAI key and source URL)." },
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
