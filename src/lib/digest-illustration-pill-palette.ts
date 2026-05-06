/** Pastel fills + soft strokes for digest schematic label “bubbles” (shared by overlays + editor swatches). */
export const ILLUSTRATION_LABEL_PILL_SURFACE = [
  "border-[rgba(188,155,128,0.35)] bg-[rgba(236,218,198,0.82)]",
  "border-[rgba(165,145,195,0.38)] bg-[rgba(226,214,240,0.82)]",
  "border-[rgba(155,150,138,0.38)] bg-[rgba(222,216,206,0.82)]",
  "border-[rgba(205,165,165,0.36)] bg-[rgba(248,222,220,0.82)]",
  "border-[rgba(145,175,160,0.38)] bg-[rgba(214,232,222,0.82)]",
] as const;

export const ILLUSTRATION_LABEL_PILL_SURFACE_COUNT = ILLUSTRATION_LABEL_PILL_SURFACE.length;

/** Deterministic palette slot when `pillSurfaceIndex` is omitted (must match historical overlay behavior). */
export function hashPillSurfaceIndex(layerId: string, stackIndex: number): number {
  let h = 0;
  const s = `${layerId}:${stackIndex}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % ILLUSTRATION_LABEL_PILL_SURFACE_COUNT;
}

export function clampPillSurfaceIndex(n: number): number {
  return Math.max(0, Math.min(ILLUSTRATION_LABEL_PILL_SURFACE_COUNT - 1, Math.round(n)));
}
