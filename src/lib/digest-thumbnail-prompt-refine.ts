/**
 * Optional second pass: a language model rewrites the digest thumbnail prompt so the
 * image model gets a single, tight brief—similar to how ChatGPT refines before image gen.
 */

const REFINER_SYSTEM = `You are an expert medical art director for newsletter thumbnails.

The user message is a COMPLETE prompt for an AI image model (BioRender-style editorial thumbnail rules + RESEARCH CONTENT with URL, title, and abstract text).

Your job: output ONE replacement prompt in plain English that the image model will follow—nothing else (no markdown fences, no "Here is", no analysis).

Requirements for the rewritten prompt:
1. Start with one sentence stating the scientific essence (central finding only).
2. Describe ONE clear visual concept: prefer a simple left-to-right or top-down editorial flow, or one focal mechanism scene. The layout should feel like a polished BioRender figure or journal thumbnail—calm, spacious, readable at small size.
3. Explicitly discourage stock infographic tropes unless necessary: avoid default "magnifying glass zoom" panels, vertical stacked legend strips with colored ribbons, and dense icon grids. If a comparison is needed, prefer a clean two-panel side-by-side over a busy callout collage.
4. Name 2–4 SHORT label strings (correct spelling) that should appear on the image, each 1–5 words, tied to specific elements; no paragraphs, no fake UI blocks, no lorem text.
5. Close by restating: white or very light background, crisp readable vector-like illustration, soft gradients, muted professional colors, strong negative space, minimal clutter.
6. Preserve factual content from the research (disease, mechanism, agents, tissues). Do not invent study results not implied by the text.

Be concise: typically 12–25 sentences total—enough to direct the artist, not an essay.`;

export type RefineResult = {
  refinedPrompt: string;
  usedRefinement: boolean;
  skipReason?: string;
};

export async function refineDigestThumbnailPrompt(basePrompt: string): Promise<RefineResult> {
  const flag = process.env.DIGEST_THUMBNAIL_PROMPT_REFINE?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") {
    return { refinedPrompt: basePrompt, usedRefinement: false, skipReason: "DIGEST_THUMBNAIL_PROMPT_REFINE disabled" };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { refinedPrompt: basePrompt, usedRefinement: false, skipReason: "no API key" };
  }

  const model =
    process.env.OPENAI_IMAGE_PROMPT_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini";

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.25,
      max_completion_tokens: 1200,
      messages: [
        { role: "system", content: REFINER_SYSTEM },
        {
          role: "user",
          content: basePrompt.length > 24000 ? `${basePrompt.slice(0, 23900)}…\n[truncated for refiner]` : basePrompt,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (text.length < 120) {
      return { refinedPrompt: basePrompt, usedRefinement: false, skipReason: "refiner output too short" };
    }

    return { refinedPrompt: text, usedRefinement: true };
  } catch {
    return { refinedPrompt: basePrompt, usedRefinement: false, skipReason: "refiner request failed" };
  }
}
