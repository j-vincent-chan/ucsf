import { z } from "zod";

export const blurbJsonSchema = z.object({
  headline: z.string(),
  blurb: z.string(),
  why_it_matters: z.string(),
  confidence_notes: z.string(),
});

export type BlurbContent = z.infer<typeof blurbJsonSchema>;

/** Fold legacy `why_it_matters` into `blurb` so the UI is one paragraph (no label). */
export function mergeWhyIntoBlurb(c: BlurbContent): BlurbContent {
  const b = c.blurb?.trim() ?? "";
  const w = c.why_it_matters?.trim() ?? "";
  if (!w) return { ...c, blurb: b, why_it_matters: "" };
  const merged = b ? `${b.trimEnd()} ${w}` : w;
  return { ...c, blurb: merged, why_it_matters: "" };
}

export function parseBlurbJson(text: string): BlurbContent | null {
  try {
    const data = JSON.parse(text) as unknown;
    const parsed = blurbJsonSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function stringifyBlurbContent(c: BlurbContent): string {
  return JSON.stringify(c, null, 2);
}
