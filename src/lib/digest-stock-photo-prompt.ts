/**
 * Hyperrealistic biomedical stock photo prompts for digest / social cards (Photos tab).
 * GPT Image models accept up to ~32k chars; cap keeps requests bounded.
 */

const MAX_PROMPT_CHARS = 14_000;

export const DIGEST_STOCK_PHOTO_PROMPT_TEMPLATE = `Create a hyperrealistic biomedical stock photo based on the research content below.

First, infer the scientific essence in one concise sentence. Then choose the most credible stock-photo scene for the research:

- If the research is about a therapy, vaccine, antibody, cell therapy, drug, or intervention, use a realistic therapeutic product or clinical research still life.
- If it is about a disease or clinical condition, use a realistic medical still life or clinical research environment that evokes the condition without showing patients.
- If it is about diagnostics, biomarkers, screening, or risk prediction, use a realistic diagnostic sample/assay scene.
- If it is about computational biology, AI, omics, single-cell, or spatial biology, use a realistic lab-computing scene with samples plus abstract data visualization.
- If it is about translational research, clinical samples, or precision medicine, use a realistic patient-sample-to-lab scene without identifiable patients.
- If it is about public health, implementation, epidemiology, or health systems, use realistic population-health objects such as de-identified charts, sample kits, tablets, maps, or clinic materials.
- If it is about basic biology or mechanism, use a realistic lab bench or microscopy scene with subtle abstract cellular imagery.

IMPORTANT:
This is a hyperrealistic stock photo, not a scientific schematic, not an infographic, and not a BioRender-style illustration. It should look like premium biomedical news photography.

STYLE:
Hyperrealistic professional stock photography, clean modern biomedical setting, polished clinical lighting, shallow depth of field, macro lens look when appropriate, crisp glass/plastic reflections, soft bokeh, realistic materials, high-resolution, premium editorial news aesthetic.

COMPOSITION:
Use one clear focal subject. Keep the scene uncluttered. Include strong negative space for headline placement. Background elements should be softly blurred and supportive, not explanatory.

TEXT:
Avoid readable text unless a single generic label is essential. No logos, no brand names, no fake company names, no watermarks, no illegible pseudo-text.

SCIENTIFIC ACCURACY:
Use realistic research objects and clinical materials relevant to the topic. Avoid misleading or overly literal visuals. Suggest mechanisms only through subtle screen imagery, microscope imagery, or contextual objects.

AVOID:
Avoid cartoons, BioRender-style icons, diagrams, arrows, labels, pathway maps, dense screens, sci-fi visuals, dramatic patient scenes, identifiable patients, doctors posing, blood/gore, cluttered benches, sensational lighting, logos, branded products, and fake institutional marks.

Research content:`;

export type DigestStockPhotoResearchParts = {
  title: string;
  sourceUrl: string | null;
  summaryAndExcerpts: string;
};

/** Template + research: source URL and title immediately after \`Research content:\`, then summary excerpts. */
export function buildDigestStockPhotoImagePrompt(parts: DigestStockPhotoResearchParts): string {
  const url = parts.sourceUrl?.trim();
  const urlLine =
    url && /^https?:\/\//i.test(url)
      ? url
      : url
        ? `Source link: ${url}`
        : "(No source URL on file.)";

  const titleLine = `Title: ${parts.title.trim() || "(untitled)"}`;
  const body = parts.summaryAndExcerpts.replace(/\s+/g, " ").trim();

  const header = `${DIGEST_STOCK_PHOTO_PROMPT_TEMPLATE}\n\n${urlLine}\n\n${titleLine}`;
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
