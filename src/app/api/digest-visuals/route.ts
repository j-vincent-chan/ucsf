import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { offloadDigestCoverStoreInlineImages } from "@/lib/digest-cover-inline-offload";
import type { Json } from "@/types/database";
import type { DigestCoverStore, DigestVisualBundle, DigestVisualChannelStyle } from "@/lib/digest-visual-types";
import {
  digestCoverApplyChannelSelectionSnapshot,
  digestCoverRebuildFromPoolAndSelections,
  digestCoverSelectionsSnapshot,
  digestCoverStoreHasAnyCandidates,
  digestCoverStoreToDbJson,
  getBundleForChannel,
  mergeDigestCandidatePoolAcrossStore,
  parseDigestCoverStoreFromDb,
} from "@/lib/digest-visual-types";

function neutralPoolWorkBundle(store: DigestCoverStore): DigestVisualBundle {
  const candidates = mergeDigestCandidatePoolAcrossStore(store);
  const fb = store.fallback;
  return {
    v: 2,
    candidates,
    selectedId: null,
    linkPreviewOnly: false,
    strategies: fb?.strategies,
    updatedAt: fb?.updatedAt,
  };
}
import {
  applyCandidateImageEditInPlace,
  applyCroppedSnapshot,
  generateSchematicOptions,
  generateIllustrationOptions,
  generateStockOptions,
  mergeCandidates,
  removeAiCandidates,
  removeCandidateById,
  mergeUploadedDigestVisual,
  revertCandidateImageEdit,
  runDiscoverSourceOnly,
  runFullVisualPipeline,
  setCandidateIllustrationTextLayers,
  setCandidateImageAlt,
  clearDigestHeroSelection,
  setDigestHeroLinkPreviewOnly,
  setSelected,
} from "@/lib/digest-visual-pipeline";
import type { DigestVisualEditMetadata } from "@/lib/digest-visual-types";

export const maxDuration = 120;

const illustrationLabelAnchorZ = z.enum([
  "top",
  "top-left",
  "top-right",
  "bottom",
  "bottom-left",
  "bottom-right",
  "center",
]);

const illustrationTextLayerZ = z.object({
  id: z.string().min(1).max(80),
  anchor: illustrationLabelAnchorZ.optional(),
  text: z.string().max(160),
  xNorm: z.number().min(0).max(1).optional(),
  yNorm: z.number().min(0).max(1).optional(),
  fontSizePx: z.number().int().min(8).max(48).optional(),
  fontBold: z.boolean().optional(),
  fontItalic: z.boolean().optional(),
  fontUnderline: z.boolean().optional(),
  pillPaddingPx: z.number().int().min(0).max(48).optional(),
  pillSurfaceIndex: z.number().int().min(0).max(4).optional(),
});

const outputStyleSchema = z.object({
  /** Which Content studio channel this visual edit applies to (defaults to newsletter). */
  output_style: z.enum(["bluesky_x", "newsletter", "linkedin"]).optional(),
});

const actionUnion = z.discriminatedUnion("action", [
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
  z.object({
    action: z.literal("save_cropped"),
    source_item_id: z.string().uuid(),
    mime: z.string().min(8).max(64).default("image/png"),
    base64: z.string().min(100).max(25_000_000),
    /** When saving from the chooser, apply crop to this candidate (becomes selected snapshot). */
    for_candidate_id: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal("save_digest_image_edit"),
    source_item_id: z.string().uuid(),
    source_candidate_id: z.string().min(1),
    mime: z.string().min(8).max(64),
    base64: z.string().min(100).max(25_000_000),
    /** When omitted, overlay labels stay unchanged on the candidate. */
    illustration_text_layers: z.array(illustrationTextLayerZ).max(10).optional(),
    edit_metadata: z.object({
      v: z.literal(1),
      originalCandidateId: z.string().min(1),
      sourceNaturalPixels: z
        .object({ w: z.number().positive(), h: z.number().positive() })
        .optional(),
      aspectPreset: z.enum(["original", "16:9", "1:1", "4:5", "freeform"]).optional(),
      cropPixels: z.object({
        x: z.number(),
        y: z.number(),
        w: z.number().positive(),
        h: z.number().positive(),
      }),
      resizePixels: z.object({
        w: z.number().int().positive(),
        h: z.number().int().positive(),
      }),
      lockAspect: z.boolean(),
      adjustments: z.object({
        brightness: z.number(),
        contrast: z.number(),
        saturation: z.number(),
        warmth: z.number(),
        sharpness: z.number(),
      }),
      filterId: z.string(),
      editedAt: z.string(),
    }),
  }),
  z.object({
    action: z.literal("revert_digest_candidate_image"),
    source_item_id: z.string().uuid(),
    candidate_id: z.string().min(1),
  }),
  z.object({
    action: z.literal("update_illustration_text_layers"),
    source_item_id: z.string().uuid(),
    candidate_id: z.string().min(1),
    illustration_text_layers: z.array(illustrationTextLayerZ).max(10),
  }),
  z.object({
    action: z.literal("update_digest_candidate_caption"),
    source_item_id: z.string().uuid(),
    candidate_id: z.string().min(1),
    caption: z.string().max(500),
  }),
  z.object({
    action: z.literal("upload_digest_visual"),
    source_item_id: z.string().uuid(),
    mime: z.string().min(8).max(64),
    base64: z.string().min(100).max(25_000_000),
    file_name: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal("select_link_preview_only"),
    source_item_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("clear_digest_hero"),
    source_item_id: z.string().uuid(),
  }),
]);

const actionSchema = z.intersection(actionUnion, outputStyleSchema);

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
    .select("id, community_id, title, raw_text, raw_summary, source_type, source_url, digest_cover")
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

  const channel = (body.output_style ?? "newsletter") as DigestVisualChannelStyle;
  let store = parseDigestCoverStoreFromDb(item.digest_cover);

  try {
    if (body.action === "refresh_all") {
      const next = await runFullVisualPipeline(base);
      store = { v: 3, fallback: next, channels: {} };
    } else if (body.action === "clear_digest_hero") {
      const bundle = getBundleForChannel(store, channel);
      if (!bundle) {
        return NextResponse.json({ error: "No digest visuals." }, { status: 400 });
      }
      if (!bundle.selectedId && bundle.linkPreviewOnly !== true) {
        return NextResponse.json({ error: "No hero is selected for this channel." }, { status: 400 });
      }
      const nextBundle = clearDigestHeroSelection(bundle);
      const snap = digestCoverSelectionsSnapshot(store);
      snap[channel] = {
        selectedId: nextBundle.selectedId,
        linkPreviewOnly: nextBundle.linkPreviewOnly === true,
      };
      store = digestCoverApplyChannelSelectionSnapshot(store, snap);
    } else if (body.action === "select" || body.action === "select_link_preview_only") {
      const bundle = getBundleForChannel(store, channel);
      if (!bundle?.candidates.length) {
        const err =
          body.action === "select"
            ? "No visual bundle yet. Run refresh or discover first."
            : "Add at least one visual option before choosing link preview only.";
        return NextResponse.json({ error: err }, { status: 400 });
      }
      const nextBundle =
        body.action === "select"
          ? setSelected(bundle, body.candidate_id)
          : setDigestHeroLinkPreviewOnly(bundle);
      const snap = digestCoverSelectionsSnapshot(store);
      snap[channel] = {
        selectedId: nextBundle.selectedId,
        linkPreviewOnly: nextBundle.linkPreviewOnly === true,
      };
      store = digestCoverApplyChannelSelectionSnapshot(store, snap);
    } else {
      const snapBefore = digestCoverSelectionsSnapshot(store);
      let poolWork = neutralPoolWorkBundle(store);

      switch (body.action) {
        case "discover_source": {
          const discovered = await runDiscoverSourceOnly(base);
          poolWork = mergeCandidates(poolWork, discovered);
          break;
        }
        case "generate_schematic": {
          const gen = await generateSchematicOptions({
            title: item.title,
            abstractText: abstractOrSummary,
            rawText: item.raw_text,
            sourceUrl: item.source_url,
          });
          poolWork = mergeCandidates(poolWork, gen);
          break;
        }
        case "generate_illustration": {
          const gen = await generateIllustrationOptions({
            title: item.title,
            abstractText: abstractOrSummary,
            rawText: item.raw_text,
            sourceUrl: item.source_url,
          });
          poolWork = mergeCandidates(poolWork, gen);
          break;
        }
        case "generate_stock": {
          const gen = await generateStockOptions({
            title: item.title,
            abstractText: abstractOrSummary,
            rawText: item.raw_text,
            sourceUrl: item.source_url,
          });
          poolWork = mergeCandidates(poolWork, gen);
          break;
        }
        case "discard": {
          poolWork = removeCandidateById(poolWork, body.candidate_id);
          break;
        }
        case "clear_ai": {
          poolWork = removeAiCandidates(poolWork);
          break;
        }
        case "save_cropped": {
          const cropBase =
            body.for_candidate_id != null ? setSelected(poolWork, body.for_candidate_id) : poolWork;
          poolWork = applyCroppedSnapshot(cropBase, { base64: body.base64, mime: body.mime });
          break;
        }
        case "save_digest_image_edit": {
          if (body.edit_metadata.originalCandidateId !== body.source_candidate_id) {
            return NextResponse.json({ error: "edit_metadata must reference source_candidate_id" }, { status: 400 });
          }
          poolWork = applyCandidateImageEditInPlace(poolWork, {
            candidateId: body.source_candidate_id,
            base64: body.base64,
            mime: body.mime,
            editMetadata: body.edit_metadata as DigestVisualEditMetadata,
            illustrationTextLayers:
              body.illustration_text_layers !== undefined ? body.illustration_text_layers : undefined,
          });
          break;
        }
        case "update_illustration_text_layers": {
          poolWork = setCandidateIllustrationTextLayers(poolWork, body.candidate_id, body.illustration_text_layers);
          break;
        }
        case "update_digest_candidate_caption": {
          poolWork = setCandidateImageAlt(poolWork, body.candidate_id, body.caption);
          break;
        }
        case "revert_digest_candidate_image": {
          poolWork = revertCandidateImageEdit(poolWork, body.candidate_id);
          break;
        }
        case "upload_digest_visual": {
          poolWork = mergeUploadedDigestVisual(poolWork, {
            mime: body.mime,
            base64: body.base64,
            fileName: body.file_name ?? undefined,
          });
          break;
        }
        default:
          return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
      }

      store = digestCoverRebuildFromPoolAndSelections(snapBefore, poolWork);
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Visual pipeline failed" },
      { status: 502 },
    );
  }

  if (!digestCoverStoreHasAnyCandidates(store)) {
    const { error: upErr } = await supabase.from("source_items").update({ digest_cover: null }).eq("id", item.id);
    if (upErr) {
      return NextResponse.json({ error: upErr.message ?? "Could not save visuals" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, bundle: null, digest_cover_store: null });
  }

  try {
    store = await offloadDigestCoverStoreInlineImages(supabase, store, {
      sourceItemId: item.id,
      communityId: item.community_id,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not upload digest images to storage" },
      { status: 500 },
    );
  }

  const dbJson = digestCoverStoreToDbJson(store);
  const { error: upErr } = await supabase.from("source_items").update({ digest_cover: dbJson }).eq("id", item.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message ?? "Could not save visuals" }, { status: 500 });
  }

  const responseBundle = getBundleForChannel(store, channel);
  return NextResponse.json({
    ok: true,
    bundle: responseBundle,
    /** Lets the client skip a separate giant `SELECT digest_cover` after each save (reduces Supabase 520s). */
    digest_cover_store: dbJson as Json,
  });
}
