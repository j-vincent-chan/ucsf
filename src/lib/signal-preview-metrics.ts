import { BLUESKY_CHAR_LIMIT, X_CHAR_LIMIT } from "@/lib/social-signals/workspace-types";

/** Grapheme count (matches Bluesky server validation style). */
export function countGraphemes(s: string): number {
  const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
  return Array.from(seg.segment(s), (p) => p.segment).length;
}

export function wordCountText(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function socialPostPlainText(headline: string, body: string): string {
  return `${headline.trim()}\n\n${body.trim()}`.trim();
}

export function xUnitCount(text: string): number {
  return [...text].length;
}

export type OutputPreviewStatus = "ready" | "needs_review" | "over_limit";

export function outputPreviewStatus(
  channel: "x" | "bluesky",
  plainText: string,
): OutputPreviewStatus {
  const t = plainText.trim();
  if (!t) return "needs_review";
  if (channel === "x") {
    if (xUnitCount(t) > X_CHAR_LIMIT) return "over_limit";
  } else {
    if (countGraphemes(t) > BLUESKY_CHAR_LIMIT) return "over_limit";
  }
  return "ready";
}
