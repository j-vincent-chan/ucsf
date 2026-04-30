/**
 * Optional second pass: a language model rewrites the digest thumbnail prompt so the
 * image model gets a single, tight brief—similar to how ChatGPT refines before image gen.
 */

const REFINER_SYSTEM = `You are an expert medical art director for newsletter thumbnails.

The user message is a COMPLETE prompt for an AI image model (BioRender-style editorial thumbnail rules + RESEARCH CONTENT with URL, title, and abstract text).

Your job: output ONE replacement prompt in plain English that the image model will follow—nothing else (no markdown fences, no "Here is", no analysis).

Requirements for the rewritten prompt:
1. Start with one sentence stating the scientific essence (central finding only).
2. Describe ONE clear visual concept as a polished BioRender-style editorial figure thumbnail (2.5D journal figure, not photoreal): soft volumetric shading, translucent matte spheres for cells/vesicles when relevant, organic clustered packing, gentle contact shadows, diffuse lighting, no harsh black outlines. Prefer one hero focal; if the core finding is two-state contrast (including immune vs therapy), use a clean two-panel side-by-side with matched perspective and lighting—not two unrelated scenes.
3. When the story has a macro–micro gap (organ/tissue vs cells, molecules, or pathology), you MAY use at most ONE magnified inset or magnifying-glass callout. Place 2–4 labels in rounded pills or rounded rectangles with pastel fills tied to element colors and dark navy or charcoal sans-serif text; optional simple flat icons along one margin—editorial sidebar or under-panel captions, not a dense legend. Avoid busy collages, extra callouts, and icon grids.
4. Name those 2–4 SHORT label strings explicitly (correct spelling), each 1–5 words, tied to specific elements; no paragraphs, no fake UI blocks, no lorem text.
5. Close by restating background choice: for cellular/immune/tissue-mechanism stories, very light warm pink or flesh-toned high-key field with subtle diffuse vascular or ECM context (still airy, not muddy); for devices/pipelines/conceptual scenes, pure clinical white. Always: soft gradients on subjects, muted professional accents, strong readable hierarchy—and horizontal widescreen (16:9 style), not square or portrait.
6. Preserve factual content from the research (disease, mechanism, agents, tissues). Do not invent study results not implied by the text.
7. Discourage flat-poster tropes: evenly spaced horizontal banner strips, uniform low-contrast tan-on-beige floods, stock diagram wallpaper, hyper-glossy glass spheres.

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
