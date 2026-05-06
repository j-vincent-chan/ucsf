import type { Json, SummaryStyle } from "@/types/database";

/** Legacy single-image shape stored in `source_items.digest_cover` before v2. */
export type LegacyDigestCoverPayload =
  | { kind: "url"; url: string; source: string }
  | { kind: "inline"; mime: string; base64: string; source: string };

export type VisualCandidateType = "source" | "schematic" | "stock" | "abstract" | "upload";

/** Preset region when a layer has no custom `xNorm`/`yNorm` (e.g. model-extracted defaults). */
export const ILLUSTRATION_LABEL_ANCHORS = [
  "top",
  "top-left",
  "top-right",
  "bottom",
  "bottom-left",
  "bottom-right",
  "center",
] as const;

export type IllustrationLabelAnchor = (typeof ILLUSTRATION_LABEL_ANCHORS)[number];

/** Default overlay typography when `fontSizePx` is omitted (responsive sizing still applies in the renderer). */
export const DEFAULT_ILLUSTRATION_LABEL_FONT_PX = 22;

/** Text drawn as HTML overlays on schematic AI assets (pixels stay label-free after new pipeline). */
export type DigestIllustrationTextLayer = {
  id: string;
  /** When `xNorm`/`yNorm` are unset, layout falls back to this preset region. */
  anchor?: IllustrationLabelAnchor;
  text: string;
  /** CSS px for this label; omit to use the renderer’s responsive default. */
  fontSizePx?: number;
  /** Rich text style for the label (optional; default is medium weight, not italic, not underlined). */
  fontBold?: boolean;
  fontItalic?: boolean;
  fontUnderline?: boolean;
  /** Uniform padding (px) for the label pill background; omit for responsive default padding in the renderer. */
  pillPaddingPx?: number;
  /** Bubble color swatch index (0–4). Omit for deterministic hash from layer id + stack index. */
  pillSurfaceIndex?: number;
  /** Custom placement on the natural image (0–1). When both are set, they override `anchor` layout. */
  xNorm?: number;
  yNorm?: number;
};

export type RightsHint = "open_access" | "unknown" | "verify";

/** Stored on edited digest visual candidates for audit and re-open. */
export type DigestImageAspectPreset = "original" | "16:9" | "1:1" | "4:5" | "freeform";

/** Snapshot of the visual payload before the first in-place edit (revert restores this). */
export type DigestVisualOriginalSnapshot = {
  kind: "url" | "inline";
  url?: string;
  mime?: string;
  base64?: string;
};

export type DigestVisualEditMetadata = {
  v: 1;
  originalCandidateId: string;
  /** Natural pixel size of the source image when the edit was saved — positions label `xNorm`/`yNorm` in overlay math. */
  sourceNaturalPixels?: { w: number; h: number };
  aspectPreset?: DigestImageAspectPreset;
  cropPixels: { x: number; y: number; w: number; h: number };
  resizePixels: { w: number; h: number };
  lockAspect: boolean;
  adjustments: {
    brightness: number;
    contrast: number;
    saturation: number;
    warmth: number;
    sharpness: number;
  };
  filterId: string;
  editedAt: string;
};

export type DigestVisualCandidate = {
  id: string;
  type: VisualCandidateType;
  kind: "url" | "inline";
  url?: string;
  mime?: string;
  base64?: string;
  provenance: string;
  sourceDetail?: string;
  caption?: string;
  /** Set when the user saved image alt text from the digest editor (distinct from source-extracted or pipeline defaults). */
  imageAltUserEdited?: boolean;
  rights: RightsHint;
  rightsNote?: string;
  aiGenerated: boolean;
  promptUsed?: string;
  rationale: string;
  createdAt: string;
  /**
   * Editable label overlays for schematic-style AI thumbnails (stored in bundle JSON, not baked into base image).
   * Empty/omitted = no overlays.
   */
  illustrationTextLayers?: DigestIllustrationTextLayer[];
  /** Present when this candidate is an edited derivative; original row stays in the bundle. */
  editedFromId?: string;
  editMetadata?: DigestVisualEditMetadata;
  /** First-import pixels/URL before any in-place save; used to restore the original asset. */
  editOriginal?: DigestVisualOriginalSnapshot;
  /** 1–5, optional lightweight scoring for UI */
  scores?: {
    relevance: number;
    fidelity: number;
    editorial: number;
    risk: number;
    rightsConfidence: number;
  };
};

export type DigestVisualBundle = {
  v: 2;
  selectedId: string | null;
  /**
   * When true, no digest candidate is used as the hero: posts use the source article URL (link preview / OG),
   * and `getActiveCandidate` returns null even if options exist in `candidates`.
   * When false/unset, the hero is whichever candidate `selectedId` points to — no implicit default.
   */
  linkPreviewOnly?: boolean;
  /** Classifier / planner output for transparency */
  strategies?: string[];
  candidates: DigestVisualCandidate[];
  updatedAt?: string;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function legacyCoverToBundle(legacy: LegacyDigestCoverPayload): DigestVisualBundle {
  const id = newId();
  if (legacy.kind === "url") {
    return {
      v: 2,
      selectedId: id,
      strategies: ["source_figure"],
      candidates: [
        {
          id,
          type: "source",
          kind: "url",
          url: legacy.url,
          provenance: legacy.source === "pmc_article_image" ? "PubMed / PMC" : "Source page",
          sourceDetail: legacy.url,
          rights: legacy.source === "pmc_article_image" ? "open_access" : "verify",
          rightsNote:
            legacy.source === "pmc_article_image"
              ? "PMC is generally open; verify for your use case."
              : "Source image — verify usage rights before publication.",
          aiGenerated: false,
          rationale: "Image associated with the source article (migrated from previous digest).",
          createdAt: new Date().toISOString(),
          scores: { relevance: 4, fidelity: 4, editorial: 3, risk: 2, rightsConfidence: 3 },
        },
      ],
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    v: 2,
    selectedId: id,
    strategies: ["ai_editorial"],
    candidates: [
      {
        id,
        type: "abstract",
        kind: "inline",
        mime: legacy.mime,
        base64: legacy.base64,
        provenance: legacy.source === "dall-e-3" ? "AI-generated (DALL·E 3)" : "AI-generated",
        rights: "unknown",
        rightsNote: "AI-generated image. Not real experimental data.",
        aiGenerated: true,
        rationale: "Previously selected digest illustration (migrated).",
        createdAt: new Date().toISOString(),
        scores: { relevance: 3, fidelity: 3, editorial: 3, risk: 3, rightsConfidence: 4 },
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Parse `digest_cover` jsonb: supports v2 bundle or legacy single cover.
 * Returns null if empty/invalid.
 */
export function parseDigestVisualBundleFromDb(raw: unknown): DigestVisualBundle | null {
  if (raw == null) return null;
  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v === 2 && Array.isArray(o.candidates)) {
    const candidates = o.candidates as DigestVisualCandidate[];
    /** Slim per-channel slices use `candidates: []` + `selectedId` / `linkPreviewOnly` only — must round-trip. */
    if (candidates.length === 0) {
      return {
        v: 2,
        selectedId: typeof o.selectedId === "string" ? o.selectedId : null,
        linkPreviewOnly: o.linkPreviewOnly === true,
        strategies: Array.isArray(o.strategies) ? (o.strategies as string[]) : undefined,
        candidates: [],
        updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
      };
    }
    return {
      v: 2,
      selectedId: typeof o.selectedId === "string" ? o.selectedId : null,
      linkPreviewOnly: o.linkPreviewOnly === true,
      strategies: Array.isArray(o.strategies) ? (o.strategies as string[]) : undefined,
      candidates,
      updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
    };
  }
  if (o.kind === "url" && typeof o.url === "string" && o.url.startsWith("http")) {
    return legacyCoverToBundle({
      kind: "url",
      url: o.url,
      source: typeof o.source === "string" ? o.source : "unknown",
    });
  }
  if (
    o.kind === "inline" &&
    typeof o.base64 === "string" &&
    typeof o.mime === "string" &&
    o.mime.startsWith("image/")
  ) {
    return legacyCoverToBundle({
      kind: "inline",
      mime: o.mime,
      base64: o.base64,
      source: typeof o.source === "string" ? o.source : "unknown",
    });
  }
  return null;
}

export function getActiveCandidate(bundle: DigestVisualBundle | null): DigestVisualCandidate | null {
  if (!bundle || bundle.candidates.length === 0) return null;
  if (bundle.linkPreviewOnly === true) return null;
  if (!bundle.selectedId) return null;
  return bundle.candidates.find((x) => x.id === bundle.selectedId) ?? null;
}

export function activeVisualImageDataUrl(candidate: DigestVisualCandidate | null): string | null {
  if (!candidate) return null;
  if (candidate.kind === "url" && candidate.url) return candidate.url;
  if (candidate.kind === "inline" && candidate.base64 && candidate.mime) {
    return `data:${candidate.mime};base64,${candidate.base64}`;
  }
  return null;
}

export function hasActiveVisual(bundle: DigestVisualBundle | null): boolean {
  return getActiveCandidate(bundle) != null;
}

/** True when the user has chosen a digest hero: a specific image, or explicit link-preview-only mode. */
export function hasDigestHeroSelection(bundle: DigestVisualBundle | null): boolean {
  if (!bundle) return false;
  if (bundle.linkPreviewOnly === true) return true;
  if (bundle.candidates.length === 0) return false;
  return Boolean(bundle.selectedId && bundle.candidates.some((c) => c.id === bundle.selectedId));
}

export function bundleToJson(bundle: DigestVisualBundle): Json {
  return bundle as unknown as Json;
}

/** Monthly digest outputs that may each carry their own hero visual bundle (stored under `digest_cover.v3`). */
export const DIGEST_VISUAL_CHANNEL_STYLES = ["bluesky_x", "newsletter", "linkedin"] as const satisfies readonly SummaryStyle[];

export type DigestVisualChannelStyle = (typeof DIGEST_VISUAL_CHANNEL_STYLES)[number];

export function isDigestVisualChannelStyle(s: SummaryStyle): s is DigestVisualChannelStyle {
  return (DIGEST_VISUAL_CHANNEL_STYLES as readonly SummaryStyle[]).includes(s);
}

/**
 * Normalized in-memory shape for `source_items.digest_cover`.
 * - Canonical **candidate pool** + **Newsletter** hero live on `fallback`.
 * - `channels.bluesky_x` / `channels.linkedin` may hold slim bundles (`candidates: []`) that only override hero
 *   (`selectedId`, `linkPreviewOnly`) while sharing the merged pool across outputs.
 */
export type DigestCoverStore = {
  v: 3;
  fallback: DigestVisualBundle | null;
  channels: Partial<Record<DigestVisualChannelStyle, DigestVisualBundle>>;
};

export function parseDigestCoverStoreFromDb(raw: unknown): DigestCoverStore {
  if (raw != null && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (o.v === 3 && o.channels != null && typeof o.channels === "object") {
      const channels: Partial<Record<DigestVisualChannelStyle, DigestVisualBundle>> = {};
      for (const key of DIGEST_VISUAL_CHANNEL_STYLES) {
        const ch = (o.channels as Record<string, unknown>)[key];
        if (ch != null) {
          const b = parseDigestVisualBundleFromDb(ch);
          if (b) channels[key] = b;
        }
      }
      const fallback =
        o.fallback != null ? parseDigestVisualBundleFromDb(o.fallback) : null;
      return { v: 3, fallback, channels };
    }
  }
  const legacy = parseDigestVisualBundleFromDb(raw);
  return { v: 3, fallback: legacy, channels: {} };
}

/** Union of candidate rows across fallback + legacy per-channel duplicates (same id appears once). */
export function mergeDigestCandidatePoolAcrossStore(store: DigestCoverStore): DigestVisualCandidate[] {
  const seen = new Set<string>();
  const out: DigestVisualCandidate[] = [];
  const take = (bundle: DigestVisualBundle | null | undefined) => {
    if (!bundle) return;
    for (const c of bundle.candidates) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  };
  take(store.fallback);
  for (const st of DIGEST_VISUAL_CHANNEL_STYLES) take(store.channels[st]);
  return out;
}

function digestCoverNewsletterBaseSelection(store: DigestCoverStore): {
  selectedId: string | null;
  linkPreviewOnly: boolean;
} {
  const fb = store.fallback;
  const nw = store.channels.newsletter;
  if (nw) {
    return {
      selectedId: nw.selectedId !== undefined ? nw.selectedId : (fb?.selectedId ?? null),
      linkPreviewOnly:
        nw.linkPreviewOnly !== undefined ? nw.linkPreviewOnly === true : (fb?.linkPreviewOnly === true),
    };
  }
  return {
    selectedId: fb?.selectedId ?? null,
    linkPreviewOnly: fb?.linkPreviewOnly === true,
  };
}

/**
 * Shared **Media library** (merged candidates) with per-output hero selection.
 * Newsletter defaults live on `fallback`; Social / LinkedIn may override hero only.
 */
export function getBundleForChannel(
  store: DigestCoverStore,
  style: DigestVisualChannelStyle,
): DigestVisualBundle | null {
  const candidates = mergeDigestCandidatePoolAcrossStore(store);
  const fb = store.fallback;
  if (!candidates.length && !fb) return null;

  let { selectedId, linkPreviewOnly } = digestCoverNewsletterBaseSelection(store);
  if (style !== "newsletter") {
    const ov = store.channels[style];
    if (ov) {
      if (ov.selectedId !== undefined) selectedId = ov.selectedId;
      if (ov.linkPreviewOnly !== undefined) linkPreviewOnly = ov.linkPreviewOnly === true;
    }
  }

  return {
    v: 2,
    candidates,
    selectedId,
    linkPreviewOnly,
    strategies: fb?.strategies,
    updatedAt: fb?.updatedAt,
  };
}

export type DigestCoverChannelSelectionSnapshot = Record<
  DigestVisualChannelStyle,
  { selectedId: string | null; linkPreviewOnly: boolean }
>;

/** Effective hero toggle per digest output tab. */
export function digestCoverSelectionsSnapshot(store: DigestCoverStore): DigestCoverChannelSelectionSnapshot {
  const snap = {} as DigestCoverChannelSelectionSnapshot;
  for (const st of DIGEST_VISUAL_CHANNEL_STYLES) {
    const b = getBundleForChannel(store, st);
    snap[st] = {
      selectedId: b?.selectedId ?? null,
      linkPreviewOnly: b?.linkPreviewOnly === true,
    };
  }
  return snap;
}

function cloneSelectionSnapshot(snap: DigestCoverChannelSelectionSnapshot): DigestCoverChannelSelectionSnapshot {
  const out = {} as DigestCoverChannelSelectionSnapshot;
  for (const st of DIGEST_VISUAL_CHANNEL_STYLES) {
    out[st] = { ...snap[st] };
  }
  return out;
}

function pruneSelectionSnapshotToPool(
  snap: DigestCoverChannelSelectionSnapshot,
  candidateIds: Set<string>,
): void {
  const firstSurvivor =
    candidateIds.size > 0 ? (Array.from(candidateIds)[0] as string | undefined) ?? null : null;

  const newsletterPick =
    snap.newsletter.selectedId && candidateIds.has(snap.newsletter.selectedId)
      ? snap.newsletter.selectedId
      : firstSurvivor;

  for (const st of DIGEST_VISUAL_CHANNEL_STYLES) {
    const row = snap[st];
    if (row.linkPreviewOnly && candidateIds.size === 0) {
      row.linkPreviewOnly = false;
      row.selectedId = null;
    }
    if (row.linkPreviewOnly) continue;

    if (row.selectedId && candidateIds.has(row.selectedId)) continue;

    row.selectedId = st === "newsletter" ? newsletterPick : newsletterPick ?? firstSurvivor;
  }
}

/** After a pool-level mutation: keep per-channel heroes when possible; prune removed candidate ids. */
export function digestCoverRebuildFromPoolAndSelections(
  snapBefore: DigestCoverChannelSelectionSnapshot,
  poolBundleAfter: DigestVisualBundle,
): DigestCoverStore {
  const snap = cloneSelectionSnapshot(snapBefore);
  pruneSelectionSnapshotToPool(snap, new Set(poolBundleAfter.candidates.map((c) => c.id)));

  const fallback: DigestVisualBundle = {
    ...poolBundleAfter,
    candidates: poolBundleAfter.candidates,
    selectedId: snap.newsletter.selectedId,
    linkPreviewOnly: snap.newsletter.linkPreviewOnly,
  };

  const channels: Partial<Record<DigestVisualChannelStyle, DigestVisualBundle>> = {};
  const nw = snap.newsletter;
  for (const st of DIGEST_VISUAL_CHANNEL_STYLES) {
    if (st === "newsletter") continue;
    const ch = snap[st];
    if (ch.selectedId === nw.selectedId && ch.linkPreviewOnly === nw.linkPreviewOnly) continue;
    channels[st] = {
      v: 2,
      candidates: [],
      selectedId: ch.selectedId,
      linkPreviewOnly: ch.linkPreviewOnly,
      updatedAt: poolBundleAfter.updatedAt,
    };
  }
  return { v: 3, fallback, channels };
}

/** Persist selection-only changes without touching the merged candidate pool. */
export function digestCoverApplyChannelSelectionSnapshot(
  store: DigestCoverStore,
  snap: DigestCoverChannelSelectionSnapshot,
): DigestCoverStore {
  const pool = mergeDigestCandidatePoolAcrossStore(store);
  const meta = store.fallback;
  const poolBundle: DigestVisualBundle = {
    v: 2,
    candidates: pool,
    selectedId: snap.newsletter.selectedId,
    linkPreviewOnly: snap.newsletter.linkPreviewOnly,
    strategies: meta?.strategies,
    updatedAt: meta?.updatedAt,
  };

  const channels: Partial<Record<DigestVisualChannelStyle, DigestVisualBundle>> = {};
  const nw = snap.newsletter;
  for (const st of DIGEST_VISUAL_CHANNEL_STYLES) {
    if (st === "newsletter") continue;
    const ch = snap[st];
    if (ch.selectedId === nw.selectedId && ch.linkPreviewOnly === nw.linkPreviewOnly) continue;
    channels[st] = {
      v: 2,
      candidates: [],
      selectedId: ch.selectedId,
      linkPreviewOnly: ch.linkPreviewOnly,
      updatedAt: meta?.updatedAt,
    };
  }
  return { v: 3, fallback: poolBundle, channels };
}

export function setBundleForChannel(
  store: DigestCoverStore,
  style: DigestVisualChannelStyle,
  bundle: DigestVisualBundle,
): DigestCoverStore {
  return {
    ...store,
    channels: { ...store.channels, [style]: bundle },
  };
}

export function setStoreFallback(store: DigestCoverStore, fallback: DigestVisualBundle | null): DigestCoverStore {
  return { ...store, fallback };
}

/** Persist: keep v2-only JSON when no per-channel splits exist (smaller payloads, backward compatible). */
export function digestCoverStoreToDbJson(store: DigestCoverStore): Json {
  const hasOverrides = Object.keys(store.channels).length > 0;
  if (!hasOverrides && store.fallback) {
    return bundleToJson(store.fallback);
  }
  const channelsOut: Record<string, Json> = {};
  for (const [k, v] of Object.entries(store.channels)) {
    if (v) channelsOut[k] = bundleToJson(v);
  }
  return {
    v: 3,
    fallback: store.fallback ? bundleToJson(store.fallback) : null,
    channels: channelsOut,
  } as unknown as Json;
}

export function digestCoverStoreHasAnyCandidates(store: DigestCoverStore): boolean {
  if (store.fallback && store.fallback.candidates.length > 0) return true;
  for (const st of DIGEST_VISUAL_CHANNEL_STYLES) {
    const b = store.channels[st];
    if (b && b.candidates.length > 0) return true;
  }
  return false;
}

/** True if any digest output tab has an explicit hero (merged pool + per-channel selection). */
export function digestCoverStoreHasHeroSelection(store: DigestCoverStore): boolean {
  for (const st of DIGEST_VISUAL_CHANNEL_STYLES) {
    const b = getBundleForChannel(store, st);
    if (b && hasDigestHeroSelection(b)) return true;
  }
  return false;
}

export function digestCoverStoreAnyLinkPreviewOnly(store: DigestCoverStore): boolean {
  for (const st of DIGEST_VISUAL_CHANNEL_STYLES) {
    if (getBundleForChannel(store, st)?.linkPreviewOnly === true) return true;
  }
  return false;
}
