/**
 * Thumbnail image prompt: fixed editorial template + research block (URL first).
 * GPT Image models accept up to ~32k chars; we cap below to keep requests bounded.
 */

const MAX_PROMPT_CHARS = 14_000;

/**
 * Editorial instructions for Signal thumbnails (ends with `RESEARCH CONTENT:`).
 */
export const DIGEST_THUMBNAIL_PROMPT_TEMPLATE = `Create a BioRender-inspired biomedical editorial thumbnail based on the research content below. First, infer the scientific essence in one concise sentence. Focus on the central finding, not the broad topic. Then choose the clearest thumbnail structure for the science: - If the key finding is a contrast between two states, use a clean 2-panel side-by-side comparison. - If the key finding is a mechanism or immune interaction, use a single central mechanism scene with one directional cue. - If the research focuses on a tissue, tumor, organ, lesion, lymph node, or disease niche, use a compact microenvironment scene. - If it describes a method, platform, assay, screen, sequencing approach, AI model, or data pipeline, use a compact input → platform → insight visual. - If it describes clinical or translational research, use a compact patient/sample → lab/data → insight visual. - If it is broad, strategic, or conceptual, use a single symbolic editorial spot illustration. IMPORTANT: This is for a news article thumbnail, not a detailed Figure 1 schematic. Prioritize immediate comprehension and visual memorability over mechanistic completeness. STYLE: Use a clean BioRender-inspired biomedical editorial style: polished scientific icons, soft 2D/3D hybrid forms, rounded shapes, crisp edges, subtle gradients, muted professional colors, white or very light background, and strong negative space. COMPOSITION: Use 1 panel by default, or 2 panels only if contrast is essential. Use clear visual hierarchy, limited clutter, and only the most important scientific elements. Avoid step-by-step workflows unless explicitly requested. TEXT: Use minimal text. Maximum 2–4 short labels total, 2–5 words each. No paragraphs, no dense annotations, no legends, no fake text, no illegible pseudo-writing. SCIENTIFIC ACCURACY: Represent the core biology accurately and avoid generic filler. Make the key actors visually distinct, such as cell types, tissue compartments, molecular signals, samples, data, therapeutic agents, or disease states. AVOID: Avoid photorealism, excessive detail, gore, crowded pathway maps, multi-step schematics, large legends, unnecessary DNA helices, generic lab benches, doctors, patients unless clinically necessary, decorative icons, logos, watermarks, and overcomplicated diagrams. RESEARCH CONTENT:`;

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
