"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useRef } from "react";
import type { DigestIllustrationTextLayer, IllustrationLabelAnchor } from "@/lib/digest-visual-types";
import { ILLUSTRATION_LABEL_ANCHORS } from "@/lib/digest-visual-types";
import {
  ILLUSTRATION_LABEL_PILL_SURFACE,
  clampPillSurfaceIndex,
  hashPillSurfaceIndex,
} from "@/lib/digest-illustration-pill-palette";

const ANCHOR_STACK_GAP = "gap-1.5";

const ANCHOR_CLUSTER_CLASS: Record<IllustrationLabelAnchor, string> = {
  top: `left-1/2 top-[4%] flex -translate-x-1/2 flex-col items-center ${ANCHOR_STACK_GAP}`,
  "top-left": `left-[3%] top-[6%] flex flex-col items-start ${ANCHOR_STACK_GAP}`,
  "top-right": `right-[3%] top-[6%] flex flex-col items-end ${ANCHOR_STACK_GAP}`,
  bottom: `bottom-[5%] left-1/2 flex -translate-x-1/2 flex-col items-center ${ANCHOR_STACK_GAP}`,
  "bottom-left": `bottom-[6%] left-[3%] flex flex-col items-start ${ANCHOR_STACK_GAP}`,
  "bottom-right": `bottom-[6%] right-[3%] flex flex-col items-end ${ANCHOR_STACK_GAP}`,
  center: `left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center ${ANCHOR_STACK_GAP} text-center`,
};

function effectivePillSurfaceIndex(layer: DigestIllustrationTextLayer, stackIndex: number): number {
  const raw = layer.pillSurfaceIndex;
  if (typeof raw === "number" && Number.isFinite(raw)) return clampPillSurfaceIndex(raw);
  return hashPillSurfaceIndex(layer.id, stackIndex);
}

/** Typography + chrome (padding applied via class or per-layer inline when `pillPaddingPx` is set). */
const PILL_PAD_AUTO = "px-2 py-1.5";
/** Size follows label text; long lines wrap at `max-w` (wrapper may further cap vs image width). */
const PILL_CORE =
  "inline-flex h-auto w-max min-w-0 max-w-full shrink-0 flex-col justify-start rounded-xl border text-left leading-snug tracking-tight text-[#423933] shadow-[0_2px_10px_rgba(55,42,36,0.11),0_1px_3px_rgba(55,42,36,0.06)] backdrop-blur-[1.5px] whitespace-pre-line break-words text-[13px]";

function pillEmphasisClasses(layer: DigestIllustrationTextLayer): string {
  return [layer.fontBold ? "font-bold" : "font-medium", layer.fontItalic ? "italic" : "", layer.fontUnderline ? "underline" : ""]
    .filter(Boolean)
    .join(" ");
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function layerUsesFreePosition(L: DigestIllustrationTextLayer): boolean {
  return (
    typeof L.xNorm === "number" &&
    typeof L.yNorm === "number" &&
    Number.isFinite(L.xNorm) &&
    Number.isFinite(L.yNorm)
  );
}

function naturalNormFromCropFraction(
  fx: number,
  fy: number,
  crop: { x: number; y: number; w: number; h: number },
  nw: number,
  nh: number,
): { xNorm: number; yNorm: number } {
  const px = crop.x + clamp01(fx) * crop.w;
  const py = crop.y + clamp01(fy) * crop.h;
  return { xNorm: clamp01(px / nw), yNorm: clamp01(py / nh) };
}

function cropFractionFromNaturalNorm(
  xNorm: number,
  yNorm: number,
  crop: { x: number; y: number; w: number; h: number },
  nw: number,
  nh: number,
): { rx: number; ry: number } {
  const px = xNorm * nw;
  const py = yNorm * nh;
  return {
    rx: clamp01((px - crop.x) / crop.w),
    ry: clamp01((py - crop.y) / crop.h),
  };
}

function groupLayersByAnchor(layers: DigestIllustrationTextLayer[]): Map<IllustrationLabelAnchor, DigestIllustrationTextLayer[]> {
  const m = new Map<IllustrationLabelAnchor, DigestIllustrationTextLayer[]>();
  for (const L of layers) {
    if (!L.text.trim()) continue;
    const key = (L.anchor ?? "center") as IllustrationLabelAnchor;
    const list = m.get(key) ?? [];
    list.push(L);
    m.set(key, list);
  }
  return m;
}

function hasCustomPillPadding(layer: DigestIllustrationTextLayer): boolean {
  const p = layer.pillPaddingPx;
  return p != null && Number.isFinite(p);
}

/** Inline font size + uniform pill padding (overrides responsive padding class when padding is set). */
function pillCombinedStyle(layer: DigestIllustrationTextLayer): CSSProperties {
  const out: CSSProperties = {};
  const fs = layer.fontSizePx;
  if (fs != null && Number.isFinite(fs)) {
    out.fontSize = `${Math.min(48, Math.max(8, Math.round(fs)))}px`;
  }
  const pad = layer.pillPaddingPx;
  if (pad != null && Number.isFinite(pad)) {
    const px = Math.min(48, Math.max(0, Math.round(pad)));
    out.padding = `${px}px`;
  }
  return out;
}

function pillPadClass(layer: DigestIllustrationTextLayer): string {
  return hasCustomPillPadding(layer) ? "" : PILL_PAD_AUTO;
}

type OverlayLayoutBoxPx = { x: number; y: number; w: number; h: number };
type OverlayCoordinateSpace = { w: number; h: number };
type NaturalSize = { w: number; h: number };
type CropNatural = { x: number; y: number; w: number; h: number };

function overlayBoxStyle(
  layoutBoxPx: OverlayLayoutBoxPx | null | undefined,
  coordinateSpace: OverlayCoordinateSpace | null | undefined,
): CSSProperties | undefined {
  if (!layoutBoxPx || layoutBoxPx.w <= 0 || layoutBoxPx.h <= 0) return undefined;
  if (coordinateSpace && coordinateSpace.w > 0 && coordinateSpace.h > 0) {
    return {
      left: `${(layoutBoxPx.x / coordinateSpace.w) * 100}%`,
      top: `${(layoutBoxPx.y / coordinateSpace.h) * 100}%`,
      width: `${(layoutBoxPx.w / coordinateSpace.w) * 100}%`,
      height: `${(layoutBoxPx.h / coordinateSpace.h) * 100}%`,
    };
  }
  return {
    left: layoutBoxPx.x,
    top: layoutBoxPx.y,
    width: layoutBoxPx.w,
    height: layoutBoxPx.h,
  };
}

type PillDragBind = {
  onPointerDown: (e: ReactPointerEvent<HTMLSpanElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLSpanElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLSpanElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLSpanElement>) => void;
};

/** Renders structured labels as DOM overlays (not part of the raster). */
export function DigestIllustrationOverlays({
  layers,
  layoutBoxPx,
  layoutCoordinateSpace,
  naturalSize,
  cropNatural,
  dragEnabled,
  onLayerPositionNormChange,
}: {
  layers: DigestIllustrationTextLayer[];
  /**
   * When set, anchors are percentages of this rectangle (canvas pixels relative to the same parent).
   * Use in the digest editor so labels sit inside the dashed crop preview; omit for full-frame cards.
   */
  layoutBoxPx?: OverlayLayoutBoxPx | null;
  /**
   * Bitmap/canvas size that `layoutBoxPx` is measured in. When the canvas is CSS-scaled, pass this
   * so the overlay box uses % and stays aligned with the image; parent should wrap the canvas tightly (e.g. w-fit).
   */
  layoutCoordinateSpace?: OverlayCoordinateSpace | null;
  /** Natural pixel size of the raster (required for custom `xNorm`/`yNorm` placement). */
  naturalSize?: NaturalSize | null;
  /** Crop rectangle in natural pixels (full image = `{ x:0, y:0, w:nw, h:nh }`). */
  cropNatural?: CropNatural | null;
  /** When true, pills call `onLayerPositionNormChange` while dragging (pointer capture). */
  dragEnabled?: boolean;
  onLayerPositionNormChange?: (id: string, xNorm: number, yNorm: number) => void;
}) {
  const dimsOk = Boolean(
    naturalSize &&
      naturalSize.w > 0 &&
      naturalSize.h > 0 &&
      cropNatural &&
      cropNatural.w > 0 &&
      cropNatural.h > 0,
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const dragLayerIdRef = useRef<string | null>(null);
  const onPositionCbRef = useRef(onLayerPositionNormChange);
  onPositionCbRef.current = onLayerPositionNormChange;

  const clientToNorm = useCallback(
    (clientX: number, clientY: number) => {
      const el = rootRef.current;
      if (!el || !naturalSize || !cropNatural) return null;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return null;
      const fx = (clientX - r.left) / r.width;
      const fy = (clientY - r.top) / r.height;
      return naturalNormFromCropFraction(fx, fy, cropNatural, naturalSize.w, naturalSize.h);
    },
    [naturalSize, cropNatural],
  );

  const bindPillDrag = useCallback(
    (layerId: string): PillDragBind | undefined => {
      if (!dragEnabled || !onLayerPositionNormChange) return undefined;
      return {
        onPointerDown: (e: ReactPointerEvent<HTMLSpanElement>) => {
          e.stopPropagation();
          e.preventDefault();
          dragLayerIdRef.current = layerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          const n = clientToNorm(e.clientX, e.clientY);
          if (n) onPositionCbRef.current?.(layerId, n.xNorm, n.yNorm);
        },
        onPointerMove: (e: ReactPointerEvent<HTMLSpanElement>) => {
          if (dragLayerIdRef.current !== layerId) return;
          e.stopPropagation();
          const n = clientToNorm(e.clientX, e.clientY);
          if (n) onPositionCbRef.current?.(layerId, n.xNorm, n.yNorm);
        },
        onPointerUp: (e: ReactPointerEvent<HTMLSpanElement>) => {
          if (dragLayerIdRef.current === layerId) dragLayerIdRef.current = null;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        },
        onPointerCancel: (e: ReactPointerEvent<HTMLSpanElement>) => {
          if (dragLayerIdRef.current === layerId) dragLayerIdRef.current = null;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        },
      };
    },
    [clientToNorm, dragEnabled, onLayerPositionNormChange],
  );

  if (!layers.some((L) => L.text.trim())) return null;

  const visible = layers.filter((L) => L.text.trim());
  const freeLayers = visible.filter((L) => layerUsesFreePosition(L) && dimsOk);
  const anchorLayers = visible.filter((L) => !(layerUsesFreePosition(L) && dimsOk));
  const byAnchor = groupLayersByAnchor(anchorLayers);

  const boxStyle = overlayBoxStyle(layoutBoxPx, layoutCoordinateSpace);
  const interactive = Boolean(dragEnabled && onLayerPositionNormChange);

  const pillClass = (layer: DigestIllustrationTextLayer, extra?: string) =>
    `${PILL_CORE} ${pillEmphasisClasses(layer)} ${pillPadClass(layer)}${interactive ? " pointer-events-auto cursor-grab touch-none active:cursor-grabbing" : ""}${extra ? ` ${extra}` : ""}`;

  return (
    <div
      ref={rootRef}
      className={`pointer-events-none absolute z-[2] select-none ${boxStyle ? "" : "inset-0"}`}
      style={boxStyle}
      aria-label="Illustration labels"
    >
      {freeLayers.map((layer) => {
        if (!naturalSize || !cropNatural) return null;
        const { rx, ry } = cropFractionFromNaturalNorm(layer.xNorm!, layer.yNorm!, cropNatural, naturalSize.w, naturalSize.h);
        const drag = bindPillDrag(layer.id);
        return (
          <div
            key={layer.id}
            className="absolute max-w-[min(22rem,calc(100%-8px))]"
            style={{
              left: `${rx * 100}%`,
              top: `${ry * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <span
              className={`${pillClass(layer)} ${ILLUSTRATION_LABEL_PILL_SURFACE[effectivePillSurfaceIndex(layer, 0)]!}`}
              style={pillCombinedStyle(layer)}
              {...drag}
            >
              {layer.text}
            </span>
          </div>
        );
      })}

      {ILLUSTRATION_LABEL_ANCHORS.map((anchor) => {
        const group = byAnchor.get(anchor);
        if (!group?.length) return null;
        return (
          <div
            key={anchor}
            className={`absolute max-w-[min(22rem,calc(100%-16px))] ${ANCHOR_CLUSTER_CLASS[anchor]}`}
          >
            {group.map((layer, stackIndex) => {
              const drag = bindPillDrag(layer.id);
              return (
                <span
                  key={layer.id}
                  className={`${pillClass(layer)} ${ILLUSTRATION_LABEL_PILL_SURFACE[effectivePillSurfaceIndex(layer, stackIndex)]!}`}
                  style={pillCombinedStyle(layer)}
                  {...drag}
                >
                  {layer.text}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
