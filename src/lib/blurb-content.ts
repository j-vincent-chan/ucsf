import { z } from "zod";

export const blurbJsonSchema = z.object({
  headline: z.string(),
  blurb: z.string(),
  why_it_matters: z.string(),
  confidence_notes: z.string(),
});

export type BlurbContent = z.infer<typeof blurbJsonSchema>;

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
