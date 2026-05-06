import { z } from "zod";

const responseSchema = z.object({
  alt: z.string().max(420),
});

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export type DigestAltVisualKind = "schematic" | "stock";

const FALLBACK_MAX = 420;

/**
 * Accessibility description when the alt-text model is unavailable or fails.
 * Keeps title/context/overlay hints without claiming specifics of the unseen raster.
 */
export function buildFallbackDigestImageAlt(opts: {
  visualKind: DigestAltVisualKind;
  title: string;
  summaryAndExcerpts: string;
  overlayLabels?: string[];
}): string {
  const title = opts.title.replace(/\s+/g, " ").trim() || "Research item";
  const kind =
    opts.visualKind === "schematic"
      ? "AI-generated editorial schematic-style illustration"
      : "AI-generated realistic biomedical stock-style photo";
  const overlays = opts.overlayLabels?.map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 5);
  const overlayPhrase =
    overlays && overlays.length > 0 ? ` Includes overlaid labels for: ${overlays.join("; ")}.` : "";
  const ctx = clip(opts.summaryAndExcerpts.replace(/\s+/g, " "), 220);
  const sentence = ctx ? `${kind} about ${clip(title, 200)}.${overlayPhrase} Summary context: ${ctx}` : `${kind} about ${clip(title, 280)}.${overlayPhrase}`;
  return clip(sentence.replace(/\s+/g, " ").trim(), FALLBACK_MAX);
}

/**
 * Best-effort accessibility caption for AI-generated digest thumbnails (stored as `candidate.caption`).
 * Does not set `imageAltUserEdited` — users can replace it in the editor (then marked Custom).
 * Returns null when disabled, missing API key, or the model fails — use {@link resolveDigestImageAltForAiCandidate} for a guaranteed string.
 */
export async function generateDigestImageAltCaption(opts: {
  visualKind: DigestAltVisualKind;
  title: string;
  summaryAndExcerpts: string;
  imagePrompt: string;
  /** Overlay strings from illustration pipeline (optional). */
  overlayLabels?: string[];
}): Promise<string | null> {
  const disabled = process.env.DIGEST_ALT_TEXT_GENERATION?.trim().toLowerCase();
  if (disabled === "false" || disabled === "0" || disabled === "no") {
    return null;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model =
    process.env.OPENAI_DIGEST_ALT_MODEL?.trim() ||
    process.env.OPENAI_IMAGE_PROMPT_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini";

  const kindLine =
    opts.visualKind === "schematic"
      ? "This is an AI-generated editorial schematic / BioRender-style illustration (not a photograph of real experimental data)."
      : "This is an AI-generated photo-style biomedical editorial visual (not documentary photography).";

  const overlays =
    opts.overlayLabels?.filter((x) => x.trim()).slice(0, 8) ?? [];
  const overlayBlock =
    overlays.length > 0
      ? `\nFigure overlay labels (may appear as pills on the image — weave key concepts into the alt naturally):\n${overlays.map((t) => `- ${t}`).join("\n")}\n`
      : "";

  const user = [
    kindLine,
    "",
    `Paper / signal title: ${opts.title.trim() || "(untitled)"}`,
    "",
    "Context (truncated):",
    clip(opts.summaryAndExcerpts, 6000),
    "",
    "Image-generation brief sent to the image model (truncated):",
    clip(opts.imagePrompt, 8000),
    overlayBlock,
    'Return JSON only: { "alt": "<string>" }.',
    "The alt must:",
    "- Be 1–2 sentences, plain English, suitable for screen readers and platform image descriptions.",
    "- Describe what the figure conveys about the science (mechanism, contrast, setting), not technical prompt jargon.",
    "- Avoid phrases like 'image shows', 'this picture'; start with subject.",
    "- Do not claim peer-reviewed results beyond what the title/context supports.",
    "- Stay under 380 characters if possible (hard max 420).",
  ].join("\n");

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.25,
      max_completion_tokens: 220,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You write concise, factual image alternative text for biomedical newsletter digests. Output JSON only with key `alt`.",
        },
        { role: "user", content: user },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return null;
    const parsed = responseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const alt = clip(parsed.data.alt.replace(/\s+/g, " "), 420);
    return alt.length > 0 ? alt : null;
  } catch {
    return null;
  }
}

/**
 * Prefer LLM-written alt text; otherwise {@link buildFallbackDigestImageAlt} so AI-generated digest visuals always carry alt text.
 */
export async function resolveDigestImageAltForAiCandidate(opts: {
  visualKind: DigestAltVisualKind;
  title: string;
  summaryAndExcerpts: string;
  imagePrompt: string;
  overlayLabels?: string[];
}): Promise<string> {
  const primary = await generateDigestImageAltCaption(opts);
  if (primary && primary.trim().length > 0) return primary.trim();
  return buildFallbackDigestImageAlt({
    visualKind: opts.visualKind,
    title: opts.title,
    summaryAndExcerpts: opts.summaryAndExcerpts,
    overlayLabels: opts.overlayLabels,
  });
}
