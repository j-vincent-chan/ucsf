/** Global slider bounds: blurb body target length (characters; headline separate). */
export const BLURB_CHAR_BOUNDS = { min: 100, max: 2000 } as const;

/** Slider moves in this increment so values like 220 / 500 / 1200 land on the grid. */
export const BLURB_CHAR_SLIDER_STEP = 10;

/** Snap a character target to the slider grid (from min, fixed step). */
export function snapBlurbCharsToSliderStep(value: number): number {
  const { min, max } = BLURB_CHAR_BOUNDS;
  const step = BLURB_CHAR_SLIDER_STEP;
  const k = Math.round((value - min) / step);
  const snapped = min + k * step;
  return Math.min(max, Math.max(min, snapped));
}

/**
 * Defaults by channel (`genStyle` / summary.style); min/max are always the global bounds.
 * Defaults are snapped to {@link BLURB_CHAR_SLIDER_STEP}.
 */
export function blurbCharRangeForStyle(style: string): {
  min: number;
  max: number;
  default: number;
} {
  const { min, max } = BLURB_CHAR_BOUNDS;
  const rawDefault = (() => {
    switch (style) {
      case "newsletter":
        return 500;
      case "linkedin":
        return 1200;
      case "bluesky_x":
        return 220;
      case "x":
        return 220;
      case "bluesky":
        return 220;
      case "web_blurb":
        return 380;
      case "internal_digest":
        return 950;
      case "concise":
        return 400;
      case "social":
        return 220;
      case "donor":
        return 950;
      default:
        return 800;
    }
  })();
  const clamped = Math.min(max, Math.max(min, rawDefault));
  return { min, max, default: snapBlurbCharsToSliderStep(clamped) };
}
