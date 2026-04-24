import type { DigestImageAspectPreset } from "@/lib/digest-visual-types";

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export type Adjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  sharpness: number;
};

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  sharpness: 0,
};

export const FILTER_IDS = ["none", "soft", "warm", "cool", "high_contrast", "muted", "grayscale"] as const;
export type FilterId = (typeof FILTER_IDS)[number];

export function filterPresetCss(id: FilterId): string {
  switch (id) {
    case "none":
      return "";
    case "soft":
      return "brightness(1.02) contrast(0.96) saturate(0.93)";
    case "warm":
      return "sepia(0.07) saturate(1.05) brightness(1.01)";
    case "cool":
      return "hue-rotate(-6deg) saturate(0.94) brightness(1.02)";
    case "high_contrast":
      return "contrast(1.12) saturate(1.04)";
    case "muted":
      return "saturate(0.72) contrast(0.94) brightness(1.02)";
    case "grayscale":
      return "grayscale(1)";
    default:
      return "";
  }
}

/** Canvas 2D filter string: editorial adjustments + optional preset. */
export function buildCanvasFilter(adj: Adjustments, filterId: FilterId): string {
  const b = clamp(1 + adj.brightness / 120, 0.75, 1.28);
  const c = clamp(1 + adj.contrast / 100, 0.75, 1.35);
  const s = clamp(1 + adj.saturation / 100, 0.55, 1.45);
  const parts: string[] = [`brightness(${b})`, `contrast(${c})`, `saturate(${s})`];
  if (adj.warmth > 0.5) {
    parts.push(`sepia(${clamp(adj.warmth / 220, 0, 0.18)})`);
  } else if (adj.warmth < -0.5) {
    parts.push(`hue-rotate(${clamp(adj.warmth / 5, -18, 0)}deg)`);
  }
  const sharpBoost = 1 + adj.sharpness / 280;
  if (Math.abs(sharpBoost - 1) > 0.004) {
    parts.push(`contrast(${clamp(sharpBoost, 0.92, 1.12)})`);
  }
  const preset = filterPresetCss(filterId);
  if (preset) parts.push(preset);
  return parts.join(" ");
}

/** Inscribing crop with given aspect ratio (w/h), centered. */
export function centerAspectCrop(
  nw: number,
  nh: number,
  aspectW: number,
  aspectH: number,
): { x: number; y: number; w: number; h: number } {
  const target = aspectW / aspectH;
  const img = nw / nh;
  let w: number;
  let h: number;
  if (img > target) {
    h = nh;
    w = Math.round(h * target);
  } else {
    w = nw;
    h = Math.round(w / target);
  }
  const x = Math.round((nw - w) / 2);
  const y = Math.round((nh - h) / 2);
  return { x, y, w, h };
}

export function cropForAspectPreset(
  nw: number,
  nh: number,
  preset: DigestImageAspectPreset,
): { x: number; y: number; w: number; h: number } {
  if (preset === "original" || preset === "freeform") {
    return { x: 0, y: 0, w: nw, h: nh };
  }
  if (preset === "16:9") return centerAspectCrop(nw, nh, 16, 9);
  if (preset === "1:1") return centerAspectCrop(nw, nh, 1, 1);
  if (preset === "4:5") return centerAspectCrop(nw, nh, 4, 5);
  return { x: 0, y: 0, w: nw, h: nh };
}

export function clampCropToImage(rect: { x: number; y: number; w: number; h: number }, nw: number, nh: number) {
  const w = clamp(rect.w, 1, nw);
  const h = clamp(rect.h, 1, nh);
  const x = clamp(rect.x, 0, Math.max(0, nw - w));
  const y = clamp(rect.y, 0, Math.max(0, nh - h));
  return { x, y, w, h };
}

export const RESIZE_PRESET_LABELS = {
  digest_card: "Digest card (16:9)",
  newsletter_hero: "Newsletter hero",
  thumbnail: "Thumbnail",
  original: "Original (crop size)",
} as const;

export type ResizePresetKey = keyof typeof RESIZE_PRESET_LABELS;

export function resizePresetDimensions(key: ResizePresetKey, cropW: number, cropH: number): { w: number; h: number } {
  switch (key) {
    case "digest_card":
      return { w: 1280, h: 720 };
    case "newsletter_hero":
      return { w: 1200, h: 630 };
    case "thumbnail":
      return { w: 480, h: 360 };
    case "original":
    default:
      return { w: Math.max(1, Math.round(cropW)), h: Math.max(1, Math.round(cropH)) };
  }
}

const MAX_EXPORT_EDGE = 2560;

export function capExportDimensions(w: number, h: number): { w: number; h: number } {
  const m = Math.max(w, h);
  if (m <= MAX_EXPORT_EDGE) return { w, h };
  const s = MAX_EXPORT_EDGE / m;
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

export function renderPipelineToDataUrl(
  img: HTMLImageElement,
  crop: { x: number; y: number; w: number; h: number },
  outW: number,
  outH: number,
  adj: Adjustments,
  filterId: FilterId,
  quality = 0.9,
): { dataUrl: string; mime: string } {
  const { w: tw, h: th } = capExportDimensions(outW, outH);
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");
  ctx.fillStyle = "#faf6ef";
  ctx.fillRect(0, 0, tw, th);
  const cropAspect = crop.w / Math.max(1e-6, crop.h);
  const outAspect = tw / Math.max(1e-6, th);
  let dx = 0;
  let dy = 0;
  let dw = tw;
  let dh = th;
  if (cropAspect > outAspect) {
    dh = tw / cropAspect;
    dy = (th - dh) / 2;
  } else {
    dw = th * cropAspect;
    dx = (tw - dw) / 2;
  }
  ctx.filter = buildCanvasFilter(adj, filterId);
  try {
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, dx, dy, dw, dh);
  } catch {
    throw new Error("Could not draw image (try a different source or proxy)");
  }
  ctx.filter = "none";
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  } catch {
    dataUrl = canvas.toDataURL("image/png");
    return { dataUrl, mime: "image/png" };
  }
  return { dataUrl, mime: "image/jpeg" };
}

export function dataUrlToBase64(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  if (i === -1) throw new Error("Invalid data URL");
  return dataUrl.slice(i + 1);
}
