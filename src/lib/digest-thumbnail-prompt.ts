/**
 * Thumbnail image prompt: fixed editorial template + research block (URL first).
 * GPT Image models accept up to ~32k chars; we cap below to keep requests bounded.
 */

const MAX_PROMPT_CHARS = 14_000;

/**
 * Editorial instructions for Signal thumbnails (ends with `RESEARCH CONTENT:`).
 */
export const DIGEST_THUMBNAIL_PROMPT_TEMPLATE = `Create a BioRender-inspired biomedical editorial thumbnail based on the research content below. First, infer the scientific essence in one concise sentence. Focus on the central finding, not the broad topic. Then choose the clearest thumbnail structure for the science:
- If the key finding is a contrast between two states (including immune attack vs therapy, disease vs treatment, before vs after), use a clean 2-panel side-by-side comparison: same perspective, shared lighting grammar, muted functional colors so roles read instantly—not two unrelated illustrations.
- If the key finding is a mechanism or immune interaction without a dual-state contrast, use a single central mechanism scene with thin dashed lines or subtle curved arrows for direction—not a crowded pathway map.
- If the research focuses on a tissue, tumor, organ, lesion, lymph node, or disease niche, use a compact microenvironment scene with one dominant anatomical or tissue focal when possible.
- If it describes a method, platform, assay, screen, sequencing approach, AI model, or data pipeline, use a compact input → platform → insight visual.
- If it describes clinical or translational research, use a compact patient/sample → lab/data → insight visual, or a single strong biological focal plus a small editorial label rail if that reads clearer.
- If it is broad, strategic, or conceptual, use a single symbolic editorial spot illustration.

TARGET LOOK: High-end journal-style BioRender figure thumbnail (2.5D—not a full multi-panel paper Figure 1). Soft volumetric shading: readable 3D hybrid with gentle gradients and subtle depth, not a flat poster or evenly weighted horizontal "banner" strips. Cells and vesicles as translucent matte spheres with soft internal gradients, packed in organic clusters ("grapes"), gentle contact shadows between forms, diffuse lighting (e.g. soft top-left)—no harsh black outlines, not hyper-glossy glass beads. When macro vs micro matters (organ/tissue vs cells, parasites, or vessel pathology), you MAY add exactly ONE magnified inset or magnifying-glass callout.

BACKGROUND (pick one): For cellular, immune, islet, tumor-microenvironment, or dense tissue-mechanism stories, use a very light warm pink or neutral flesh-toned field—high key—with subtle diffuse vascular or ECM wisps for context; keep it airy and readable, not dark or noisy. For devices, assays, data pipelines, or strongly conceptual thumbnails, use pure white or clinical white (#FFFFFF feel). In all cases avoid muddy low-contrast tan-on-beige poster floods and stock "diagram wallpaper."

LABELS: Maximum 2–4 short strings (2–5 words each). Use rounded pills or rounded rectangles with pastel fills keyed to the element (e.g. light red, light green, light blue), dark navy or charcoal sans-serif type; optional tiny flat icons—sparse sidebar or under-panel captions, not a dense legend.

ACCENTS: Restrained professional palette (muted greens, blues, purples, clinical reds as needed); encode roles with color consistently in multi-panel scenes.

IMPORTANT: News article thumbnail—immediate comprehension and memorability over mechanistic completeness; one rich focal or two balanced panels.

CANVAS: Horizontal widescreen (~16:9); full width—subject left/center, optional label margin—not portrait.

COMPOSITION: Default one strong focal; two main panels when contrast is essential. Clear hierarchy, limited clutter. Avoid step-by-step workflows unless the research demands them.

TEXT: No paragraphs, dense annotations, fake text, or illegible pseudo-writing.

SCIENTIFIC ACCURACY: Core biology accurate; key actors visually distinct (cell types, compartments, signals, agents, disease states).

AVOID: Photorealism, gore, crowded pathway maps, multi-step schematics, large legends, unnecessary DNA helices, generic lab benches, doctors or patients unless clinically necessary, decorative logos or watermarks, overcomplicated diagrams, dense icon grids, stock infographic clutter with many equal-weight elements.

RESEARCH CONTENT:`;

export type DigestThumbnailResearchParts = {
  title: string;
  sourceUrl: string | null;
  summaryAndExcerpts: string;
};

/**
 * Template + research: source URL on the line immediately after `RESEARCH CONTENT:`, then title and excerpts.
 */
export function buildDigestThumbnailImagePrompt(parts: DigestThumbnailResearchParts): string {
  const url = parts.sourceUrl?.trim();
  const urlLine =
    url && /^https?:\/\//i.test(url)
      ? url
      : url
        ? `Source: ${url}`
        : "(No source URL on file.)";

  const titleLine = `Title: ${parts.title.trim() || "(untitled)"}`;
  const body = parts.summaryAndExcerpts.replace(/\s+/g, " ").trim();

  const header = `${DIGEST_THUMBNAIL_PROMPT_TEMPLATE}\n\n${urlLine}\n\n${titleLine}`;
  if (!body) {
    return header.slice(0, MAX_PROMPT_CHARS);
  }

  const sep = "\n\nAbstract / summary / excerpts:\n";
  const budget = MAX_PROMPT_CHARS - header.length - sep.length;
  if (budget < 80) {
    return header.slice(0, MAX_PROMPT_CHARS);
  }

  const clippedBody =
    body.length <= budget ? body : `${body.slice(0, Math.max(0, budget - 1))}…`;
  return `${header}${sep}${clippedBody}`.slice(0, MAX_PROMPT_CHARS);
}
