import type { Summary, SummaryStyle } from "@/types/database";
import { summaryStyleLabel } from "@/lib/summary-style-label";

/** Monthly digest Content studio: exactly these three outputs. */
export type DigestContentStudioOutputOption = { style: SummaryStyle; label: string };

export const DIGEST_CONTENT_STUDIO_OUTPUT_OPTIONS: DigestContentStudioOutputOption[] = [
  { style: "bluesky_x", label: "Social" },
  { style: "newsletter", label: "Newsletter" },
  { style: "linkedin", label: "LinkedIn" },
];

export const DIGEST_CONTENT_STUDIO_STYLES: SummaryStyle[] =
  DIGEST_CONTENT_STUDIO_OUTPUT_OPTIONS.map((o) => o.style);

export function digestContentStudioOutputLabel(style: SummaryStyle): string {
  return (
    DIGEST_CONTENT_STUDIO_OUTPUT_OPTIONS.find((o) => o.style === style)?.label ?? summaryStyleLabel(style)
  );
}

/** Preferred order for digest output selector (legacy `bluesky_x` last). */
export const DIGEST_OUTPUT_STYLE_ORDER: SummaryStyle[] = [
  "newsletter",
  "linkedin",
  "internal_digest",
  "web_blurb",
  "x",
  "bluesky",
  "bluesky_x",
];

export function isDigestSocialOutputStyle(style: SummaryStyle | undefined): boolean {
  return style === "bluesky_x" || style === "x" || style === "bluesky";
}

/** True when the row has any saved generated or edited body (tab becomes selectable in Content studio). */
export function digestSummaryHasGeneratedText(s: Summary): boolean {
  return Boolean((s.edited_text ?? s.generated_text ?? "").trim());
}

export function sortSummariesForDigestOutputs(list: Summary[]): Summary[] {
  const idx = (style: SummaryStyle) => {
    const studio = DIGEST_CONTENT_STUDIO_OUTPUT_OPTIONS.findIndex((o) => o.style === style);
    if (studio >= 0) return studio;
    const legacy = DIGEST_OUTPUT_STYLE_ORDER.indexOf(style);
    return 100 + (legacy === -1 ? 999 : legacy);
  };
  return [...list].sort((a, b) => {
    const d = idx(a.style) - idx(b.style);
    if (d !== 0) return d;
    return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
  });
}

export function pickDefaultDigestOutputId(summaries: Summary[]): string | null {
  const sorted = sortSummariesForDigestOutputs(summaries);
  return sorted[0]?.id ?? null;
}
