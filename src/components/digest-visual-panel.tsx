"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BookmarkIcon } from "@/components/icons/bookmark";
import { SparklesIcon } from "@/components/icons/sparkles";
import { RenderingStatus } from "@/components/rendering-indicator";
import { Button } from "@/components/ui/button";
import { DigestImageEditorModal, type EditorToolTab } from "@/components/digest-image-editor-modal";
import type { DigestIllustrationTextLayer, DigestVisualEditMetadata } from "@/lib/digest-visual-types";
import { DigestIllustrationOverlays } from "@/components/digest-illustration-overlays";
import type {
  DigestCoverStore,
  DigestVisualBundle,
  DigestVisualCandidate,
  VisualCandidateType,
} from "@/lib/digest-visual-types";
import { activeVisualImageDataUrl, parseDigestCoverStoreFromDb } from "@/lib/digest-visual-types";
import type { Json, SummaryStyle } from "@/types/database";
import { digestHeroIllustrationOverlayLayout } from "@/lib/digest-illustration-overlay-layout";
import { isDigestVisualTransientFailure, userFacingDigestVisualErrorMessage } from "@/lib/db-timeout-message";
import type { LinkPreviewMeta } from "@/lib/fetch-link-preview-meta";

/** Digest queue Media library column — shared with parent layout for heading + subtext spacing. */
export const DIGEST_MEDIA_LIBRARY_SUBTITLE = "Choose the visual for this signal.";

/** Staged hero (checkmark) vs persisted `digest_cover` hero — **Make hero** commits to the server. */
type StagedHeroPick = { kind: "candidate"; id: string } | { kind: "link_preview" };

function committedHeroPick(bundle: DigestVisualBundle | null): StagedHeroPick | null {
  if (!bundle) return null;
  if (bundle.linkPreviewOnly === true) return { kind: "link_preview" };
  if (bundle.selectedId) return { kind: "candidate", id: bundle.selectedId };
  return null;
}

function heroPicksEqual(a: StagedHeroPick | null, b: StagedHeroPick | null): boolean {
  if (a === null && b === null) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "candidate" && b.kind === "candidate") return a.id === b.id;
  return true;
}

/** Neutral “empty hero” frame (mountain + sun) for the Selected asset placeholder. */
function DigestHeroPlaceholderGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

type VisualTab = "source" | "schematic" | "stock";

/** Which candidates appear in Alternatives (`upload` = user uploads only). */
type AlternativesFilterTab = "all" | VisualTab | "upload";

const UPLOAD_ACCEPT = "image/jpeg,image/jpg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp";
/** ~12 MiB decoded; base64 expands ~4/3 — stay under POST body limits. */
const MAX_DIGEST_UPLOAD_BYTES = 12 * 1024 * 1024;

async function fileToDigestUploadPayload(file: File): Promise<{ base64: string; mime: string; file_name: string }> {
  if (file.size > MAX_DIGEST_UPLOAD_BYTES) {
    throw new Error(`Images must be ${MAX_DIGEST_UPLOAD_BYTES / (1024 * 1024)} MB or smaller.`);
  }
  if (file.type && !/^image\//i.test(file.type)) {
    throw new Error("Choose a JPEG, PNG, GIF, or WebP file.");
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const raw = String(r.result ?? "");
      const marker = ";base64,";
      const idx = raw.indexOf(marker);
      if (!raw.startsWith("data:") || idx === -1) {
        reject(new Error("Could not read that image."));
        return;
      }
      const mimeHeader = raw.slice(5, idx).trim().split(";")[0]!.trim().toLowerCase();
      const mime = mimeHeader === "image/jpg" ? "image/jpeg" : mimeHeader;
      if (!/^image\/(jpeg|png|gif|webp)$/.test(mime)) {
        reject(new Error("Only JPEG, PNG, GIF, or WebP uploads are supported."));
        return;
      }
      const base64 = raw.slice(idx + marker.length).replace(/\s/g, "");
      resolve({ base64, mime, file_name: file.name.trim() });
    };
    r.onerror = () => reject(new Error("Could not read file."));
    r.readAsDataURL(file);
  });
}

function rightsStatusShort(r: DigestVisualCandidate["rights"], isSource: boolean): string {
  switch (r) {
    case "open_access":
      return isSource ? "Source-provided" : "Confirmed";
    case "verify":
      return "Needs review";
    case "unknown":
    default:
      return "Unknown";
  }
}

function altTextStatus(c: DigestVisualCandidate): "Missing" | "Edited" | "Generated" | "Custom" {
  const cap = c.caption?.trim();
  if (!cap) return "Missing";
  if (c.imageAltUserEdited === true) return "Custom";
  if (c.editedFromId || c.editMetadata) return "Edited";
  return "Generated";
}

/** Maps persisted candidate types to filter tabs (`upload` is its own tab, not Illustrated). */
function mapTypeToTab(t: VisualCandidateType): VisualTab | null {
  if (t === "source") return "source";
  if (t === "stock") return "stock";
  if (t === "upload") return null;
  return "schematic";
}

/** AI pipeline outputs — show discard (when pool allows) even if `aiGenerated` was omitted on older rows. */
function isAiGeneratedDigestAlternative(c: DigestVisualCandidate): boolean {
  return (
    c.aiGenerated === true ||
    c.type === "schematic" ||
    c.type === "stock" ||
    c.type === "abstract"
  );
}

function tabLabel(tab: VisualTab): string {
  if (tab === "source") return "Source";
  if (tab === "stock") return "Realistic";
  return "Illustration";
}

function acquireFilterTabButtonClass(selected: boolean): string {
  const base =
    "flex min-h-10 min-w-[5rem] shrink-0 flex-1 items-center justify-center px-2 py-2.5 text-center text-sm font-semibold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)] sm:min-w-0 sm:px-3";
  return `${base} ${
    selected
      ? "bg-[color:var(--accent)]/14 text-[color:var(--foreground)] ring-1 ring-inset ring-[color:var(--accent)]/30"
      : "bg-transparent text-[color:var(--muted-foreground)] hover:bg-[color:var(--muted)]/40 hover:text-[color:var(--foreground)]"
  }`;
}

/** Image model identifier from persisted candidate metadata (`promptUsed.image_model`) or fallback parse of `provenance`. */
function imageModelDescriptor(candidate: DigestVisualCandidate): string | null {
  const pu = candidate.promptUsed?.trim();
  if (pu?.startsWith("{")) {
    try {
      const j = JSON.parse(pu) as { image_model?: string };
      const m = j.image_model?.trim();
      if (m) return m;
    } catch {
      /* ignore */
    }
  }
  const p = candidate.provenance;
  const open = p.indexOf("(");
  const close = p.lastIndexOf(")");
  if (open !== -1 && close > open) {
    const inner = p.slice(open + 1, close).trim();
    const head = inner.split(",")[0]?.trim() ?? "";
    if (/^[\w.-]+$/.test(head) && head.length < 64) return head;
  }
  return null;
}

/** Bold first line under the hero — no model suffix (model + time go on the next line). */
function selectedKindTitle(candidate: DigestVisualCandidate): string {
  const edited =
    Boolean(candidate.editedFromId) ||
    Boolean(candidate.editOriginal) ||
    Boolean(candidate.editMetadata);
  if (candidate.type === "upload") return edited ? "Edited uploaded image" : "Uploaded image";
  if (candidate.type === "source") return edited ? "Edited source image" : "Source image";
  if (candidate.type === "stock")
    return edited ? "Edited generative AI photo-style visual" : "Generative AI photo-style visual";
  return edited ? "Edited generative AI illustration" : "Generative AI illustration";
}

/** Second line: `image_model · M/D/YYYY, H:MM:SS AM` — same pattern as digest summary metadata. */
function imageModelAndGeneratedAtLine(candidate: DigestVisualCandidate): string | null {
  const model = imageModelDescriptor(candidate);
  if (!model) return null;
  const when = new Date(candidate.createdAt).toLocaleString();
  return `${model} · ${when}`;
}

function sortCandidates(candidates: DigestVisualCandidate[]): DigestVisualCandidate[] {
  const order: VisualCandidateType[] = ["source", "schematic", "stock", "abstract", "upload"];
  return [...candidates].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}

/**
 * Merge local + prop candidate pools so the **prop** (`bundle` from parent store) wins on same `id`.
 * The collapsed digest card reads `visualBundle` directly; `localBundle` can lag behind `bundle` when
 * the sync effect keeps a previous snapshot — without this, the Selected asset preview can show stale image data.
 */
function mergeDigestCandidatesForDisplay(
  local: DigestVisualCandidate[] | undefined,
  fromProps: DigestVisualCandidate[] | undefined,
): DigestVisualCandidate[] {
  const map = new Map<string, DigestVisualCandidate>();
  for (const c of local ?? []) map.set(c.id, c);
  for (const c of fromProps ?? []) map.set(c.id, c);
  return sortCandidates(Array.from(map.values()));
}

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

function PreviewIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ChevronScrollIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      {dir === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

/** Carousel tile: square thumbnail, checkmark when selected, preview + discard overlays. */
function AlternativeCarouselTile({
  candidate,
  selected,
  onSelect,
  onPreview,
  canDiscard,
  onDiscard,
  discardBusy,
}: {
  candidate: DigestVisualCandidate;
  selected: boolean;
  onSelect: () => void;
  onPreview: () => void;
  canDiscard?: boolean;
  onDiscard?: () => void;
  discardBusy?: boolean;
}) {
  const src = activeVisualImageDataUrl(candidate);
  const altPreview = candidate.caption?.trim() ? candidate.caption.trim().slice(0, 220) : null;
  const edited =
    Boolean(candidate.editedFromId) || Boolean(candidate.editOriginal) || Boolean(candidate.editMetadata);

  return (
    <div className="relative w-[min(42vw,9.5rem)] shrink-0 snap-start sm:w-40">
      <div
        className={`group relative aspect-square w-full overflow-hidden rounded-xl border-2 bg-[#f5f2ee] shadow-sm transition-all dark:bg-neutral-900/40 ${
          selected
            ? "border-[color:var(--accent)] shadow-[0_0_0_3px_rgba(161,92,76,0.18)] dark:shadow-[0_0_0_3px_rgba(255,255,255,0.08)]"
            : "border-[color:var(--border)]/45 hover:border-[color:var(--border)]/75"
        }`}
      >
        {src ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={altPreview ?? ""}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              decoding="async"
            />
            <button
              type="button"
              className="absolute inset-0 z-[1] rounded-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)]"
              onClick={onSelect}
              aria-pressed={selected}
              aria-label={
                selected ? "Staged for hero — use Make hero to save" : "Choose for digest hero"
              }
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center text-[10px] text-[color:var(--muted-foreground)]">
            No image
          </div>
        )}
        {edited ? (
          <span className="pointer-events-none absolute left-2 top-2 z-[2] rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white backdrop-blur-[2px]">
            Edited
          </span>
        ) : null}
        {selected ? (
          <span className="pointer-events-none absolute right-2 top-2 z-[2] flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800 text-white shadow-md ring-2 ring-white dark:bg-neutral-100 dark:text-neutral-900 dark:ring-neutral-800">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.8" aria-hidden>
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
        ) : null}
        <div className="pointer-events-none absolute bottom-1 left-1 z-[3] opacity-90 transition-opacity duration-150 group-hover:opacity-100">
          <div className="pointer-events-auto flex items-center gap-px rounded-md bg-black/35 p-px shadow-sm ring-1 ring-black/15 backdrop-blur-[3px] dark:bg-black/45 dark:ring-white/10">
            <button
              type="button"
              title="Preview"
              aria-label="Preview image"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPreview();
              }}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-white/95 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <PreviewIcon className="h-3.5 w-3.5 opacity-95" />
            </button>
            {canDiscard && onDiscard ? (
              <button
                type="button"
                title="Remove this option"
                aria-label="Remove candidate"
                disabled={discardBusy}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDiscard();
                }}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-white/95 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:pointer-events-none disabled:opacity-40"
              >
                <TrashIcon className="h-3.5 w-3.5 opacity-95" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkChainIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/** Last tile in Alternatives — same footprint as {@link AlternativeCarouselTile}; hero uses OG thumbnail when available. */
function LinkPreviewOnlyCarouselTile({
  selected,
  disabled,
  title,
  previewThumbUrl,
  hasArticleUrl,
  onStageLinkPreview,
}: {
  selected: boolean;
  disabled: boolean;
  title?: string;
  previewThumbUrl: string | null;
  hasArticleUrl: boolean;
  /** Stage link-preview-only pick (commit with Make hero). */
  onStageLinkPreview: () => void;
}) {
  return (
    <div className="relative w-[min(42vw,9.5rem)] shrink-0 snap-start sm:w-40">
      <div
        className={`group relative aspect-square w-full overflow-hidden rounded-xl border-2 bg-[#f5f2ee] shadow-sm transition-all dark:bg-neutral-900/40 ${
          selected
            ? "border-[color:var(--accent)] shadow-[0_0_0_3px_rgba(161,92,76,0.18)] dark:shadow-[0_0_0_3px_rgba(255,255,255,0.08)]"
            : "border-[color:var(--border)]/45 hover:border-[color:var(--border)]/75"
        } ${disabled ? "opacity-50" : ""}`}
      >
        {previewThumbUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewThumbUrl}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              decoding="async"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-black/75 via-black/40 to-transparent pb-3 pt-14">
              <div className="flex flex-col items-center justify-end gap-2 px-2">
                <LinkChainIcon className="h-7 w-7 shrink-0 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.65)]" />
                <p className="text-center text-xs font-bold uppercase tracking-[0.08em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                  Link preview
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-2 p-2 text-center">
            <LinkChainIcon className="h-10 w-10 shrink-0 text-[color:var(--muted-foreground)]" />
            <p className="text-xs font-bold leading-tight tracking-tight text-[color:var(--foreground)]">Link preview</p>
            <p className="text-[9px] leading-snug text-[color:var(--muted-foreground)]">
              {hasArticleUrl
                ? "Uses the article card instead of a digest image."
                : "Add an http(s) article URL."}
            </p>
          </div>
        )}
        <button
          type="button"
          disabled={disabled}
          title={title}
          aria-pressed={selected}
          aria-label={
            selected
              ? "Staged as link preview only — use Make hero to save"
              : "Stage link preview only for hero"
          }
          onClick={() => {
            if (disabled) return;
            onStageLinkPreview();
          }}
          className="absolute inset-0 z-[1] rounded-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)] disabled:pointer-events-none"
        />
        {selected ? (
          <span className="pointer-events-none absolute right-2 top-2 z-[3] flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800 text-white shadow-md ring-2 ring-white dark:bg-neutral-100 dark:text-neutral-900 dark:ring-neutral-800">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.8" aria-hidden>
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function DigestVisualPanel({
  sourceItemId,
  bundle,
  outputStyle,
  busy,
  onStarted,
  onComplete,
  onDigestCoverStorePersisted,
  disabled,
  digestQueueLayout = false,
  articleUrl,
}: {
  sourceItemId: string;
  bundle: DigestVisualBundle | null;
  /** Which digest output (`output_style`) this panel edits — shared candidate pool, per-channel hero selection. */
  outputStyle: SummaryStyle;
  busy: boolean;
  onStarted: () => void;
  onComplete: () => void;
  /** After each successful save, full multi-channel store from the API — avoids an extra giant Supabase read. */
  onDigestCoverStorePersisted?: (store: DigestCoverStore | null) => void;
  disabled: boolean;
  /** When true (expanded digest card), show acquisition modes and candidates without folding behind “Choose image”. */
  digestQueueLayout?: boolean;
  /** Article URL for Open Graph image when “Link preview only” is selected (expanded digest Media library). */
  articleUrl?: string | null;
}) {
  const [imageEditor, setImageEditor] = useState<{
    candidate: DigestVisualCandidate;
    initialMode: EditorToolTab;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(digestQueueLayout);
  /** Which acquisition/generate action is active (source has no primary button). */
  const [acquireTab, setAcquireTab] = useState<VisualTab>("schematic");
  /** Filters the Alternatives grid only. */
  const [filterTab, setFilterTab] = useState<AlternativesFilterTab>("all");
  /** When set, overrides `committedHeroPick` for checkmarks + Selected asset preview until **Make hero** or server sync. */
  const [stagedHeroOverride, setStagedHeroOverride] = useState<StagedHeroPick | null>(null);
  const [localBundle, setLocalBundle] = useState<DigestVisualBundle | null>(bundle);
  /** Natural dimensions of the selected hero image for overlay placement (`xNorm`/`yNorm`). */
  const [heroNaturalDims, setHeroNaturalDims] = useState<{ w: number; h: number } | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const alternativesScrollRef = useRef<HTMLDivElement>(null);
  const [linkPreviewMeta, setLinkPreviewMeta] = useState<LinkPreviewMeta | null>(null);
  const [linkPreviewFetchStatus, setLinkPreviewFetchStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  /** Keep local bundle aligned with props when switching items/channels (see `key` on parent). Avoid clobbering a fresh selection from `api()` when React has not yet re-rendered the parent with `digest_cover_store` — `bundle` can briefly expose an older hero selection. */
  useEffect(() => {
    if (bundle == null) return;
    setLocalBundle((prev) => {
      if (!prev) return bundle;
      const poolHasPrevHero =
        prev.selectedId != null && bundle.candidates.some((c) => c.id === prev.selectedId);
      const stalePropClearedHero =
        prev.selectedId != null &&
        bundle.selectedId == null &&
        bundle.linkPreviewOnly !== true &&
        poolHasPrevHero;
      if (stalePropClearedHero) return prev;

      /** Parent `bundle` can lag right after `select_link_preview_only` (per-channel `linkPreviewOnly` not merged yet). */
      const wouldDropLinkPreview =
        prev.linkPreviewOnly === true &&
        bundle.linkPreviewOnly !== true &&
        prev.selectedId == null &&
        bundle.selectedId == null;
      if (wouldDropLinkPreview) {
        const tPrev = prev.updatedAt ? Date.parse(prev.updatedAt) : NaN;
        const tNext = bundle.updatedAt ? Date.parse(bundle.updatedAt) : NaN;
        const bundleIsStrictlyNewer =
          Number.isFinite(tPrev) && Number.isFinite(tNext) && tNext > tPrev;
        if (!bundleIsStrictlyNewer) return prev;
      }

      const tPrev = prev.updatedAt ? Date.parse(prev.updatedAt) : NaN;
      const tNext = bundle.updatedAt ? Date.parse(bundle.updatedAt) : NaN;
      if (Number.isFinite(tPrev) && Number.isFinite(tNext) && tNext < tPrev) return prev;

      return bundle;
    });
  }, [bundle]);

  useEffect(() => {
    if (digestQueueLayout) setSelectorOpen(true);
  }, [digestQueueLayout]);

  useEffect(() => {
    const url = articleUrl?.trim();
    if (!url?.startsWith("http")) {
      setLinkPreviewMeta(null);
      setLinkPreviewFetchStatus("idle");
      return;
    }
    let cancelled = false;
    setLinkPreviewFetchStatus("loading");
    setLinkPreviewMeta(null);
    void (async () => {
      try {
        const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
        const data = (await res.json()) as LinkPreviewMeta & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setLinkPreviewFetchStatus("error");
          return;
        }
        setLinkPreviewMeta({
          title: data.title ?? "Link",
          description: data.description ?? "",
          imageUrl: data.imageUrl ?? null,
          siteLabel: data.siteLabel ?? "",
        });
        setLinkPreviewFetchStatus("ready");
      } catch {
        if (!cancelled) setLinkPreviewFetchStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [articleUrl]);

  async function api(
    action:
      | "refresh_all"
      | "select"
      | "discard"
      | "discover_source"
      | "generate_illustration"
      | "generate_stock"
      | "save_cropped"
      | "save_digest_image_edit"
      | "update_illustration_text_layers"
      | "update_digest_candidate_caption"
      | "revert_digest_candidate_image"
      | "upload_digest_visual"
      | "select_link_preview_only"
      | "clear_digest_hero",
    extra?: {
      candidate_id?: string;
      caption?: string;
      base64?: string;
      mime?: string;
      file_name?: string;
      for_candidate_id?: string;
      source_candidate_id?: string;
      edit_metadata?: DigestVisualEditMetadata;
      illustration_text_layers?: DigestIllustrationTextLayer[];
    },
  ) {
    setActionBusy(action);
    onStarted();
    try {
      const body: Record<string, unknown> = {
        action,
        source_item_id: sourceItemId,
        output_style: outputStyle,
      };
      if (extra?.candidate_id) {
        if (
          action === "select" ||
          action === "discard" ||
          action === "revert_digest_candidate_image"
        ) {
          body.candidate_id = extra.candidate_id;
        }
      }
      if (action === "save_cropped" && extra?.base64 && extra?.mime) {
        body.base64 = extra.base64;
        body.mime = extra.mime;
        if (extra.for_candidate_id) body.for_candidate_id = extra.for_candidate_id;
      }
      if (action === "save_digest_image_edit" && extra?.base64 && extra?.mime && extra.edit_metadata != null) {
        body.base64 = extra.base64;
        body.mime = extra.mime;
        body.source_candidate_id = extra.source_candidate_id;
        body.edit_metadata = extra.edit_metadata;
        if (extra.illustration_text_layers != null)
          body.illustration_text_layers = extra.illustration_text_layers;
      }
      if (action === "update_illustration_text_layers" && extra?.candidate_id != null && extra?.illustration_text_layers) {
        body.candidate_id = extra.candidate_id;
        body.illustration_text_layers = extra.illustration_text_layers;
      }
      if (action === "update_digest_candidate_caption" && extra?.candidate_id != null && extra.caption !== undefined) {
        body.candidate_id = extra.candidate_id;
        body.caption = extra.caption;
      }
      if (action === "upload_digest_visual" && extra?.base64 && extra?.mime) {
        body.base64 = extra.base64;
        body.mime = extra.mime;
        if (extra.file_name?.trim()) body.file_name = extra.file_name.trim().slice(0, 200);
      }

      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let httpStatus = 0;
        try {
          const res = await fetch("/api/digest-visuals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          httpStatus = res.status;
          const raw = await res.text();
          let data: {
            error?: string;
            bundle?: DigestVisualBundle | null;
            digest_cover_store?: Json | null;
          };
          try {
            data = JSON.parse(raw) as typeof data;
          } catch {
            throw new Error(
              res.ok ? "Invalid response from server" : `Server returned non-JSON (${res.status})`,
            );
          }
          if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
          if ("bundle" in data) {
            setLocalBundle(data.bundle ?? null);
          }
          if (data.digest_cover_store !== undefined && onDigestCoverStorePersisted) {
            onDigestCoverStorePersisted(
              data.digest_cover_store == null ? null : parseDigestCoverStoreFromDb(data.digest_cover_store),
            );
          }
          if (action === "select") toast.success("Digest hero updated");
          else if (action === "discard") toast.success("Image option removed");
          else if (action === "save_cropped") toast.success("Image snapshot saved");
          else if (action === "save_digest_image_edit") toast.success("Image saved");
          else if (action === "update_illustration_text_layers") toast.success("Labels updated");
          else if (action === "update_digest_candidate_caption") toast.success("Alt text saved");
          else if (action === "revert_digest_candidate_image") toast.success("Restored original image");
          else if (action === "discover_source") toast.success("Source images updated");
          else if (action === "generate_illustration") toast.success("New AI illustrations generated");
          else if (action === "generate_stock") toast.success("AI photo options updated");
          else if (action === "upload_digest_visual") toast.success("Image uploaded");
          else if (action === "select_link_preview_only")
            toast.success("Using link preview — no digest image attached");
          else if (action === "clear_digest_hero") toast.success("Hero cleared");
          else toast.success("Visual options updated");
          if (
            action === "select" ||
            action === "select_link_preview_only" ||
            action === "upload_digest_visual" ||
            action === "clear_digest_hero"
          ) {
            setStagedHeroOverride(null);
          }
          break;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Visual request failed";
          if (attempt < maxAttempts && isDigestVisualTransientFailure(msg, httpStatus)) {
            await new Promise((r) => setTimeout(r, 400 * attempt));
            continue;
          }
          toast.error(userFacingDigestVisualErrorMessage(msg, httpStatus));
          break;
        }
      }
    } finally {
      setActionBusy(null);
      /** Always run after `onStarted`, including on failure — parent clears global busy state here. */
      onComplete();
    }
  }

  async function runUploadDigest(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const payload = await fileToDigestUploadPayload(file);
      await api("upload_digest_visual", {
        base64: payload.base64,
        mime: payload.mime,
        file_name: payload.file_name,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload image");
    }
  }

  const mergedCandidates = useMemo(
    () => mergeDigestCandidatesForDisplay(localBundle?.candidates, bundle?.candidates),
    [localBundle?.candidates, bundle?.candidates],
  );

  const effectiveBundle = useMemo((): DigestVisualBundle | null => {
    const meta = localBundle ?? bundle;
    if (!meta) return null;
    return { ...meta, candidates: mergedCandidates };
  }, [localBundle, bundle, mergedCandidates]);

  const working = busy || actionBusy != null;
  const sorted = mergedCandidates;
  const sourceCandidates = sorted.filter((c) => mapTypeToTab(c.type) === "source");
  const schematicCandidates = sorted.filter((c) => mapTypeToTab(c.type) === "schematic");
  const stockCandidates = sorted.filter((c) => mapTypeToTab(c.type) === "stock");
  const uploadCandidates = sorted.filter((c) => c.type === "upload");
  const committedPick = committedHeroPick(effectiveBundle);
  const displayHeroPick = stagedHeroOverride ?? committedPick;
  const heroChoiceDirty =
    stagedHeroOverride !== null && !heroPicksEqual(stagedHeroOverride, committedPick);
  const active =
    displayHeroPick?.kind === "candidate"
      ? (effectiveBundle?.candidates.find((c) => c.id === displayHeroPick.id) ?? null)
      : null;
  const activeSrc = activeVisualImageDataUrl(active);
  const activeImageModelMetaLine = active ? imageModelAndGeneratedAtLine(active) : null;
  const selectedAssetOverlayLayout = useMemo(
    () =>
      digestHeroIllustrationOverlayLayout(
        heroNaturalDims?.w ?? 0,
        heroNaturalDims?.h ?? 0,
        active,
        active?.illustrationTextLayers ?? [],
      ),
    [active, heroNaturalDims],
  );
  const linkPreviewOnlyMode = displayHeroPick?.kind === "link_preview";
  const ogHeroUrl = linkPreviewMeta?.imageUrl ?? null;
  const hasArticleHttpUrl = Boolean(articleUrl?.trim().startsWith("http"));

  useEffect(() => {
    setHeroNaturalDims(null);
  }, [activeSrc, ogHeroUrl, linkPreviewOnlyMode]);

  /** Digest hero area shows either the selected candidate or link-preview-only states (OG scrape / messaging). */
  const hasDigestHeroImage = Boolean(activeSrc) && !linkPreviewOnlyMode;
  const showSelectedAssetVisual = hasDigestHeroImage || linkPreviewOnlyMode;

  const alternativesForFilter: DigestVisualCandidate[] =
    filterTab === "all"
      ? sorted
      : filterTab === "upload"
        ? uploadCandidates
        : filterTab === "source"
          ? sourceCandidates
          : filterTab === "stock"
            ? stockCandidates
            : schematicCandidates;

  useEffect(() => {
    if (stagedHeroOverride?.kind !== "candidate") return;
    if (sorted.some((c) => c.id === stagedHeroOverride.id)) return;
    setStagedHeroOverride(null);
  }, [sorted, stagedHeroOverride]);

  useEffect(() => {
    if (!imageEditor) return;
    const stillExists = sorted.some((candidate) => candidate.id === imageEditor.candidate.id);
    if (!stillExists) setImageEditor(null);
  }, [imageEditor, sorted]);

  useEffect(() => {
    setImageEditor((prev) => {
      if (!prev || !effectiveBundle) return prev;
      const fresh = effectiveBundle.candidates.find((c) => c.id === prev.candidate.id);
      return fresh ? { ...prev, candidate: fresh } : prev;
    });
  }, [effectiveBundle?.updatedAt]);

  /** Only pick default tab when the chooser opens — not when candidates change (e.g. discard), so tabs stay put. */
  const digestChooserWasOpenRef = useRef(false);
  useEffect(() => {
    if (!digestQueueLayout) {
      digestChooserWasOpenRef.current = false;
      return;
    }
    const wasOpen = digestChooserWasOpenRef.current;
    digestChooserWasOpenRef.current = selectorOpen;
    if (!selectorOpen || wasOpen) return;
    if (sourceCandidates.length > 0) setAcquireTab("source");
    else if (schematicCandidates.length > 0) setAcquireTab("schematic");
    else setAcquireTab("stock");
  }, [
    digestQueueLayout,
    selectorOpen,
    sourceCandidates.length,
    schematicCandidates.length,
    stockCandidates.length,
  ]);

  const showChooser = digestQueueLayout || selectorOpen;
  const hasBundle = effectiveBundle && effectiveBundle.candidates.length > 0;
  const linkPreviewOptionDisabled =
    disabled || working || (!effectiveBundle?.linkPreviewOnly && sorted.length === 0);
  const linkPreviewOptionTitle =
    !disabled && !working && sorted.length === 0 && !effectiveBundle?.linkPreviewOnly
      ? "Add at least one visual option (discover source, generate, or upload) before enabling link preview only."
      : undefined;

  function commitStagedHero() {
    if (!stagedHeroOverride || !heroChoiceDirty) return;
    if (stagedHeroOverride.kind === "link_preview") {
      void api("select_link_preview_only");
    } else {
      void api("select", { candidate_id: stagedHeroOverride.id });
    }
  }

  return (
    <div
      className={
        digestQueueLayout ? "flex min-h-0 flex-1 flex-col gap-5" : "space-y-5"
      }
    >
      {imageEditor ? (
        <DigestImageEditorModal
          candidate={imageEditor.candidate}
          initialMode={imageEditor.initialMode}
          disabled={disabled || working}
          onClose={() => setImageEditor(null)}
          onSaveEdited={async ({ base64, mime, editMetadata, illustrationTextLayers }) => {
            await api("save_digest_image_edit", {
              base64,
              mime,
              source_candidate_id: imageEditor.candidate.id,
              edit_metadata: editMetadata,
              illustration_text_layers: illustrationTextLayers ?? undefined,
            });
          }}
          onSaveIllustrationLayers={async (layers) => {
            await api("update_illustration_text_layers", {
              candidate_id: imageEditor.candidate.id,
              illustration_text_layers: layers,
            });
          }}
          onSaveImageAlt={async (caption) => {
            await api("update_digest_candidate_caption", {
              candidate_id: imageEditor.candidate.id,
              caption,
            });
          }}
          onRevertOriginal={async () => {
            await api("revert_digest_candidate_image", {
              candidate_id: imageEditor.candidate.id,
            });
          }}
        />
      ) : null}

      <section
        className={`rounded-xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/80 p-4 shadow-sm ${
          digestQueueLayout ? "flex shrink-0 flex-col" : ""
        }`}
      >
        <div
          className={`flex flex-wrap items-start justify-between gap-3 ${
            digestQueueLayout ? "shrink-0" : ""
          }`}
        >
          <div>
            {!digestQueueLayout ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
                Selected visual
              </p>
            ) : (
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#3c3836] dark:text-[color:var(--foreground)]">
                Selected asset
              </p>
            )}
            {digestQueueLayout ? (
              <p className="mt-1 max-w-md text-xs leading-relaxed text-[color:var(--muted-foreground)]">
                {showSelectedAssetVisual
                  ? "Preview, edit, or remove the current hero."
                  : "Choose or generate a visual, then make it the hero for this signal."}
              </p>
            ) : null}
            {!digestQueueLayout && !showSelectedAssetVisual ? (
              <p className="mt-1 max-w-md text-sm text-[color:var(--muted-foreground)]">
                {sorted.length > 0 ? (
                  "No visual selected yet. Open options below, stage a thumbnail (checkmark), then Make hero."
                ) : (
                  "No visual selected. Choose a source image, generate an illustration, or add AI photo options."
                )}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {!digestQueueLayout ? (
              <Button
                type="button"
                variant="secondary"
                className="h-10 min-h-10 px-4 text-sm font-medium"
                disabled={disabled || working}
                onClick={() => setSelectorOpen((v) => !v)}
              >
                {selectorOpen ? "Hide options" : "Choose image"}
              </Button>
            ) : null}
            <button
              type="button"
              disabled={!active}
              title="Preview"
              aria-label="Preview selected visual"
              onClick={() => active && setImageEditor({ candidate: active, initialMode: "preview" })}
              className="inline-flex h-10 min-h-10 items-center gap-1.5 rounded-md border border-[color:var(--border)]/60 px-3 text-sm font-medium text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)] disabled:pointer-events-none disabled:opacity-40"
            >
              <PreviewIcon className="h-3.5 w-3.5 shrink-0" />
              Preview
            </button>
            <button
              type="button"
              disabled={!active}
              title="Open image editor"
              aria-label="Edit digest image"
              onClick={() => active && setImageEditor({ candidate: active, initialMode: "crop" })}
              className="inline-flex h-10 min-h-10 items-center gap-1.5 rounded-md border border-[color:var(--border)]/60 px-3 text-sm font-medium text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)] disabled:pointer-events-none disabled:opacity-40"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={disabled || working || !showSelectedAssetVisual}
              title="Remove digest hero for this channel"
              aria-label="Remove selected digest hero"
              onClick={() => {
                if (!window.confirm("Remove this digest hero for this channel? You can choose another below.")) return;
                void api("clear_digest_hero");
              }}
              className="inline-flex h-10 min-h-10 items-center gap-1.5 rounded-md border border-[color:var(--border)]/60 px-3 text-sm font-medium text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)] disabled:pointer-events-none disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        </div>
        {digestQueueLayout && !showSelectedAssetVisual ? (
          <div className="mt-3 flex items-center gap-4 border-t border-[#e5e1de]/90 pt-4 dark:border-[color:var(--border)]/50">
            <div
              className="flex h-[5.25rem] w-[7rem] shrink-0 items-center justify-center rounded-lg border border-[#dcd8d4] bg-[#eceae8] dark:border-neutral-600 dark:bg-neutral-800/90"
              aria-hidden
            >
              <DigestHeroPlaceholderGlyph className="h-10 w-10 text-[#9c948c] dark:text-neutral-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold leading-snug text-[#3c3836] dark:text-[color:var(--foreground)]">
                {sorted.length > 0 ? "No hero selected yet." : "No hero image yet."}
              </p>
              <p className="mt-1 text-sm font-normal leading-relaxed text-[#7c6f64] dark:text-[color:var(--muted-foreground)]">
                {sorted.length > 0
                  ? "Pick a thumbnail in Alternatives — stage a tile (checkmark), then Make hero — or stage Link preview only."
                  : "Acquire visuals below to pull from the article, generate, or upload."}
              </p>
            </div>
          </div>
        ) : null}
        {hasDigestHeroImage && activeSrc ? (
          <div className="relative mt-4 w-full min-w-0 rounded-2xl border border-[#e8e2dc]/90 bg-[#faf6ef] p-3 shadow-[0_14px_44px_-30px_rgba(58,44,34,0.22)] ring-1 ring-[#ebe6df]/45 sm:p-4">
            <div className="flex w-full min-h-0 justify-center overflow-auto">
              <div
                key={active?.id ?? "hero"}
                className="relative mx-auto max-w-full inline-block align-top"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeSrc}
                  alt={active?.caption?.trim() ? active.caption.trim().slice(0, 220) : ""}
                  className="box-border h-auto max-h-[min(42rem,80vh)] w-auto max-w-full rounded-xl object-contain object-center shadow-[0_8px_32px_-16px_rgba(48,36,28,0.35)] ring-1 ring-black/[0.07]"
                  decoding="async"
                  onLoad={(e) => {
                    const i = e.currentTarget;
                    if (i.naturalWidth > 0 && i.naturalHeight > 0) {
                      setHeroNaturalDims({ w: i.naturalWidth, h: i.naturalHeight });
                    }
                  }}
                />
                {active?.type === "schematic" ? (
                  <DigestIllustrationOverlays
                    layers={active.illustrationTextLayers ?? []}
                    naturalSize={selectedAssetOverlayLayout.naturalSize}
                    cropNatural={selectedAssetOverlayLayout.cropNatural}
                    layoutBoxPx={selectedAssetOverlayLayout.layoutBoxPx}
                    layoutCoordinateSpace={selectedAssetOverlayLayout.layoutCoordinateSpace}
                  />
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        {linkPreviewOnlyMode ? (
          <div className="relative mt-4 w-full min-w-0 rounded-xl border border-[color:var(--border)]/55 bg-[#faf6ef] p-3 ring-1 ring-[color:var(--border)]/25 sm:p-4">
            <div className="flex w-full min-h-0 justify-center overflow-auto">
              {!hasArticleHttpUrl ? (
                <p className="max-w-md px-2 py-8 text-center text-sm text-[color:var(--muted-foreground)]">
                  Add a valid <span className="font-medium text-[color:var(--foreground)]">http(s)</span> article URL on
                  this signal to load the preview image platforms may use for the link card.
                </p>
              ) : linkPreviewFetchStatus === "loading" ? (
                <div className="flex justify-center px-2 py-16">
                  <RenderingStatus
                    variant="compact"
                    label="Loading link preview…"
                    description={null}
                    className="min-h-0 py-0"
                  />
                </div>
              ) : linkPreviewFetchStatus === "error" ? (
                <p className="max-w-md px-2 py-8 text-center text-sm text-[color:var(--muted-foreground)]">
                  Couldn&apos;t fetch link preview metadata. Check the article URL or try again later.
                </p>
              ) : ogHeroUrl ? (
                <div className="relative mx-auto max-w-full inline-block align-top">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ogHeroUrl}
                    alt={linkPreviewMeta?.title ? linkPreviewMeta.title.slice(0, 220) : "Article link preview image"}
                    className="box-border h-auto max-h-[min(42rem,80vh)] w-auto max-w-full object-contain object-center"
                    decoding="async"
                    onLoad={(e) => {
                      const i = e.currentTarget;
                      if (i.naturalWidth > 0 && i.naturalHeight > 0) {
                        setHeroNaturalDims({ w: i.naturalWidth, h: i.naturalHeight });
                      }
                    }}
                  />
                </div>
              ) : (
                <p className="max-w-md px-2 py-8 text-center text-sm text-[color:var(--muted-foreground)]">
                  No Open Graph image was returned for this URL. Social platforms may still show a title and snippet, or
                  a generic link card.
                </p>
              )}
            </div>
          </div>
        ) : null}
        {active ? (
          <div className={`mt-3 space-y-1 text-xs ${digestQueueLayout ? "shrink-0" : ""}`}>
            <div className="space-y-0.5">
              <p className="font-semibold text-[color:var(--foreground)]">{selectedKindTitle(active)}</p>
              {activeImageModelMetaLine ? (
                <p className="tabular-nums text-[color:var(--muted-foreground)]">{activeImageModelMetaLine}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-[color:var(--muted-foreground)]">
              <span className="rounded-md border border-[color:var(--border)]/65 bg-[color:var(--muted)]/25 px-2 py-0.5 font-medium text-[color:var(--foreground)]/90">
                Rights · {rightsStatusShort(active.rights, active.type === "source")}
              </span>
              <span className="rounded-md border border-[color:var(--border)]/65 bg-[color:var(--muted)]/18 px-2 py-0.5 font-medium">
                Alt · {altTextStatus(active)}
              </span>
            </div>
          </div>
        ) : linkPreviewOnlyMode ? (
          <div className={`mt-3 space-y-1 text-xs ${digestQueueLayout ? "shrink-0" : ""}`}>
            <p className="font-semibold text-[color:var(--foreground)]">Article link preview</p>
            {linkPreviewMeta?.siteLabel?.trim() ? (
              <p className="text-[color:var(--muted-foreground)]">{linkPreviewMeta.siteLabel.trim()}</p>
            ) : null}
            {linkPreviewMeta?.title?.trim() ? (
              <p className="text-[color:var(--muted-foreground)] line-clamp-2">{linkPreviewMeta.title.trim()}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      {showChooser ? (
        <section
          className={`space-y-4 rounded-xl border border-[color:var(--border)]/55 bg-[color:var(--background)]/60 p-4 ${
            digestQueueLayout ? "shrink-0" : ""
          }`}
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--foreground)]/80">
              Acquire visuals
            </p>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
              Add or generate visual options.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="-mx-0.5 overflow-x-auto overflow-y-hidden rounded-lg pb-px sm:mx-0">
              <nav
                className="flex min-w-min flex-nowrap divide-x divide-[color:var(--border)]/55 overflow-hidden rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)]/95 shadow-[0_1px_3px_rgba(55,42,36,0.07)]"
                role="tablist"
                aria-label="Visual categories"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={filterTab === "all"}
                  onClick={() => {
                    setFilterTab("all");
                    setAcquireTab("schematic");
                  }}
                  className={acquireFilterTabButtonClass(filterTab === "all")}
                >
                  All
                </button>
                {(["source", "schematic", "stock"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={filterTab === tab}
                    onClick={() => {
                      setFilterTab(tab);
                      setAcquireTab(tab);
                      if (tab === "source" && sourceCandidates.length === 0) {
                        void api("discover_source");
                      }
                    }}
                    className={acquireFilterTabButtonClass(filterTab === tab)}
                  >
                    {tabLabel(tab)}
                  </button>
                ))}
                <button
                  type="button"
                  role="tab"
                  aria-selected={filterTab === "upload"}
                  title="Show uploads — add your own image"
                  onClick={() => setFilterTab("upload")}
                  className={acquireFilterTabButtonClass(filterTab === "upload")}
                >
                  Upload
                </button>
              </nav>
            </div>
            {filterTab === "upload" ? (
              <div className="rounded-xl border border-[color:var(--border)]/55 bg-[color:var(--card)]/85 px-3 py-3">
                <p className="text-[11px] leading-snug text-[color:var(--muted-foreground)]">
                  JPEG, PNG, GIF, or WebP — up to {MAX_DIGEST_UPLOAD_BYTES / (1024 * 1024)} MB. The new file is added here
                  and becomes the selected hero until you pick another tile.
                </p>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept={UPLOAD_ACCEPT}
                  className="sr-only"
                  aria-hidden
                  onChange={(e) => {
                    void runUploadDigest(e.target.files).finally(() => {
                      if (uploadInputRef.current) uploadInputRef.current.value = "";
                    });
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-2 h-9 px-4 text-xs font-semibold sm:h-10 sm:text-sm"
                  disabled={disabled || working}
                  onClick={() => uploadInputRef.current?.click()}
                >
                  {actionBusy === "upload_digest_visual" ? "Uploading…" : "Upload image"}
                </Button>
              </div>
            ) : null}
          </div>

          {digestQueueLayout ? (
            <div className="border-t border-[color:var(--border)]/40 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--foreground)]/80">
                Alternatives
              </p>
              <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                Click a tile to stage it (checkmark). Use <span className="font-medium">Make hero</span> to save what
                publishes with this signal.
              </p>
              {!hasBundle ? (
                <p className="mt-3 rounded-lg border border-dashed border-[color:var(--border)]/60 bg-[color:var(--muted)]/10 px-3 py-6 text-center text-sm text-[color:var(--muted-foreground)]">
                  No candidates yet. Pick All or a source above, then run the action.
                </p>
              ) : sorted.length === 0 ? (
                <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">No visuals in this bundle.</p>
              ) : alternativesForFilter.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed border-[color:var(--border)]/55 bg-[color:var(--muted)]/10 px-3 py-5 text-center text-sm text-[color:var(--muted-foreground)]">
                  {filterTab === "upload"
                    ? "No uploads yet. Use Upload image in the Acquire section above."
                    : "No visuals match this filter. Choose All to see every option."}
                </p>
              ) : (
                <div className="relative mt-4">
                  <button
                    type="button"
                    className="absolute left-0 top-1/2 z-[4] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[color:var(--border)]/60 bg-[color:var(--card)]/95 text-[color:var(--muted-foreground)] shadow-sm hover:bg-[color:var(--muted)]/30 md:flex"
                    aria-label="Scroll left"
                    onClick={() => alternativesScrollRef.current?.scrollBy({ left: -280, behavior: "smooth" })}
                  >
                    <ChevronScrollIcon dir="left" />
                  </button>
                  <div
                    ref={alternativesScrollRef}
                    className="flex gap-3 overflow-x-auto pb-2 pl-0.5 pr-0.5 pt-1 [-webkit-overflow-scrolling:touch] snap-x snap-mandatory md:mx-9 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color:var(--border)]/70"
                  >
                    {alternativesForFilter.map((candidate) => (
                      <AlternativeCarouselTile
                        key={candidate.id}
                        candidate={candidate}
                        selected={
                          displayHeroPick?.kind === "candidate" && displayHeroPick.id === candidate.id
                        }
                        canDiscard={
                          sorted.length > 1 &&
                          (candidate.type === "upload" ||
                            Boolean(candidate.editedFromId) ||
                            isAiGeneratedDigestAlternative(candidate))
                        }
                        discardBusy={actionBusy === "discard"}
                        onDiscard={() => {
                          if (!window.confirm("Remove this image option from the digest?")) return;
                          void api("discard", { candidate_id: candidate.id });
                        }}
                        onPreview={() => setImageEditor({ candidate, initialMode: "preview" })}
                        onSelect={() => setStagedHeroOverride({ kind: "candidate", id: candidate.id })}
                      />
                    ))}
                    <LinkPreviewOnlyCarouselTile
                      selected={displayHeroPick?.kind === "link_preview"}
                      disabled={linkPreviewOptionDisabled}
                      title={linkPreviewOptionTitle}
                      previewThumbUrl={ogHeroUrl}
                      hasArticleUrl={hasArticleHttpUrl}
                      onStageLinkPreview={() => setStagedHeroOverride({ kind: "link_preview" })}
                    />
                  </div>
                  <button
                    type="button"
                    className="absolute right-0 top-1/2 z-[4] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[color:var(--border)]/60 bg-[color:var(--card)]/95 text-[color:var(--muted-foreground)] shadow-sm hover:bg-[color:var(--muted)]/30 md:flex"
                    aria-label="Scroll right"
                    onClick={() => alternativesScrollRef.current?.scrollBy({ left: 280, behavior: "smooth" })}
                  >
                    <ChevronScrollIcon dir="right" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="border-t border-[color:var(--border)]/45 pt-4">
              {!hasBundle ? (
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  No candidates yet. Pick All or a source above, then run the action.
                </p>
              ) : alternativesForFilter.length === 0 ? (
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  {filterTab === "upload"
                    ? "Nothing uploaded yet. Use Upload image in the Acquire section above."
                    : filterTab === "all"
                      ? "No visuals in this bundle."
                      : filterTab === "stock"
                        ? "No realistic options match this filter. Use Generate below or choose All."
                        : filterTab === "source"
                          ? "No article figures match this filter. Use Source or choose All."
                          : "No illustration options match this filter. Use Generate below or choose All."}
                </p>
              ) : (
                <div className="relative mt-4">
                  <button
                    type="button"
                    className="absolute left-0 top-1/2 z-[4] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[color:var(--border)]/60 bg-[color:var(--card)]/95 text-[color:var(--muted-foreground)] shadow-sm hover:bg-[color:var(--muted)]/30 md:flex"
                    aria-label="Scroll left"
                    onClick={() => alternativesScrollRef.current?.scrollBy({ left: -280, behavior: "smooth" })}
                  >
                    <ChevronScrollIcon dir="left" />
                  </button>
                  <div
                    ref={alternativesScrollRef}
                    className="flex gap-3 overflow-x-auto pb-2 pl-0.5 pr-0.5 pt-1 [-webkit-overflow-scrolling:touch] snap-x snap-mandatory md:mx-9 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color:var(--border)]/70"
                  >
                    {alternativesForFilter.map((candidate) => (
                      <AlternativeCarouselTile
                        key={candidate.id}
                        candidate={candidate}
                        selected={
                          displayHeroPick?.kind === "candidate" && displayHeroPick.id === candidate.id
                        }
                        canDiscard={
                          sorted.length > 1 &&
                          (candidate.type === "upload" ||
                            Boolean(candidate.editedFromId) ||
                            isAiGeneratedDigestAlternative(candidate))
                        }
                        discardBusy={actionBusy === "discard"}
                        onDiscard={() => {
                          if (!window.confirm("Remove this image option from the digest?")) return;
                          void api("discard", { candidate_id: candidate.id });
                        }}
                        onPreview={() => setImageEditor({ candidate, initialMode: "preview" })}
                        onSelect={() => setStagedHeroOverride({ kind: "candidate", id: candidate.id })}
                      />
                    ))}
                    <LinkPreviewOnlyCarouselTile
                      selected={displayHeroPick?.kind === "link_preview"}
                      disabled={linkPreviewOptionDisabled}
                      title={linkPreviewOptionTitle}
                      previewThumbUrl={ogHeroUrl}
                      hasArticleUrl={hasArticleHttpUrl}
                      onStageLinkPreview={() => setStagedHeroOverride({ kind: "link_preview" })}
                    />
                  </div>
                  <button
                    type="button"
                    className="absolute right-0 top-1/2 z-[4] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[color:var(--border)]/60 bg-[color:var(--card)]/95 text-[color:var(--muted-foreground)] shadow-sm hover:bg-[color:var(--muted)]/30 md:flex"
                    aria-label="Scroll right"
                    onClick={() => alternativesScrollRef.current?.scrollBy({ left: 280, behavior: "smooth" })}
                  >
                    <ChevronScrollIcon dir="right" />
                  </button>
                </div>
              )}
            </div>
          )}

          {filterTab === "schematic" || filterTab === "stock" ? (
            <div className="border-t border-[color:var(--border)]/40 pt-4">
              <div className="flex flex-wrap items-center justify-start gap-3">
                <Button
                  type="button"
                  variant="primary"
                  className="h-10 min-h-10 w-full max-w-xs shrink-0 justify-center gap-2 px-5 text-sm font-semibold sm:w-fit"
                  disabled={disabled || working}
                  title={
                    filterTab === "schematic"
                      ? "Runs the illustration model on this signal’s title and summary to add BioRender-style options."
                      : "Runs the realistic-style image agent on this signal (options appear when available)."
                  }
                  onClick={() =>
                    void api(filterTab === "schematic" ? "generate_illustration" : "generate_stock")
                  }
                >
                  <SparklesIcon className="h-4 w-4 shrink-0 opacity-95" />
                  {actionBusy === (filterTab === "schematic" ? "generate_illustration" : "generate_stock")
                    ? "Generating visuals…"
                    : "Generate visuals"}
                </Button>
                {hasBundle && sorted.length > 0 ? (
                  <Button
                    type="button"
                    variant="primary"
                    className="h-10 min-h-10 w-full max-w-xs shrink-0 justify-center gap-2 px-5 text-sm font-semibold sm:w-fit"
                    disabled={disabled || working || !heroChoiceDirty}
                    title={
                      heroChoiceDirty
                        ? "Save the checkmarked choice as the digest hero for this channel."
                        : "Pick a thumbnail or Link preview first — checkmark shows your draft choice."
                    }
                    onClick={() => commitStagedHero()}
                  >
                    <BookmarkIcon className="h-4 w-4 shrink-0 opacity-95" />
                    {actionBusy === "select" || actionBusy === "select_link_preview_only"
                      ? "Saving…"
                      : "Make hero"}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {filterTab !== "schematic" &&
          filterTab !== "stock" &&
          hasBundle &&
          sorted.length > 0 ? (
            <div className="border-t border-[color:var(--border)]/40 pt-4">
              <div className="flex flex-wrap justify-start gap-3">
                <Button
                  type="button"
                  variant="primary"
                  className="h-10 min-h-10 w-full max-w-xs shrink-0 justify-center gap-2 px-5 text-sm font-semibold sm:w-fit"
                  disabled={disabled || working || !heroChoiceDirty}
                  title={
                    heroChoiceDirty
                      ? "Save the checkmarked choice as the digest hero for this channel."
                      : "Pick a thumbnail or Link preview first — checkmark shows your draft choice."
                  }
                  onClick={() => commitStagedHero()}
                >
                  <BookmarkIcon className="h-4 w-4 shrink-0 opacity-95" />
                  {actionBusy === "select" || actionBusy === "select_link_preview_only"
                    ? "Saving…"
                    : "Make hero"}
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
