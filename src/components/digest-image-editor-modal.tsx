"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DigestImageAspectPreset, DigestVisualCandidate, DigestVisualEditMetadata } from "@/lib/digest-visual-types";
import { activeVisualImageDataUrl } from "@/lib/digest-visual-types";
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
export type EditorToolTab = "preview" | "crop" | "resize" | "adjust" | "filters";

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
    if (candidate.type === "source") return "Edited source image";
    if (candidate.type === "stock") return "Edited stock-style visual";
    return "Edited AI-generated illustration";
  }
  if (candidate.type === "source") return "Source image";
  if (candidate.type === "stock") return "Stock-style visual";
  return "AI-generated illustration";
}

function selectedKindSubtitle(candidate: DigestVisualCandidate): string {
  if (candidate.type === "source") return "From source page. Verify rights before use.";
  if (candidate.type === "stock") return "Verify license and source before publication.";
  return "Generated from article-derived visual brief. Review for scientific accuracy.";
}

export function DigestImageEditorModal({
  candidate,
  initialMode = "preview",
  onClose,
  onSaveEdited,
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
  }) => Promise<void>;
  /** When the candidate has a stored pre-edit snapshot, reset can restore it (server). */
  onRevertOriginal?: () => Promise<void>;
  disabled?: boolean;
}) {
  const imageSrc = activeVisualImageDataUrl(candidate);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [nw, setNw] = useState(0);
  const [nh, setNh] = useState(0);

  const [activeTool, setActiveTool] = useState<EditorToolTab>(initialMode === "preview" ? "preview" : "crop");
  const [aspectPreset, setAspectPreset] = useState<DigestImageAspectPreset>("16:9");
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const [resizePreset, setResizePreset] = useState<ResizePresetKey | "custom">("digest_card");
  const [resizeW, setResizeW] = useState(1280);
  const [resizeH, setResizeH] = useState(720);
  const [lockAspect, setLockAspect] = useState(true);
  const [adjustments, setAdjustments] = useState<Adjustments>({ ...DEFAULT_ADJUSTMENTS });
  const [filterId, setFilterId] = useState<FilterId>("none");

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
        const initialCrop = clampCropToImage(cropForAspectPreset(w, h, "16:9"), w, h);
        setCrop(initialCrop);
        const rd = resizePresetDimensions("digest_card", initialCrop.w, initialCrop.h);
        const capped = capExportDimensions(rd.w, rd.h);
        setResizeW(capped.w);
        setResizeH(capped.h);
        setResizePreset("digest_card");
        setAspectPreset("16:9");
        setAdjustments({ ...DEFAULT_ADJUSTMENTS });
        setFilterId("none");
        setActiveTool(initialMode === "preview" ? "preview" : "crop");
        const snap: SessionSnapshot = {
          aspectPreset: "16:9",
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
    if (!canvas || !img || nw === 0 || loadState !== "ready") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const frameW = 200;
    const frameH = 112;
    canvas.width = frameW;
    canvas.height = frameH;
    ctx.fillStyle = "rgba(245, 239, 230, 0.9)";
    ctx.fillRect(0, 0, frameW, frameH);
    const cropAspect = crop.w / Math.max(1, crop.h);
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
    ctx.filter = buildCanvasFilter(adjustments, filterId);
    try {
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, dx, dy, destW, destH);
    } catch {
      /* ignore mini */
    }
    ctx.filter = "none";
    ctx.strokeStyle = "rgba(120, 100, 88, 0.35)";
    ctx.strokeRect(0.5, 0.5, frameW - 1, frameH - 1);
  }, [adjustments, crop.h, crop.w, crop.x, crop.y, filterId, loadState, nh, nw]);

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

  const canRevertStoredOriginal = Boolean(candidate.editOriginal && onRevertOriginal);
  const canFooterReset = isDirty || canRevertStoredOriginal;

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

  const buildMetadata = useCallback((): DigestVisualEditMetadata => {
    return {
      v: 1,
      originalCandidateId: candidate.id,
      aspectPreset,
      cropPixels: { ...crop },
      resizePixels: { w: resizeW, h: resizeH },
      lockAspect,
      adjustments: { ...adjustments },
      filterId,
      editedAt: new Date().toISOString(),
    };
  }, [adjustments, aspectPreset, candidate.id, crop, filterId, lockAspect, resizeH, resizeW]);

  const handleSave = async () => {
    const img = imgRef.current;
    if (!img || loadState !== "ready") return;
    setSaving(true);
    try {
      const { base64, mime } = runExport();
      await onSaveEdited({
        base64,
        mime,
        editMetadata: buildMetadata(),
      });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save image");
    } finally {
      setSaving(false);
    }
  };

  const handleFooterReset = async () => {
    if (isDirty) {
      resetAll();
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
    { id: "16:9", label: "Widescreen 16:9" },
    { id: "1:1", label: "Square 1:1" },
    { id: "4:5", label: "Portrait 4:5" },
    { id: "original", label: "Original" },
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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2 sm:p-4"
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
                <p className="text-sm text-[color:var(--muted-foreground)]">Loading image…</p>
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
                <canvas
                  ref={mainCanvasRef}
                  className={`max-h-[min(calc(58vh*1.25),650px)] max-w-full touch-none ${
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
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--muted-foreground)]">
                  Digest card preview (16:9)
                </p>
                <canvas ref={miniCanvasRef} className="mt-1 rounded-md border border-[color:var(--border)]/50" />
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
            </nav>

            <div className="border-t border-[color:var(--border)]/35 pt-3">
              {activeTool === "preview" ? (
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed text-[color:var(--muted-foreground)]">
                    Review the image at full size. Open a tool to crop, resize, tune color, or apply a subtle filter.
                  </p>
                  <Button type="button" className="w-full" onClick={() => setActiveTool("crop")}>
                    Edit image
                  </Button>
                </div>
              ) : null}

              {activeTool === "crop" ? (
                <div className="space-y-3">
                  <p className="text-[11px] text-[color:var(--muted-foreground)]">
                    <span className="font-medium text-[color:var(--foreground)]">Digest wide (16:9)</span> is the
                    default crop. Drag the crop box to reposition (fixed ratios), or choose freeform and drag a new
                    rectangle.
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
            disabled={saving || reverting || disabled || loadState !== "ready" || !isDirty}
            onClick={() => void handleSave()}
          >
            Save edited image
          </Button>
        </footer>
      </div>
    </div>
  );
}
