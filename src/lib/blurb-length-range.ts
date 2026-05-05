/**
 * Slider bounds for target blurb word count by channel (`genStyle` / summary.style).
 * Aligns loosely with channel prompts in generate-blurb (newsletter, LinkedIn, social, etc.).
 */
export function blurbWordRangeForStyle(style: string): { min: number; max: number; default: number } {
  switch (style) {
    case "newsletter":
      return { min: 85, max: 220, default: 145 };
    case "linkedin":
      return { min: 45, max: 150, default: 95 };
    case "bluesky_x":
      return { min: 15, max: 95, default: 48 };
    case "concise":
      return { min: 35, max: 75, default: 55 };
    case "social":
      return { min: 15, max: 85, default: 45 };
    case "donor":
      return { min: 75, max: 165, default: 118 };
    default:
      return { min: 60, max: 200, default: 125 };
  }
}
