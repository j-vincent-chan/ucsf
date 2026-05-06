import type { SummaryStyle } from "@/types/database";

/** Human-readable channel labels (keep aligned with draft UI / monthly-digest options). */
const SUMMARY_STYLE_LABEL: Record<SummaryStyle, string> = {
  newsletter: "Newsletter",
  donor: "Donor",
  social: "Social",
  concise: "Concise",
  linkedin: "LinkedIn",
  bluesky_x: "Social",
  instagram: "Instagram",
  x: "X",
  bluesky: "Bluesky",
  web_blurb: "Web blurb",
  internal_digest: "Internal digest",
};

export function summaryStyleLabel(style: SummaryStyle): string {
  return SUMMARY_STYLE_LABEL[style] ?? style;
}
