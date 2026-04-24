import type { Json } from "@/types/database";

/** Legacy single-image shape stored in `source_items.digest_cover` before v2. */
export type LegacyDigestCoverPayload =
  | { kind: "url"; url: string; source: string }
  | { kind: "inline"; mime: string; base64: string; source: string };

export type VisualCandidateType = "source" | "schematic" | "stock" | "abstract";

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
  rights: RightsHint;
  rightsNote?: string;
  aiGenerated: boolean;
  promptUsed?: string;
  rationale: string;
  createdAt: string;
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
    if (candidates.length === 0) return { v: 2, selectedId: null, strategies: [], candidates: [] };
    return {
      v: 2,
      selectedId: typeof o.selectedId === "string" ? o.selectedId : null,
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
  if (bundle.selectedId) {
    const c = bundle.candidates.find((x) => x.id === bundle.selectedId);
    if (c) return c;
  }
  return bundle.candidates[0] ?? null;
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

export function bundleToJson(bundle: DigestVisualBundle): Json {
  return bundle as unknown as Json;
}
