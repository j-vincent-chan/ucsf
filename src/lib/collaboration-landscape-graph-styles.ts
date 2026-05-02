/** Visual presets for the Collaboration Landscape force graph (2D + 3D). */

export type GraphStylePreset = "research_landscape" | "scientific_atlas" | "constellation";

export const GRAPH_STYLE_OPTIONS: { id: GraphStylePreset; label: string; hint: string }[] = [
  {
    id: "research_landscape",
    label: "Research Landscape",
    hint: "Default — analytical clarity, Dimensions-inspired",
  },
  {
    id: "scientific_atlas",
    label: "Scientific Atlas",
    hint: "Presentation — warm paper, jewel tones, editorial",
  },
  {
    id: "constellation",
    label: "Constellation",
    hint: "Explore — dark canvas, hubs & focus labels only",
  },
];

/** Muted professional hues (cluster color-by). */
export const CLUSTER_PALETTE_RESEARCH = [
  "hsl(218 42% 52%)",
  "hsl(168 38% 42%)",
  "hsl(32 48% 46%)",
  "hsl(285 38% 48%)",
  "hsl(15 52% 50%)",
  "hsl(138 36% 40%)",
  "hsl(48 56% 44%)",
  "hsl(265 42% 52%)",
  "hsl(202 44% 46%)",
  "hsl(345 42% 48%)",
  "hsl(88 36% 42%)",
  "hsl(225 44% 48%)",
];

/** Elegant muted jewel tones (cluster color-by). */
export const CLUSTER_PALETTE_ATLAS = [
  "hsl(352 36% 46%)",
  "hsl(215 40% 46%)",
  "hsl(165 34% 40%)",
  "hsl(285 32% 48%)",
  "hsl(28 44% 48%)",
  "hsl(200 38% 42%)",
  "hsl(48 42% 46%)",
  "hsl(325 34% 46%)",
  "hsl(178 36% 38%)",
  "hsl(262 36% 50%)",
  "hsl(22 46% 48%)",
  "hsl(138 32% 40%)",
];

/** Saturated but legible on dark backgrounds (cluster color-by). */
export const CLUSTER_PALETTE_CONSTELLATION = [
  "hsl(210 62% 62%)",
  "hsl(175 52% 54%)",
  "hsl(32 58% 58%)",
  "hsl(285 48% 62%)",
  "hsl(12 58% 58%)",
  "hsl(138 48% 52%)",
  "hsl(48 56% 56%)",
  "hsl(268 52% 62%)",
  "hsl(198 55% 58%)",
  "hsl(350 52% 58%)",
  "hsl(82 44% 54%)",
  "hsl(205 58% 58%)",
];

export function clusterPaletteForPreset(preset: GraphStylePreset): string[] {
  switch (preset) {
    case "scientific_atlas":
      return CLUSTER_PALETTE_ATLAS;
    case "constellation":
      return CLUSTER_PALETTE_CONSTELLATION;
    default:
      return CLUSTER_PALETTE_RESEARCH;
  }
}

export function graphCanvasBackgroundClass(preset: GraphStylePreset): string {
  switch (preset) {
    case "scientific_atlas":
      return "bg-[linear-gradient(165deg,#faf6ee_0%,#f2ebe3_48%,#e8dfd2_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_24px_48px_-32px_rgba(62,48,32,0.25)]";
    case "constellation":
      return "bg-[linear-gradient(165deg,#0b1729_0%,#0e2142_52%,#081424_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_28px_56px_-28px_rgba(0,0,0,0.55)] border-white/15";
    default:
      return "bg-[linear-gradient(165deg,#f6f5f1_0%,#ebe9e3_45%,#e2e0da_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_22px_48px_-34px_rgba(38,36,52,0.28)]";
  }
}

export function graphFloatingChromeClass(preset: GraphStylePreset): string {
  if (preset === "constellation") {
    return "border-white/20 bg-slate-950/92 text-slate-200 shadow-[0_16px_36px_-24px_rgba(0,0,0,0.65)] backdrop-blur-sm";
  }
  return "border-[color:var(--border)]/45 bg-white/95 shadow-[0_16px_36px_-28px_rgba(38,32,58,0.45)] backdrop-blur-sm";
}

export function graphHintChipClass(preset: GraphStylePreset): string {
  if (preset === "constellation") {
    return "bg-slate-900/88 text-slate-200 ring-1 ring-white/12 shadow-[0_6px_20px_-12px_rgba(0,0,0,0.5)]";
  }
  return "bg-white/95 text-[color:var(--muted-foreground)] ring-1 ring-black/[0.06] shadow-[0_6px_20px_-12px_rgba(38,32,58,0.45)]";
}
