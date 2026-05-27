"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { RenderingStatus } from "@/components/rendering-indicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DigestIllustrationOverlays } from "@/components/digest-illustration-overlays";
import {
  DEFAULT_ILLUSTRATION_LABEL_FONT_PX,
  type DigestIllustrationTextLayer,
  type DigestImageAspectPreset,
  type DigestVisualCandidate,
  type DigestVisualEditMetadata,
} from "@/lib/digest-visual-types";
import { activeVisualImageDataUrl } from "@/lib/digest-visual-types";
import {
  ILLUSTRATION_LABEL_PILL_SURFACE,
  clampPillSurfaceIndex,
  hashPillSurfaceIndex,
} from "@/lib/digest-illustration-pill-palette";
import {
  type Adjustments,
  type FilterId,
  type ResizePresetKey,
  DEFAULT_ADJUSTMENTS,
  FILTER_IDS,
  buildCanvasFilter,
  capExportDimensions,
  clamp,
  clampCropToImage,
  cropForAspectPreset,
  dataUrlToBase64,
  filterPresetCss,
  renderPipelineToDataUrl,
  resizePresetDimensions,
  RESIZE_PRESET_LABELS,
} from "@/lib/digest-image-editor-utils";

type LoadState = "idle" | "loading" | "ready" | "error";
export type EditorToolTab = "preview" | "crop" | "resize" | "adjust" | "filters" | "labels";

type Rect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

function normalizeRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  return { x, y, w, h };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
}

async function loadImageForEditor(imageSrc: string): Promise<HTMLImageElement> {
  const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });

  if (imageSrc.startsWith("data:") || imageSrc.startsWith("blob:")) {
    return withTimeout(loadImage(imageSrc), 45_000);
  }
  if (imageSrc.startsWith("http://") || imageSrc.startsWith("https://")) {
    const proxySrc = `/api/digest-visuals/proxy?url=${encodeURIComponent(imageSrc)}`;
    try {
      return await withTimeout(loadImage(proxySrc), 45_000);
    } catch {
      return withTimeout(loadImage(imageSrc), 45_000);
    }
  }
  return withTimeout(loadImage(imageSrc), 45_000);
}

type SessionSnapshot = {
  aspectPreset: DigestImageAspectPreset;
  crop: Rect;
  resizeW: number;
  resizeH: number;
  lockAspect: boolean;
  resizePreset: ResizePresetKey | "custom";
  adjustments: Adjustments;
  filterId: FilterId;
  activeTool: EditorToolTab;
};

/** Save / dirty detection ignores which panel is open. */
function imageEditPayloadEqual(a: SessionSnapshot, b: SessionSnapshot): boolean {
  const { activeTool: _a, ...ra } = a;
  const { activeTool: _b, ...rb } = b;
  return JSON.stringify(ra) === JSON.stringify(rb);
}

function ToolTabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors ${
        active
          ? "border-[color:var(--accent)]/50 bg-[color:var(--accent)]/12 text-[color:var(--foreground)]"
          : "border-[color:var(--border)]/55 bg-[color:var(--background)]/70 text-[color:var(--muted-foreground)] hover:border-[color:var(--border)]/80 hover:text-[color:var(--foreground)]"
      }`}
    >
      <span className="shrink-0 text-[color:var(--muted-foreground)]" aria-hidden>
        {icon}
      </span>
      {label}
    </button>
  );
}

function selectedKindTitle(candidate: DigestVisualCandidate): string {
  const edited =
    Boolean(candidate.editedFromId) ||
    Boolean(candidate.editOriginal) ||
    Boolean(candidate.editMetadata);
  if (edited) {
    if (candidate.type === "upload") return "Edited uploaded image";
    if (candidate.type === "source") return "Edited source image";
    if (candidate.type === "stock") return "Edited photo-style visual";
    return "Edited AI-generated thumbnail";
  }
  if (candidate.type === "upload") return "Uploaded image";
  if (candidate.type === "source") return "Source image";
  if (candidate.type === "stock") return "Photo-style visual";
  return "AI-generated thumbnail";
}

function selectedKindSubtitle(candidate: DigestVisualCandidate): string {
  if (candidate.type === "upload") return "Uploaded by you. Confirm publication rights before distribution.";
  if (candidate.type === "source") return "From source page. Verify rights before use.";
  if (candidate.type === "stock") return "Verify license and source before publication.";
  return "Raster from the thumbnail prompt—overlay labels are editable metadata, not burned into PNG when extraction succeeds.";
}

function captionLayersFromCandidate(c: DigestVisualCandidate): DigestIllustrationTextLayer[] {
  if (!c.illustrationTextLayers?.length) return [];
  return c.illustrationTextLayers.map((L) => ({ ...L }));
}

function newCaptionLayerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Trim and drop empty rows — matches what we persist to the bundle. */
function persistableCaptionLayers(layers: DigestIllustrationTextLayer[]): DigestIllustrationTextLayer[] {
  return layers
    .map((L) => {
      const text = L.text.trim();
      const next: DigestIllustrationTextLayer = { ...L, text };
      if (L.fontSizePx != null && Number.isFinite(L.fontSizePx)) {
        next.fontSizePx = Math.min(48, Math.max(8, Math.round(L.fontSizePx)));
      }
      if (L.pillPaddingPx != null && Number.isFinite(L.pillPaddingPx)) {
        next.pillPaddingPx = Math.min(48, Math.max(0, Math.round(L.pillPaddingPx)));
      }
      if (L.pillSurfaceIndex != null && Number.isFinite(L.pillSurfaceIndex)) {
        next.pillSurfaceIndex = clampPillSurfaceIndex(L.pillSurfaceIndex);
      }
      if (next.fontBold !== true) delete next.fontBold;
      if (next.fontItalic !== true) delete next.fontItalic;
      if (next.fontUnderline !== true) delete next.fontUnderline;
      return next;
    })
    .filter((L) => L.text.length > 0);
}

function captionPayloadSignature(layers: DigestIllustrationTextLayer[]): string {
  return JSON.stringify(persistableCaptionLayers(layers));
}

export function DigestImageEditorModal({
  candidate,
  initialMode = "preview",
  onClose,
  onSaveEdited,
  onSaveIllustrationLayers,
  onSaveImageAlt,
  onRevertOriginal,
  disabled,
}: {
  candidate: DigestVisualCandidate;
  initialMode?: EditorToolTab;
  onClose: () => void;
  onSaveEdited: (payload: {
    base64: string;
    mime: string;
    editMetadata: DigestVisualEditMetadata;
    illustrationTextLayers?: DigestIllustrationTextLayer[];
  }) => Promise<void>;
  /** Persist overlay labels without re-uploading raster (digest schematic assets). */
  onSaveIllustrationLayers?: (layers: DigestIllustrationTextLayer[]) => Promise<void>;
  /** Persist image alt / accessibility caption (stored as `candidate.caption` on the bundle). */
  onSaveImageAlt?: (caption: string) => Promise<void>;
  /** When the candidate has a stored pre-edit snapshot, reset can restore it (server). */
  onRevertOriginal?: () => Promise<void>;
  disabled?: boolean;
}) {
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setPortalEl(document.body);
  }, []);

  const imageSrc = activeVisualImageDataUrl(candidate);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [nw, setNw] = useState(0);
  const [nh, setNh] = useState(0);

  const [activeTool, setActiveTool] = useState<EditorToolTab>(initialMode === "preview" ? "preview" : "crop");
  const [aspectPreset, setAspectPreset] = useState<DigestImageAspectPreset>("original");
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const [resizePreset, setResizePreset] = useState<ResizePresetKey | "custom">("digest_card");
  const [resizeW, setResizeW] = useState(1280);
  const [resizeH, setResizeH] = useState(720);
  const [lockAspect, setLockAspect] = useState(true);
  const [adjustments, setAdjustments] = useState<Adjustments>({ ...DEFAULT_ADJUSTMENTS });
  const [filterId, setFilterId] = useState<FilterId>("none");

  const supportsCaptionOverlays = candidate.type === "schematic";
  const [captionLayers, setCaptionLayers] = useState<DigestIllustrationTextLayer[]>(() =>
    captionLayersFromCandidate(candidate),
  );
  /** In-progress font size strings so clamping does not break typing (e.g. "1" before "14"). */
  const [labelFontSizeDrafts, setLabelFontSizeDrafts] = useState<Record<string, string>>({});
  /** In-progress pill padding (blur commits; empty = responsive Auto). */
  const [labelPillPaddingDrafts, setLabelPillPaddingDrafts] = useState<Record<string, string>>({});
  const captionBaselineRef = useRef<string>(captionPayloadSignature(captionLayersFromCandidate(candidate)));

  const [altDraft, setAltDraft] = useState(() => candidate.caption ?? "");
  const altBaselineRef = useRef((candidate.caption ?? "").trim());

  const baselineRef = useRef<SessionSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [freeDrag, setFreeDrag] = useState<{ from: Point; to: Point } | null>(null);
  const [panDrag, setPanDrag] = useState<{ start: Point; origin: Rect } | null>(null);

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const miniCanvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [canvasBox, setCanvasBox] = useState({ w: 520, h: 475 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setCanvasBox({
        w: Math.max(280, Math.floor(r.width)),
        h: Math.max(275, Math.floor(Math.min(r.height * 0.85 * 1.25, r.height - 8))),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loadState]);

  useEffect(() => {
    let cancelled = false;
    if (!imageSrc) {
      setLoadState("error");
      return;
    }
    setLoadState("loading");
    imgRef.current = null;
    void (async () => {
      try {
        const img = await loadImageForEditor(imageSrc);
        if (cancelled) return;
        if (!img.naturalWidth || !img.naturalHeight) throw new Error("bad size");
        imgRef.current = img;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        setNw(w);
        setNh(h);
        const initialCrop = clampCropToImage(cropForAspectPreset(w, h, "original"), w, h);
        setCrop(initialCrop);
        const rd = resizePresetDimensions("digest_card", initialCrop.w, initialCrop.h);
        const capped = capExportDimensions(rd.w, rd.h);
        setResizeW(capped.w);
        setResizeH(capped.h);
        setResizePreset("digest_card");
        setAspectPreset("original");
        setAdjustments({ ...DEFAULT_ADJUSTMENTS });
        setFilterId("none");
        setActiveTool(initialMode === "preview" ? "preview" : "crop");
        const snap: SessionSnapshot = {
          aspectPreset: "original",
          crop: initialCrop,
          resizeW: capped.w,
          resizeH: capped.h,
          lockAspect: true,
          resizePreset: "digest_card",
          adjustments: { ...DEFAULT_ADJUSTMENTS },
          filterId: "none",
          activeTool: initialMode === "preview" ? "preview" : "crop",
        };
        baselineRef.current = snap;
        setLoadState("ready");
      } catch {
        if (!cancelled) {
          setLoadState("error");
          toast.error("Could not load this image for editing.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidate.id, imageSrc, initialMode]);

  useEffect(() => {
    const snap = captionLayersFromCandidate(candidate);
    setCaptionLayers(snap);
    captionBaselineRef.current = captionPayloadSignature(snap);
  }, [candidate.id, candidate.illustrationTextLayers]);

  useEffect(() => {
    setLabelFontSizeDrafts({});
    setLabelPillPaddingDrafts({});
  }, [candidate.id]);

  useEffect(() => {
    const t = (candidate.caption ?? "").trim();
    altBaselineRef.current = t;
    setAltDraft(candidate.caption ?? "");
  }, [candidate.id, candidate.caption]);

  const layout = useMemo(() => {
    const maxW = canvasBox.w;
    const maxH = canvasBox.h;
    if (nw <= 0 || nh <= 0) {
      return { scale: 1, ox: 0, oy: 0, dw: 0, dh: 0, maxW, maxH };
    }
    const scale = Math.min(maxW / nw, maxH / nh, 1);
    const dw = Math.round(nw * scale);
    const dh = Math.round(nh * scale);
    const ox = (maxW - dw) / 2;
    const oy = (maxH - dh) / 2;
    return { scale, ox, oy, dw, dh, maxW, maxH };
  }, [nw, nh, canvasBox.w, canvasBox.h]);

  const naturalFromCanvas = useCallback(
    (p: Point): Point => ({
      x: clamp((p.x - layout.ox) / layout.scale, 0, nw),
      y: clamp((p.y - layout.oy) / layout.scale, 0, nh),
    }),
    [layout.ox, layout.oy, layout.scale, nw, nh],
  );

  const canvasFromNaturalRect = useCallback(
    (r: Rect) => ({
      x: layout.ox + r.x * layout.scale,
      y: layout.oy + r.y * layout.scale,
      w: r.w * layout.scale,
      h: r.h * layout.scale,
    }),
    [layout.ox, layout.oy, layout.scale],
  );

  /** Same letterboxed image rect as `redrawMini` — used to align label overlays on the digest card preview. */
  const digestMiniPreviewFrame = useMemo(() => {
    const frameW = 200;
    const frameH = 112;
    if (nw <= 0 || crop.w <= 0 || crop.h <= 0) return null;
    const cropAspect = crop.w / crop.h;
    const frameAspect = frameW / frameH;
    let destW: number;
    let destH: number;
    let dx: number;
    let dy: number;
    if (cropAspect > frameAspect) {
      destW = frameW;
      destH = frameW / cropAspect;
      dx = 0;
      dy = (frameH - destH) / 2;
    } else {
      destH = frameH;
      destW = frameH * cropAspect;
      dx = (frameW - destW) / 2;
      dy = 0;
    }
    return {
      frameW,
      frameH,
      imageRect: { x: dx, y: dy, w: destW, h: destH },
    };
  }, [crop.h, crop.w, nw]);

  const redrawMain = useCallback(() => {
    const canvas = mainCanvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || nw === 0 || loadState !== "ready") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { scale, ox, oy, dw, dh, maxW, maxH } = layout;
    canvas.width = Math.max(1, Math.floor(maxW));
    canvas.height = Math.max(1, Math.floor(maxH));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, nw, nh, ox, oy, dw, dh);
    const cr = canvasFromNaturalRect(crop);
    ctx.fillStyle = "rgba(28, 22, 18, 0.48)";
    ctx.fillRect(0, 0, canvas.width, cr.y);
    ctx.fillRect(0, cr.y + cr.h, canvas.width, canvas.height - cr.y - cr.h);
    ctx.fillRect(0, cr.y, cr.x, cr.h);
    ctx.fillRect(cr.x + cr.w, cr.y, canvas.width - cr.x - cr.w, cr.h);
    ctx.strokeStyle = "rgba(255, 252, 248, 0.92)";
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(cr.x + 0.5, cr.y + 0.5, cr.w - 1, cr.h - 1);
    ctx.setLineDash([]);
    if (freeDrag && aspectPreset === "freeform") {
      const a = freeDrag.from;
      const b = freeDrag.to;
      const fr = normalizeRect(a, b);
      ctx.strokeStyle = "rgba(196, 120, 88, 0.95)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fr.x, fr.y, fr.w, fr.h);
    }
  }, [
    aspectPreset,
    canvasFromNaturalRect,
    crop,
    freeDrag,
    layout,
    loadState,
    nh,
    nw,
  ]);

  const redrawMini = useCallback(() => {
    const canvas = miniCanvasRef.current;
    const img = imgRef.current;
    const miniLayout = digestMiniPreviewFrame;
    if (!canvas || !img || nw === 0 || loadState !== "ready" || !miniLayout) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { frameW, frameH, imageRect } = miniLayout;
    const { x: dx, y: dy, w: destW, h: destH } = imageRect;
    canvas.width = frameW;
    canvas.height = frameH;
    ctx.fillStyle = "rgba(245, 239, 230, 0.9)";
    ctx.fillRect(0, 0, frameW, frameH);
    ctx.filter = buildCanvasFilter(adjustments, filterId);
    try {
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, dx, dy, destW, destH);
    } catch {
      /* ignore mini */
    }
    ctx.filter = "none";
    ctx.strokeStyle = "rgba(120, 100, 88, 0.35)";
    ctx.strokeRect(0.5, 0.5, frameW - 1, frameH - 1);
  }, [adjustments, crop, digestMiniPreviewFrame, filterId, loadState, nw]);

  useEffect(() => {
    redrawMain();
  }, [redrawMain]);

  useEffect(() => {
    redrawMini();
  }, [redrawMini]);

  const applyAspect = useCallback(
    (preset: DigestImageAspectPreset) => {
      if (nw === 0 || nh === 0) return;
      setAspectPreset(preset);
      if (preset === "freeform") {
        setFreeDrag(null);
        return;
      }
      const next = clampCropToImage(cropForAspectPreset(nw, nh, preset), nw, nh);
      setCrop(next);
      setFreeDrag(null);
    },
    [nh, nw],
  );

  useEffect(() => {
    if (resizePreset === "custom") return;
    const rd = resizePresetDimensions(resizePreset, crop.w, crop.h);
    const capped = capExportDimensions(rd.w, rd.h);
    setResizeW(capped.w);
    setResizeH(capped.h);
  }, [crop.h, crop.w, resizePreset]);

  const cropW = crop.w;
  const cropH = crop.h;
  const upscaleWarning = resizeW > cropW + 2 || resizeH > cropH + 2;

  const currentSession = useMemo(
    (): SessionSnapshot => ({
      aspectPreset,
      crop,
      resizeW,
      resizeH,
      lockAspect,
      resizePreset,
      adjustments: { ...adjustments },
      filterId,
      activeTool,
    }),
    [activeTool, adjustments, aspectPreset, crop, filterId, lockAspect, resizeH, resizePreset, resizeW],
  );

  const isDirty =
    baselineRef.current != null && !imageEditPayloadEqual(currentSession, baselineRef.current);

  const captionDirty =
    supportsCaptionOverlays && captionPayloadSignature(captionLayers) !== captionBaselineRef.current;

  const captionDragEnabled =
    supportsCaptionOverlays &&
    loadState === "ready" &&
    nw > 0 &&
    nh > 0 &&
    (activeTool === "preview" || activeTool === "labels");

  const handleCaptionPositionNorm = useCallback((id: string, xNorm: number, yNorm: number) => {
    setCaptionLayers((rows) => rows.map((r) => (r.id === id ? { ...r, xNorm, yNorm } : r)));
  }, []);

  const altDirty = onSaveImageAlt != null && altDraft.trim() !== altBaselineRef.current;

  const canSaveRasterOrCaptions = isDirty || captionDirty || altDirty;

  const canRevertStoredOriginal = Boolean(candidate.editOriginal && onRevertOriginal);
  const canFooterReset = isDirty || canRevertStoredOriginal || altDirty;

  const resetAll = () => {
    const b = baselineRef.current;
    if (!b) return;
    setAspectPreset(b.aspectPreset);
    setCrop({ ...b.crop });
    setResizeW(b.resizeW);
    setResizeH(b.resizeH);
    setLockAspect(b.lockAspect);
    setResizePreset(b.resizePreset);
    setAdjustments({ ...b.adjustments });
    setFilterId(b.filterId);
    setActiveTool(b.activeTool);
    setFreeDrag(null);
    setPanDrag(null);
  };

  const resetCropOnly = () => {
    const b = baselineRef.current;
    if (!b) return;
    setAspectPreset(b.aspectPreset);
    setCrop({ ...b.crop });
    setFreeDrag(null);
    setPanDrag(null);
  };

  const resetAdjustmentsOnly = () => {
    setAdjustments({ ...DEFAULT_ADJUSTMENTS });
  };

  const canvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = e.currentTarget;
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * canvas.width;
    const y = ((e.clientY - r.top) / r.height) * canvas.height;
    return { x, y };
  };

  const onPointerDownMain = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || loadState !== "ready" || activeTool !== "crop") return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const p = canvasPoint(e);
    if (aspectPreset === "freeform") {
      setFreeDrag({ from: p, to: p });
      return;
    }
    const cr = canvasFromNaturalRect(crop);
    const inside = p.x >= cr.x && p.x <= cr.x + cr.w && p.y >= cr.y && p.y <= cr.y + cr.h;
    if (inside) {
      setPanDrag({ start: p, origin: { ...crop } });
    }
  };

  const onPointerMoveMain = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = canvasPoint(e);
    if (freeDrag && aspectPreset === "freeform") {
      setFreeDrag((d) => (d ? { ...d, to: p } : null));
      return;
    }
    if (panDrag) {
      const dx = (p.x - panDrag.start.x) / layout.scale;
      const dy = (p.y - panDrag.start.y) / layout.scale;
      const next = clampCropToImage(
        {
          x: panDrag.origin.x + dx,
          y: panDrag.origin.y + dy,
          w: panDrag.origin.w,
          h: panDrag.origin.h,
        },
        nw,
        nh,
      );
      setCrop(next);
    }
  };

  const onPointerUpMain = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (freeDrag && aspectPreset === "freeform") {
      const p = canvasPoint(e);
      const rect = normalizeRect(freeDrag.from, p);
      const n0 = naturalFromCanvas({ x: rect.x, y: rect.y });
      const n1 = naturalFromCanvas({ x: rect.x + rect.w, y: rect.y + rect.h });
      const nr = clampCropToImage(
        {
          x: Math.floor(Math.min(n0.x, n1.x)),
          y: Math.floor(Math.min(n0.y, n1.y)),
          w: Math.ceil(Math.abs(n1.x - n0.x)),
          h: Math.ceil(Math.abs(n1.y - n0.y)),
        },
        nw,
        nh,
      );
      if (nr.w >= 8 && nr.h >= 8) setCrop(nr);
      setFreeDrag(null);
    }
    setPanDrag(null);
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const runExport = useCallback(() => {
    const img = imgRef.current;
    if (!img) throw new Error("Image not ready");
    const { dataUrl, mime } = renderPipelineToDataUrl(
      img,
      crop,
      resizeW,
      resizeH,
      adjustments,
      filterId,
      0.9,
    );
    return { base64: dataUrlToBase64(dataUrl), mime };
  }, [adjustments, crop, filterId, resizeH, resizeW]);

  const cropCanvasRect = useMemo(
    () => (nw > 0 ? canvasFromNaturalRect(crop) : null),
    [canvasFromNaturalRect, crop, nw],
  );

  const buildMetadata = useCallback((): DigestVisualEditMetadata => {
    return {
      v: 1,
      originalCandidateId: candidate.id,
      ...(nw > 0 && nh > 0 ? { sourceNaturalPixels: { w: nw, h: nh } } : {}),
      aspectPreset,
      cropPixels: { ...crop },
      resizePixels: { w: resizeW, h: resizeH },
      lockAspect,
      adjustments: { ...adjustments },
      filterId,
      editedAt: new Date().toISOString(),
    };
  }, [adjustments, aspectPreset, candidate.id, crop, filterId, lockAspect, nh, nw, resizeH, resizeW]);

  const handleSave = async () => {
    const img = imgRef.current;
    const needsRasterSession = isDirty || captionDirty;
    if (needsRasterSession && (!img || loadState !== "ready")) return;
    if (!canSaveRasterOrCaptions) return;
    const persisted = persistableCaptionLayers(captionLayers);
    setSaving(true);
    try {
      if (isDirty) {
        const { base64, mime } = runExport();
        await onSaveEdited({
          base64,
          mime,
          editMetadata: buildMetadata(),
          illustrationTextLayers: supportsCaptionOverlays ? persisted : undefined,
        });
      } else if (captionDirty) {
        if (!onSaveIllustrationLayers) {
          throw new Error("Label save is not available for this editor.");
        }
        await onSaveIllustrationLayers(persisted);
      }

      if (altDirty) {
        if (!onSaveImageAlt) {
          throw new Error("Alt text save is not available for this editor.");
        }
        await onSaveImageAlt(altDraft.trim());
        altBaselineRef.current = altDraft.trim();
      }

      captionBaselineRef.current = captionPayloadSignature(captionLayers);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const handleFooterReset = async () => {
    if (isDirty) {
      resetAll();
      return;
    }
    if (altDirty) {
      setAltDraft(candidate.caption ?? "");
      return;
    }
    if (canRevertStoredOriginal && onRevertOriginal) {
      setReverting(true);
      try {
        await onRevertOriginal();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not restore original");
      } finally {
        setReverting(false);
      }
    }
  };

  const aspectButtons: { id: DigestImageAspectPreset; label: string }[] = [
    { id: "original", label: "Original" },
    { id: "16:9", label: "Widescreen 16:9" },
    { id: "1:1", label: "Square 1:1" },
    { id: "4:5", label: "Portrait 4:5" },
    { id: "freeform", label: "Freeform" },
  ];

  const filterChips: { id: FilterId; label: string }[] = [
    { id: "none", label: "None" },
    { id: "soft", label: "Soft" },
    { id: "warm", label: "Warm" },
    { id: "cool", label: "Cool" },
    { id: "high_contrast", label: "Contrast" },
    { id: "muted", label: "Muted" },
    { id: "grayscale", label: "Gray" },
  ];

  const slider = (key: keyof Adjustments, label: string, min: number, max: number) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px] font-medium text-[color:var(--muted-foreground)]">{label}</Label>
        <span className="text-[10px] tabular-nums text-[color:var(--muted-foreground)]">
          {adjustments[key] === 0 ? "0" : adjustments[key] > 0 ? `+${adjustments[key]}` : adjustments[key]}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={adjustments[key]}
        onChange={(e) =>
          setAdjustments((a) => ({ ...a, [key]: Number.parseInt(e.target.value, 10) || 0 }))
        }
        className="h-1.5 w-full cursor-pointer accent-[color:var(--accent)]"
      />
    </div>
  );

  const overlay = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-2 sm:p-4"
      role="dialog"
      aria-modal
      aria-labelledby="digest-editor-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(100dvh,calc(94vh*1.25))] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[color:var(--border)]/80 bg-[color:var(--background)] shadow-2xl lg:max-h-[min(100dvh,calc(92vh*1.25))]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--border)]/50 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p id="digest-editor-title" className="text-sm font-semibold text-[color:var(--foreground)]">
              {selectedKindTitle(candidate)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--muted-foreground)]">{selectedKindSubtitle(candidate)}</p>
            <p className="mt-1.5 text-[10px] leading-snug text-[color:var(--muted-foreground)]/85">
              <span className="font-medium text-[color:var(--foreground)]/80">Provenance: </span>
              {candidate.provenance}
              {candidate.rightsNote ? ` · ${candidate.rightsNote}` : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--border)]/70 text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/30 hover:text-[color:var(--foreground)]"
            aria-label="Close"
          >
            <span className="text-lg leading-none" aria-hidden>
              ×
            </span>
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="flex min-h-0 min-w-0 flex-[0.7] flex-col border-b border-[color:var(--border)]/40 bg-[color:var(--muted)]/8 p-3 sm:p-4 lg:border-b-0 lg:border-r">
            <div ref={wrapRef} className="relative flex min-h-[275px] flex-1 items-center justify-center rounded-xl border border-[color:var(--border)]/45 bg-[#faf6ef] p-2">
              {loadState === "loading" || loadState === "idle" ? (
                <RenderingStatus
                  variant="compact"
                  label="Loading image…"
                  description={null}
                  className="min-h-0 py-0"
                />
              ) : null}
              {loadState === "error" ? (
                <div className="max-w-sm space-y-3 px-4 text-center text-sm text-[color:var(--muted-foreground)]">
                  <p>This image could not be loaded for editing.</p>
                  <Button type="button" variant="secondary" onClick={onClose}>
                    Close
                  </Button>
                </div>
              ) : null}
              {loadState === "ready" ? (
                <div className="relative mx-auto w-fit max-w-full max-h-[min(calc(58vh*1.25),650px)]">
                  <canvas
                    ref={mainCanvasRef}
                    className={`block max-h-[min(calc(58vh*1.25),650px)] max-w-full touch-none ${
                      activeTool === "crop" ? "cursor-crosshair" : "cursor-default"
                    }`}
                    style={
                      layout.maxW > 0 && layout.maxH > 0
                        ? {
                            width: `min(100%, ${layout.maxW}px)`,
                            aspectRatio: `${layout.maxW} / ${layout.maxH}`,
                            height: "auto",
                            maxHeight: "min(calc(58vh * 1.25), 650px)",
                          }
                        : undefined
                    }
                    onPointerDown={onPointerDownMain}
                    onPointerMove={onPointerMoveMain}
                    onPointerUp={onPointerUpMain}
                    onPointerCancel={onPointerUpMain}
                  />
                  {supportsCaptionOverlays ? (
                    <DigestIllustrationOverlays
                      layers={captionLayers}
                      layoutBoxPx={cropCanvasRect}
                      layoutCoordinateSpace={
                        layout.maxW > 0 && layout.maxH > 0
                          ? { w: layout.maxW, h: layout.maxH }
                          : null
                      }
                      naturalSize={{ w: nw, h: nh }}
                      cropNatural={crop}
                      dragEnabled={captionDragEnabled}
                      onLayerPositionNormChange={handleCaptionPositionNorm}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--muted-foreground)]">
                  Digest card preview (16:9)
                </p>
                <div className="relative mt-1 h-[112px] w-[200px] shrink-0">
                  <canvas
                    ref={miniCanvasRef}
                    className="absolute inset-0 rounded-md border border-[color:var(--border)]/50"
                  />
                  {loadState === "ready" && supportsCaptionOverlays && digestMiniPreviewFrame ? (
                    <DigestIllustrationOverlays
                      layers={captionLayers}
                      layoutBoxPx={digestMiniPreviewFrame.imageRect}
                      layoutCoordinateSpace={{
                        w: digestMiniPreviewFrame.frameW,
                        h: digestMiniPreviewFrame.frameH,
                      }}
                      naturalSize={{ w: nw, h: nh }}
                      cropNatural={crop}
                      dragEnabled={false}
                    />
                  ) : null}
                </div>
              </div>
              <p className="max-w-xs text-[11px] leading-snug text-[color:var(--muted-foreground)]">
                Edits are preview-only until you save. The original candidate stays in the bundle.
              </p>
            </div>
          </div>

          <aside className="flex max-h-[min(calc(50vh*1.25),78vh)] w-full flex-[0.3] flex-col overflow-y-auto border-t border-[color:var(--border)]/35 bg-[color:var(--background)]/95 p-3 sm:max-h-none sm:p-4 lg:max-h-none lg:border-t-0">
            <nav className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-1" aria-label="Editor tools">
              <ToolTabButton
                active={activeTool === "preview"}
                onClick={() => setActiveTool("preview")}
                label="Preview"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                }
              />
              <ToolTabButton
                active={activeTool === "crop"}
                onClick={() => setActiveTool("crop")}
                label="Crop"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 2H2v4" />
                    <path d="M2 16v4h4" />
                    <path d="M18 22h4v-4" />
                    <path d="M22 8V2h-4" />
                    <rect x="7" y="7" width="10" height="10" rx="1" />
                  </svg>
                }
              />
              <ToolTabButton
                active={activeTool === "resize"}
                onClick={() => setActiveTool("resize")}
                label="Resize"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h6v6" />
                    <path d="M9 21H3v-6" />
                    <path d="M21 3l-7 7" />
                    <path d="M3 21l7-7" />
                  </svg>
                }
              />
              <ToolTabButton
                active={activeTool === "adjust"}
                onClick={() => setActiveTool("adjust")}
                label="Adjust"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2" />
                  </svg>
                }
              />
              <ToolTabButton
                active={activeTool === "filters"}
                onClick={() => setActiveTool("filters")}
                label="Filters"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3v3M8.5 8.5 6 6M3 12h3M8.5 15.5 6 18M12 18v3M15.5 15.5 18 18M18 12h3M15.5 8.5 18 6" />
                  </svg>
                }
              />
              {supportsCaptionOverlays ? (
                <ToolTabButton
                  active={activeTool === "labels"}
                  onClick={() => setActiveTool("labels")}
                  label="Labels"
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
                    </svg>
                  }
                />
              ) : null}
            </nav>

            <div className="border-t border-[color:var(--border)]/35 pt-3">
              {activeTool === "preview" ? (
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed text-[color:var(--muted-foreground)]">
                    Review the image at full size. Open a tool to crop, resize, tune color, or apply a subtle filter.
                    {supportsCaptionOverlays ? (
                      <>
                        {" "}
                        For illustrations, use{" "}
                        <span className="font-medium text-[color:var(--foreground)]">Labels</span> to edit overlay text
                        stored in the bundle (not baked into the PNG). Drag labels on the preview to position them and set
                        per-label font sizes.
                      </>
                    ) : null}
                  </p>
                  {onSaveImageAlt ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="digest-image-alt" className="text-[11px] font-medium text-[color:var(--foreground)]">
                        Image alt text (accessibility)
                      </Label>
                      <textarea
                        id="digest-image-alt"
                        value={altDraft}
                        disabled={disabled}
                        onChange={(e) => setAltDraft(e.target.value.slice(0, 500))}
                        rows={4}
                        placeholder="Describe this image for screen readers and social platforms (optional but recommended)."
                        className="w-full resize-y rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)] px-2.5 py-2 text-xs leading-relaxed text-[color:var(--foreground)] outline-none placeholder:text-[color:var(--muted-foreground)]/65 focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:opacity-45"
                      />
                      <div className="flex justify-between text-[10px] text-[color:var(--muted-foreground)]">
                        <span>{altDraft.length}/500</span>
                        <span>Use Save all changes to persist.</span>
                      </div>
                    </div>
                  ) : null}
                  <Button type="button" className="w-full" onClick={() => setActiveTool("crop")}>
                    Edit image
                  </Button>
                </div>
              ) : null}

              {activeTool === "crop" ? (
                <div className="space-y-3">
                  <p className="text-[11px] text-[color:var(--muted-foreground)]">
                    <span className="font-medium text-[color:var(--foreground)]">Original</span> (full image) is the
                    default crop. Switch to <span className="font-medium text-[color:var(--foreground)]">Widescreen 16:9</span>{" "}
                    or another ratio for digest cards, drag the crop box to reposition, or use{" "}
                    <span className="font-medium text-[color:var(--foreground)]">Freeform</span> and drag a new rectangle.
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {aspectButtons.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => applyAspect(b.id)}
                        className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                          aspectPreset === b.id
                            ? "border-[color:var(--accent)]/50 bg-[color:var(--accent)]/12 text-[color:var(--foreground)]"
                            : "border-[color:var(--border)]/60 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={resetCropOnly}
                    className="text-[11px] font-medium text-[color:var(--muted-foreground)] underline-offset-2 hover:underline"
                  >
                    Reset crop
                  </button>
                </div>
              ) : null}

              {activeTool === "resize" ? (
                <div className="space-y-3">
                  <p className="text-[11px] text-[color:var(--muted-foreground)]">Output size after crop (digest export).</p>
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Preset</Label>
                    <select
                      className="w-full rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)] px-2 py-1.5 text-xs"
                      value={resizePreset}
                      onChange={(e) => {
                        const v = e.target.value as ResizePresetKey | "custom";
                        setResizePreset(v);
                        if (v !== "custom") {
                          const rd = resizePresetDimensions(v, crop.w, crop.h);
                          const c = capExportDimensions(rd.w, rd.h);
                          setResizeW(c.w);
                          setResizeH(c.h);
                        }
                      }}
                    >
                      {(Object.keys(RESIZE_PRESET_LABELS) as ResizePresetKey[]).map((k) => (
                        <option key={k} value={k}>
                          {RESIZE_PRESET_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[color:var(--muted-foreground)]">
                    <input
                      type="checkbox"
                      checked={lockAspect}
                      onChange={(e) => setLockAspect(e.target.checked)}
                      className="rounded border-[color:var(--border)]"
                    />
                    Lock aspect ratio
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px]">Width</Label>
                      <Input
                        type="number"
                        min={32}
                        max={8192}
                        value={resizeW}
                        onChange={(e) => {
                          const w = clamp(Number(e.target.value) || 1, 1, 8192);
                          setResizePreset("custom");
                          setResizeW(w);
                          if (lockAspect && cropH > 0) {
                            const r = cropW / cropH;
                            setResizeH(Math.max(1, Math.round(w / r)));
                          }
                        }}
                        className="mt-0.5 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Height</Label>
                      <Input
                        type="number"
                        min={32}
                        max={8192}
                        value={resizeH}
                        onChange={(e) => {
                          const h = clamp(Number(e.target.value) || 1, 1, 8192);
                          setResizePreset("custom");
                          setResizeH(h);
                          if (lockAspect && cropW > 0) {
                            const r = cropW / cropH;
                            setResizeW(Math.max(1, Math.round(h * r)));
                          }
                        }}
                        className="mt-0.5 h-8 text-xs"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-[color:var(--muted-foreground)]">
                    Result: {resizeW} × {resizeH}px
                    {upscaleWarning ? (
                      <span className="mt-1 block text-amber-800/90 dark:text-amber-200/90">
                        Requested size is larger than the cropped region — the image may soften when scaled up.
                      </span>
                    ) : null}
                  </p>
                </div>
              ) : null}

              {activeTool === "adjust" ? (
                <div className="space-y-3">
                  {slider("brightness", "Brightness", -50, 50)}
                  {slider("contrast", "Contrast", -50, 50)}
                  {slider("saturation", "Saturation", -50, 50)}
                  {slider("warmth", "Warmth (cool ← → warm)", -50, 50)}
                  {slider("sharpness", "Sharpness (optional)", 0, 40)}
                  <button
                    type="button"
                    onClick={resetAdjustmentsOnly}
                    className="text-[11px] font-medium text-[color:var(--muted-foreground)] underline-offset-2 hover:underline"
                  >
                    Reset adjustments
                  </button>
                </div>
              ) : null}

              {activeTool === "filters" ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-[color:var(--muted-foreground)]">One editorial look at a time.</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {filterChips.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFilterId(f.id)}
                        className={`rounded-lg border px-2 py-2 text-left text-[11px] font-medium transition-colors ${
                          filterId === f.id
                            ? "border-[color:var(--accent)]/50 bg-[color:var(--accent)]/12"
                            : "border-[color:var(--border)]/55 hover:bg-[color:var(--muted)]/15"
                        }`}
                      >
                        <span className="block font-semibold text-[color:var(--foreground)]">{f.label}</span>
                        <span
                          className="mt-1 block h-7 w-full rounded border border-[color:var(--border)]/40 bg-[color:var(--muted)]/20"
                          style={{ filter: filterPresetCss(f.id) || "none" }}
                          aria-hidden
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {supportsCaptionOverlays && activeTool === "labels" ? (
                <div className="space-y-3">
                  <p className="text-[11px] leading-snug text-[color:var(--muted-foreground)]">
                    Overlay labels use a fixed size on the image (extra lines are clipped). Press Enter for line breaks.
                    Labels are saved on the candidate. Clearing a row removes that label after you save (empty rows are not
                    stored). Drag labels on the main preview while this panel or Preview is open to position them.
                  </p>
                  <div className="space-y-2">
                    {captionLayers.map((L, idx) => (
                      <div
                        key={L.id}
                        className="rounded-lg border border-[color:var(--border)]/55 bg-[color:var(--background)]/85 p-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                            Label {idx + 1}
                          </span>
                          <button
                            type="button"
                            className="text-[10px] font-medium text-[#8f4d45] underline-offset-2 hover:underline"
                            onClick={() => {
                              setLabelFontSizeDrafts((p) => {
                                const next = { ...p };
                                delete next[L.id];
                                return next;
                              });
                              setLabelPillPaddingDrafts((p) => {
                                const next = { ...p };
                                delete next[L.id];
                                return next;
                              });
                              setCaptionLayers((rows) => rows.filter((r) => r.id !== L.id));
                            }}
                          >
                            Remove
                          </button>
                        </div>
                        <Textarea
                          value={L.text}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCaptionLayers((rows) => rows.map((r) => (r.id === L.id ? { ...r, text: v } : r)));
                          }}
                          placeholder="Label text (Enter for a new line)"
                          maxLength={160}
                          rows={3}
                          className="mt-1.5 min-h-[4.75rem] resize-y py-2 text-xs"
                        />
                        <Label className="mt-2 block text-[10px] text-[color:var(--muted-foreground)]">
                          Font size (px)
                        </Label>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            aria-label={`Font size in pixels for label ${idx + 1}`}
                            value={
                              labelFontSizeDrafts[L.id] !== undefined
                                ? labelFontSizeDrafts[L.id]!
                                : String(L.fontSizePx ?? DEFAULT_ILLUSTRATION_LABEL_FONT_PX)
                            }
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, "");
                              setLabelFontSizeDrafts((prev) => ({ ...prev, [L.id]: digits }));
                              const n = parseInt(digits, 10);
                              if (digits !== "" && Number.isFinite(n) && n >= 8 && n <= 48) {
                                setCaptionLayers((rows) =>
                                  rows.map((r) => (r.id === L.id ? { ...r, fontSizePx: n } : r)),
                                );
                              }
                            }}
                            onBlur={() => {
                              const draft = labelFontSizeDrafts[L.id];
                              setLabelFontSizeDrafts((prev) => {
                                const next = { ...prev };
                                delete next[L.id];
                                return next;
                              });
                              const n =
                                draft !== undefined && draft !== "" ? parseInt(draft, 10) : Number.NaN;
                              const final = Number.isFinite(n)
                                ? clamp(n, 8, 48)
                                : DEFAULT_ILLUSTRATION_LABEL_FONT_PX;
                              setCaptionLayers((rows) =>
                                rows.map((r) => (r.id === L.id ? { ...r, fontSizePx: final } : r)),
                              );
                            }}
                            className="h-9 min-w-[4rem] flex-1 text-xs"
                          />
                          <div
                            className="flex shrink-0 items-center gap-0.5"
                            role="group"
                            aria-label={`Label ${idx + 1} text style`}
                          >
                            {(
                              [
                                { key: "fontBold" as const, label: "B", title: "Bold" },
                                { key: "fontItalic" as const, label: "I", title: "Italic" },
                                { key: "fontUnderline" as const, label: "U", title: "Underline" },
                              ] as const
                            ).map(({ key, label, title }) => {
                              const active = !!L[key];
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  title={title}
                                  aria-label={`${title} for label ${idx + 1}`}
                                  aria-pressed={active}
                                  onClick={() =>
                                    setCaptionLayers((rows) =>
                                      rows.map((r) =>
                                        r.id === L.id ? { ...r, [key]: !r[key] } : r,
                                      ),
                                    )
                                  }
                                  className={`h-9 min-w-[2rem] shrink-0 rounded-md border text-xs font-semibold transition-colors ${
                                    active
                                      ? "border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[color:var(--foreground)]"
                                      : "border-[color:var(--border)]/60 bg-[color:var(--background)]/85 text-[color:var(--muted-foreground)] hover:bg-[color:var(--muted)]/30"
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <Label className="mt-2 block text-[10px] text-[color:var(--muted-foreground)]">
                          Label padding (px)
                        </Label>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="Auto"
                            aria-label={`Background padding in pixels for label ${idx + 1}; leave empty for automatic sizing`}
                            value={
                              labelPillPaddingDrafts[L.id] !== undefined
                                ? labelPillPaddingDrafts[L.id]!
                                : L.pillPaddingPx != null
                                  ? String(L.pillPaddingPx)
                                  : ""
                            }
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, "");
                              setLabelPillPaddingDrafts((prev) => ({ ...prev, [L.id]: digits }));
                            }}
                            onBlur={() => {
                              const draft = labelPillPaddingDrafts[L.id];
                              setLabelPillPaddingDrafts((prev) => {
                                const next = { ...prev };
                                delete next[L.id];
                                return next;
                              });
                              if (draft === undefined || draft === "") {
                                setCaptionLayers((rows) =>
                                  rows.map((r) =>
                                    r.id === L.id ? { ...r, pillPaddingPx: undefined } : r,
                                  ),
                                );
                                return;
                              }
                              const n = parseInt(draft, 10);
                              const final = Number.isFinite(n) ? clamp(n, 0, 48) : undefined;
                              setCaptionLayers((rows) =>
                                rows.map((r) =>
                                  r.id === L.id ? { ...r, pillPaddingPx: final } : r,
                                ),
                              );
                            }}
                            className="h-9 min-w-[4rem] flex-1 text-xs"
                          />
                          <div
                            className="flex shrink-0 items-center gap-1"
                            role="group"
                            aria-label={`Bubble color for label ${idx + 1}`}
                          >
                            {(() => {
                              const effectiveSwatch =
                                L.pillSurfaceIndex != null && Number.isFinite(L.pillSurfaceIndex)
                                  ? clampPillSurfaceIndex(L.pillSurfaceIndex)
                                  : hashPillSurfaceIndex(L.id, 0);
                              return ILLUSTRATION_LABEL_PILL_SURFACE.map((surfaceClass, swIdx) => {
                                const swatchActive = effectiveSwatch === swIdx;
                                return (
                                  <button
                                    key={swIdx}
                                    type="button"
                                    title={`Bubble color ${swIdx + 1}`}
                                    aria-label={`Bubble color ${swIdx + 1} of ${ILLUSTRATION_LABEL_PILL_SURFACE.length}`}
                                    aria-pressed={swatchActive}
                                    onClick={() =>
                                      setCaptionLayers((rows) =>
                                        rows.map((r) =>
                                          r.id === L.id ? { ...r, pillSurfaceIndex: swIdx } : r,
                                        ),
                                      )
                                    }
                                    className={`h-8 w-8 shrink-0 rounded-full shadow-sm transition-[box-shadow,opacity] ${surfaceClass} ${
                                      swatchActive
                                        ? "ring-2 ring-[color:var(--accent)] ring-offset-2 ring-offset-[color:var(--background)]"
                                        : "opacity-85 hover:opacity-100"
                                    } `}
                                  />
                                );
                              });
                            })()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full text-xs"
                    onClick={() =>
                      setCaptionLayers((rows) => {
                        const idx = rows.length;
                        const yNorm = clamp(0.14 + idx * 0.16, 0.1, 0.86);
                        return [
                          ...rows,
                          {
                            id: newCaptionLayerId(),
                            text: "",
                            xNorm: 0.5,
                            yNorm,
                            fontSizePx: DEFAULT_ILLUSTRATION_LABEL_FONT_PX,
                          },
                        ];
                      })
                    }
                  >
                    Add label
                  </Button>
                </div>
              ) : null}
            </div>
          </aside>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[color:var(--border)]/45 bg-[color:var(--background)]/98 px-4 py-3 sm:px-5">
          <Button type="button" variant="secondary" className="h-9 text-xs" onClick={onClose} disabled={saving || reverting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-9 text-xs"
            disabled={saving || reverting || !canFooterReset}
            title={
              isDirty
                ? "Undo changes in this session"
                : canRevertStoredOriginal
                  ? "Restore the imported image before edits"
                  : undefined
            }
            onClick={() => void handleFooterReset()}
          >
            {reverting ? "Restoring…" : "Reset"}
          </Button>
          <Button
            type="button"
            className="h-9 text-xs"
            disabled={
              saving ||
              reverting ||
              disabled ||
              !canSaveRasterOrCaptions ||
              ((isDirty || captionDirty) && loadState !== "ready")
            }
            onClick={() => void handleSave()}
          >
            {saving
              ? "Saving…"
              : (() => {
                  const alt = altDirty && onSaveImageAlt;
                  if (isDirty && captionDirty && alt) return "Save image, overlays & alt";
                  if (isDirty && captionDirty) return "Save image & labels";
                  if (isDirty && alt) return "Save image & alt text";
                  if (captionDirty && alt) return "Save labels & alt text";
                  if (alt && !isDirty && !captionDirty) return "Save alt text";
                  if (isDirty) return "Save edited image";
                  if (captionDirty) return "Save labels";
                  return "Save all changes";
                })()}
          </Button>
        </footer>
      </div>
    </div>
  );

  if (!portalEl) return null;
  return createPortal(overlay, portalEl);
}
