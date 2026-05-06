import { z } from "zod";
import {
  ILLUSTRATION_LABEL_ANCHORS,
  type DigestIllustrationTextLayer,
  type IllustrationLabelAnchor,
} from "@/lib/digest-visual-types";

const anchorSchema = z.enum(ILLUSTRATION_LABEL_ANCHORS);

const responseSchema = z.object({
  layers: z
    .array(
      z.object({
        text: z.string().max(120),
        anchor: anchorSchema.optional(),
      }),
    )
    .max(6),
});

/** Vision path (opt-in via `DIGEST_OVERLAY_VISION=true`): positions aligned to empty pills if the raster has them. */
const visionLayerSchema = z.object({
  text: z.string().max(120),
  xNorm: z.number().min(0).max(1),
  yNorm: z.number().min(0).max(1),
});

const visionResponseSchema = z.object({
  layers: z.array(visionLayerSchema).min(0).max(6),
});

function clampNorm(v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  return Math.max(0.02, Math.min(0.98, v));
}

const DEFAULT_ANCHOR_CYCLE: IllustrationLabelAnchor[] = [
  "bottom-left",
  "bottom-right",
  "top",
  "bottom",
  "top-left",
  "center",
];

function newLayerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `tl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Strip refiner/LLM cruft so overlay pills show plain caption phrases only. */
function sanitizeOverlayPhrase(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(/\s*--+\s*/g, " ").replace(/\s*[—–]\s*/g, " ");
  s = s.replace(/overlay\s*concepts\s*:?/gi, " ").trim();
  s = s.replace(/^[\s•\-\*]+/u, "").replace(/^\d+[.)]\s+/, "").trim();
  if (/^[\s\-–—•]+$/u.test(s)) return "";
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.slice(0, 120);
}

function parseConceptLinesFromRawBlock(block: string): string[] {
  const lines = block.split("\n");
  const concepts: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (concepts.length > 0) break;
      continue;
    }
    if (/^(background|canvas|composition|close by restating)\b/i.test(line)) break;
    const s = sanitizeOverlayPhrase(line);
    if (s) concepts.push(s);
    if (concepts.length >= 6) break;
  }
  return concepts;
}

/**
 * Label suggestions from the refiner: legacy `OVERLAY_CONCEPTS:` block, else the last short lines
 * of the prompt (plain phrases only).
 */
function parseCaptionLinesFromRefinedPrompt(refinedImagePrompt: string): string[] {
  const legacy = refinedImagePrompt.match(/OVERLAY_CONCEPTS\s*:([\s\S]*)/i);
  if (legacy) {
    const fromLegacy = parseConceptLinesFromRawBlock(legacy[1]!);
    if (fromLegacy.length >= 2) return fromLegacy.slice(0, 6);
  }

  const allLines = refinedImagePrompt.trimEnd().split("\n");
  while (allLines.length && allLines[allLines.length - 1]?.trim() === "") allLines.pop();

  const tail: string[] = [];
  for (let i = allLines.length - 1; i >= 0 && tail.length < 6; i--) {
    const s = sanitizeOverlayPhrase(allLines[i] ?? "");
    if (!s) continue;
    if (s.length > 100) break;
    const longSentence = s.length > 72 && /[.!?]$/.test(s);
    if (tail.length > 0 && longSentence) break;
    tail.unshift(s);
  }

  return tail.length >= 2 ? tail.slice(0, 6) : tail;
}

function layersFromStrings(texts: string[]): DigestIllustrationTextLayer[] {
  return texts
    .map((t) => sanitizeOverlayPhrase(t))
    .filter((t) => t.length > 0)
    .slice(0, 6)
    .map((text, i) => ({
      id: newLayerId(),
      text,
      anchor: DEFAULT_ANCHOR_CYCLE[i % DEFAULT_ANCHOR_CYCLE.length]!,
    }));
}

/** When LLM overlay extraction fails, still surface editable pills from title + abstract snippets. */
function heuristicFallbackLayers(title: string, summaryAndExcerpts: string): DigestIllustrationTextLayer[] {
  const segments: string[] = [];
  const t = title.replace(/\s+/g, " ").trim();
  if (t) segments.push(t.length > 72 ? `${t.slice(0, 69)}…` : t);

  const body = summaryAndExcerpts.replace(/\s+/g, " ").trim();
  if (body) {
    const sentences = body
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 16);
    for (const s of sentences) {
      const clipped = s.length > 120 ? `${s.slice(0, 117)}…` : s;
      if (!segments.some((prev) => clipped.startsWith(prev.slice(0, Math.min(20, prev.length))))) {
        segments.push(clipped);
      }
      if (segments.length >= 4) break;
    }
  }

  if (segments.length < 2 && body) {
    const chunk = body.length > 140 ? `${body.slice(0, 137)}…` : body;
    if (!segments.some((s) => s === chunk || chunk.startsWith(s.slice(0, 24)))) segments.push(chunk);
  }

  while (segments.length < 2) {
    segments.push(segments.length === 0 ? "Research highlight" : "Study context");
  }

  return layersFromStrings(segments.slice(0, 4));
}

async function extractOverlayLayersFromIllustrationImage(opts: {
  title: string;
  summaryAndExcerpts: string;
  refinedImagePrompt: string;
  imageBase64: string;
  imageMime: string;
}): Promise<DigestIllustrationTextLayer[] | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const mime = opts.imageMime.trim().startsWith("image/") ? opts.imageMime.trim() : "image/png";
  const dataUrl = `data:${mime};base64,${opts.imageBase64.replace(/\s/g, "")}`;

  const model =
    process.env.OPENAI_DIGEST_OVERLAY_VISION_MODEL?.trim() ||
    process.env.OPENAI_IMAGE_PROMPT_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini";

  const textBlock = [
    `Paper / item title: ${opts.title.trim() || "(untitled)"}`,
    "",
    "Research summary / excerpts (for label wording only; may be truncated):",
    opts.summaryAndExcerpts.slice(0, 8000),
    "",
    "Image-generation brief (truncated; for context only):",
    opts.refinedImagePrompt.slice(0, 6000),
    "",
    "Many new rasters intentionally have **no** legend strips or empty label pills—only the scene. If this image has **no** distinct empty rounded pills/rectangles reserved for captions, return { \"layers\": [] } immediately (do not invent or attach to random shapes).",
    "",
    "When empty placeholders exist (legacy images): pastel rounded pills or rounded rectangles with **no readable text inside**.",
    "",
    "Task:",
    "1) Find every distinct empty label placeholder (usually 2–6). Skip arrows, connectors, dense icons, and shapes that already contain glyphs. Tiny decorative blobs are not placeholders.",
    "2) For each placeholder, write a short label (max ~6 words, Title Case OK) for what that region represents—grounded in the research context; do not invent claims.",
    "3) Give xNorm and yNorm as the normalized coordinates (0–1) of the **center** of each empty placeholder: xNorm = centerX ÷ imageWidth, yNorm = centerY ÷ imageHeight (origin top-left).",
    "",
    "Reading order: prefer left-to-right or along the main flow when ordering the `layers` array.",
    "",
    'Return JSON only: { "layers": [ { "text": string, "xNorm": number, "yNorm": number }, ... ] }.',
    "If there are no suitable empty placeholders, return { \"layers\": [] }.",
  ].join("\n");

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.15,
      max_completion_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You map empty label callouts in biomedical schematics to coordinates and short captions only when those placeholders exist. If the image has no reserved empty pills, return an empty layers array—do not guess positions. Output JSON only.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: textBlock },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return null;
    const parsed = visionResponseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.layers.length < 1) return null;

    return parsed.data.layers.map((L) => {
      const raw = L.text.replace(/\s+/g, " ").trim();
      const t = sanitizeOverlayPhrase(raw);
      return {
        id: newLayerId(),
        text: t || raw.slice(0, 120),
        xNorm: clampNorm(L.xNorm),
        yNorm: clampNorm(L.yNorm),
      };
    });
  } catch {
    return null;
  }
}

async function extractOverlayLayersTextOnly(opts: {
  title: string;
  summaryAndExcerpts: string;
  refinedImagePrompt: string;
}): Promise<DigestIllustrationTextLayer[] | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model =
    process.env.OPENAI_IMAGE_PROMPT_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini";

  const user = [
    `Paper / item title: ${opts.title.trim() || "(untitled)"}`,
    "",
    "Research summary / excerpts (may be truncated):",
    opts.summaryAndExcerpts.slice(0, 12_000),
    "",
    "Image brief that was sent to the image model (truncated):",
    opts.refinedImagePrompt.slice(0, 10_000),
    "",
    "Return JSON only with key `layers`: an array of 2 to 6 objects.",
    'Each object: { "text": string (max ~6 words, Title Case acceptable), optionally "anchor" }.',
    `If anchor omitted, positioning will auto-assign; valid anchors when set: ${ILLUSTRATION_LABEL_ANCHORS.join(", ")}.`,
    "Labels describe elements in the figure (states, compartments, contrasts)—not disclaimers.",
  ].join("\n");

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_completion_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You write compact editorial captions for biomedical schematic thumbnails. Output JSON only.",
        },
        { role: "user", content: user },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return null;
    const parsed = responseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.layers.length < 1) return null;

    return parsed.data.layers.map((L, i) => {
      const t = sanitizeOverlayPhrase(L.text.replace(/\s+/g, " ").trim());
      return {
        id: newLayerId(),
        text: t || L.text.replace(/\s+/g, " ").trim().slice(0, 120),
        anchor: L.anchor ?? DEFAULT_ANCHOR_CYCLE[i % DEFAULT_ANCHOR_CYCLE.length]!,
      };
    });
  } catch {
    return null;
  }
}

/**
 * After the image model renders a **text-free** schematic, attach short editorial labels.
 * Order: optional vision (legacy pills) → LLM text-only → trailing caption lines from refiner → title/abstract heuristics.
 * Always returns at least two suggested layers so new illustrations open with editable labels.
 */
export async function extractDigestIllustrationOverlayLabels(opts: {
  title: string;
  summaryAndExcerpts: string;
  refinedImagePrompt: string;
  imageBase64?: string;
  imageMime?: string;
}): Promise<DigestIllustrationTextLayer[]> {
  const visionEnabled = process.env.DIGEST_OVERLAY_VISION?.trim().toLowerCase() === "true";

  if (visionEnabled && opts.imageBase64 && opts.imageMime) {
    const vision = await extractOverlayLayersFromIllustrationImage({
      title: opts.title,
      summaryAndExcerpts: opts.summaryAndExcerpts,
      refinedImagePrompt: opts.refinedImagePrompt,
      imageBase64: opts.imageBase64,
      imageMime: opts.imageMime,
    });
    if (vision && vision.length > 0) return vision;
  }

  const llm = await extractOverlayLayersTextOnly({
    title: opts.title,
    summaryAndExcerpts: opts.summaryAndExcerpts,
    refinedImagePrompt: opts.refinedImagePrompt,
  });
  if (llm && llm.length > 0) return llm;

  const concepts = parseCaptionLinesFromRefinedPrompt(opts.refinedImagePrompt);
  if (concepts.length >= 2) return layersFromStrings(concepts);
  if (concepts.length === 1) {
    const first = layersFromStrings(concepts)[0]!;
    const pad = heuristicFallbackLayers(opts.title, opts.summaryAndExcerpts).filter(
      (L) => L.text.trim().toLowerCase() !== first.text.trim().toLowerCase(),
    );
    return [first, ...pad].slice(0, 6);
  }

  return heuristicFallbackLayers(opts.title, opts.summaryAndExcerpts);
}
