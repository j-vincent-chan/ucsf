import { exportCropDrawRect } from "@/lib/digest-image-editor-utils";
import type {
  DigestIllustrationTextLayer,
  DigestVisualCandidate,
} from "@/lib/digest-visual-types";

function layerUsesFreePosition(L: DigestIllustrationTextLayer): boolean {
  return (
    typeof L.xNorm === "number" &&
    typeof L.yNorm === "number" &&
    Number.isFinite(L.xNorm) &&
    Number.isFinite(L.yNorm)
  );
}

export type DigestHeroOverlayLayout = {
  naturalSize: { w: number; h: number } | null;
  cropNatural: { x: number; y: number; w: number; h: number } | null;
  layoutBoxPx: { x: number; y: number; w: number; h: number } | null;
  layoutCoordinateSpace: { w: number; h: number } | null;
};

/**
 * Maps schematic label overlays onto the **saved** digest hero bitmap.
 * Edited exports letterbox the crop inside `resizePixels`; without `layoutBoxPx` DOM overlays span the JPEG letterbox
 * and anchors/free-drag math misaligns vs the Output preview editor.
 */
export function digestHeroIllustrationOverlayLayout(
  bitmapW: number,
  bitmapH: number,
  candidate: DigestVisualCandidate | null,
  layers: DigestIllustrationTextLayer[],
): DigestHeroOverlayLayout {
  if (bitmapW <= 0 || bitmapH <= 0) {
    return { naturalSize: null, cropNatural: null, layoutBoxPx: null, layoutCoordinateSpace: null };
  }

  const visible = layers.filter((L) => L.text.trim());
  const hasFree = visible.some(layerUsesFreePosition);
  const em = candidate?.editMetadata;

  if (!em?.cropPixels?.w || !em.resizePixels) {
    return {
      naturalSize: { w: bitmapW, h: bitmapH },
      cropNatural: { x: 0, y: 0, w: bitmapW, h: bitmapH },
      layoutBoxPx: null,
      layoutCoordinateSpace: null,
    };
  }

  const inner = exportCropDrawRect(em.cropPixels.w, em.cropPixels.h, bitmapW, bitmapH);
  const fillsBitmap =
    inner.x <= 1 &&
    inner.y <= 1 &&
    Math.abs(inner.w - bitmapW) < 2 &&
    Math.abs(inner.h - bitmapH) < 2;
  const layoutBoxPx = fillsBitmap ? null : { x: inner.x, y: inner.y, w: inner.w, h: inner.h };
  const layoutCoordinateSpace = layoutBoxPx ? { w: bitmapW, h: bitmapH } : null;

  const srcNat = em.sourceNaturalPixels;
  if (srcNat && srcNat.w > 0 && srcNat.h > 0) {
    return {
      naturalSize: { w: srcNat.w, h: srcNat.h },
      cropNatural: { ...em.cropPixels },
      layoutBoxPx,
      layoutCoordinateSpace,
    };
  }

  if (!hasFree && layoutBoxPx) {
    return {
      naturalSize: { w: bitmapW, h: bitmapH },
      cropNatural: { x: 0, y: 0, w: bitmapW, h: bitmapH },
      layoutBoxPx,
      layoutCoordinateSpace,
    };
  }

  return {
    naturalSize: { w: bitmapW, h: bitmapH },
    cropNatural: { x: 0, y: 0, w: bitmapW, h: bitmapH },
    layoutBoxPx: null,
    layoutCoordinateSpace: null,
  };
}
