import * as cheerio from "cheerio";
import { resolvePmcidFromPmid, tryPmcArticleImageUrl } from "@/lib/digest-cover";
import { buildDigestThumbnailImagePrompt } from "@/lib/digest-thumbnail-prompt";
import { refineDigestThumbnailPrompt } from "@/lib/digest-thumbnail-prompt-refine";
import {
  type DigestVisualBundle,
  type DigestVisualCandidate,
  type DigestVisualEditMetadata,
  type DigestVisualOriginalSnapshot,
  type RightsHint,
} from "@/lib/digest-visual-types";

const USER_AGENT = "CommunitySignalDigest/1.0 (digest-visual-pipeline)";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function truncate(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function clipForPrompt(s: string, max = 9000): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function extractPubmedPmidFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
  return m?.[1] ?? null;
}

export function classifyVisualStrategies(opts: {
  title: string;
  abstractText: string;
  sourceType: string;
}): string[] {
  const t = `${opts.title} ${opts.abstractText}`.toLowerCase();
  const out: string[] = [];
  if (opts.sourceType === "pubmed") {
    out.push("source_figure", "schematic_molecular");
  } else {
    out.push("source_page_image", "stock_newsroom");
  }
  if (/\b(mice|rat|zebrafish|drosophila|patient|clinical trial|hospital|clinic|cohort|population|public health|epidemio)\b/.test(t)) {
    out.push("stock_clinical", "schematic_trial_design");
  }
  if (/\b(pathway|mechanism|signaling|receptor|knockout|inhibits|repress|activate|molecule|protein|cell|tissue|histology|microscop)\b/.test(t)) {
    out.push("schematic_mechanism", "disease_tissue");
  }
  if (out.length === 0) out.push("schematic_molecular", "stock_newsroom");
  return [...new Set(out)];
}

type Discovered = Omit<DigestVisualCandidate, "id" | "createdAt"> & { id?: string; createdAt?: string };

function candidateFrom(base: Discovered): DigestVisualCandidate {
  const id = base.id ?? newId();
  return { ...base, id, createdAt: base.createdAt ?? new Date().toISOString() };
}

export async function collectPmcSourceCandidates(pmcid: string): Promise<DigestVisualCandidate[]> {
  const raw = pmcid.replace(/^PMC/i, "").trim();
  if (!raw) return [];
  const pageUrl = `https://pmc.ncbi.nlm.nih.gov/articles/PMC${raw}/`;
  try {
    const res = await fetch(pageUrl, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const out: DigestVisualCandidate[] = [];
    const seen = new Set<string>();

    const addUrl = (url: string, prov: string, cap: string | undefined, rights: RightsHint, note: string) => {
      if (!url.startsWith("http") || seen.has(url)) return;
      seen.add(url);
      out.push(
        candidateFrom({
          type: "source",
          kind: "url",
          url,
          provenance: prov,
          sourceDetail: pageUrl,
          caption: cap,
          rights,
          rightsNote: note,
          aiGenerated: false,
          rationale: "Image from the open-access article on NCBI.",
          scores: { relevance: 4, fidelity: 4, editorial: 3, risk: 2, rightsConfidence: 3 },
        }),
      );
    };

    const og = $('meta[property="og:image"]').attr("content")?.trim();
    if (og?.startsWith("http")) {
      addUrl(
        og,
        "PMC — Open access article",
        undefined,
        "open_access",
        "NCBI PMC. Verify reuse for your newsletter context.",
      );
    }

    $("figure").each((_, el) => {
      if (out.length >= 4) return false;
      const $fig = $(el);
      const src = $fig.find("img").first().attr("src")?.trim();
      if (!src) return;
      const abs = src.startsWith("http")
        ? src
        : src.startsWith("//")
          ? `https:${src}`
          : src.startsWith("/")
            ? new URL(src, "https://pmc.ncbi.nlm.nih.gov").toString()
            : new URL(src, pageUrl).toString();
      const cap = $fig.find("figcaption").text().replace(/\s+/g, " ").trim().slice(0, 200);
      const label = $fig.find(".fig-label").text().trim() || "Figure";
      addUrl(
        abs,
        "PMC — Article figure",
        cap || label,
        "open_access",
        "From PMC. Verify that publisher reuse terms allow your intended use.",
      );
    });
    return out.slice(0, 4);
  } catch {
    return [];
  }
}

export async function collectUrlSourceCandidates(articleUrl: string, outletLabel: string): Promise<DigestVisualCandidate[]> {
  try {
    const res = await fetch(articleUrl, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const out: DigestVisualCandidate[] = [];
    const seen = new Set<string>();

    const addUrl = (url: string, prov: string, cap?: string) => {
      if (!url.startsWith("http") || seen.has(url)) return;
      seen.add(url);
      out.push(
        candidateFrom({
          type: "source",
          kind: "url",
          url,
          provenance: prov,
          sourceDetail: articleUrl,
          caption: cap,
          rights: "verify",
          rightsNote: "Source image — verify usage rights with the publisher before publication.",
          aiGenerated: false,
          rationale: "Image from the source page (verify rights).",
          scores: { relevance: 3, fidelity: 3, editorial: 3, risk: 2, rightsConfidence: 1 },
        }),
      );
    };

    const og = $('meta[property="og:image"]').attr("content")?.trim() ?? $('meta[name="twitter:image"]').attr("content")?.trim();
    if (og?.startsWith("http")) addUrl(og, `${outletLabel} — Open Graph / hero image`);

    const cap = $('meta[property="og:description"]').attr("content")?.trim();
    $("article img, main img, .content img, .post img").each((_, el) => {
      if (out.length >= 3) return false;
      const src = $(el).attr("src")?.trim();
      if (!src) return;
      const abs = src.startsWith("http")
        ? src
        : src.startsWith("//")
          ? `https:${src}`
          : src.startsWith("/")
            ? new URL(src, new URL(articleUrl).origin).toString()
            : new URL(src, articleUrl).toString();
      if (!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(abs) && !abs.includes("image")) return;
      addUrl(abs, `${outletLabel} — In-article image`, cap);
    });
    return out.slice(0, 4);
  } catch {
    return [];
  }
}

async function scrapeSourceText(url: string | null): Promise<string> {
  if (!url || !url.startsWith("http")) return "";
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return "";
    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, noscript, svg, nav, footer, header, aside, form").remove();
    const blocks = [
      $("article").text(),
      $("main").text(),
      $('[role="main"]').text(),
      $(".article, .post, .content").text(),
      $("body").text(),
    ];
    const longest = blocks
      .map((b) => b.replace(/\s+/g, " ").trim())
      .sort((a, b) => b.length - a.length)[0];
    return clipForPrompt(longest ?? "", 12000);
  } catch {
    return "";
  }
}

function thumbnailImageModel(): string {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";
}

function gptImageQuality(): "low" | "medium" | "high" | "auto" {
  const q = process.env.OPENAI_IMAGE_QUALITY?.trim().toLowerCase();
  if (q === "low" || q === "medium" || q === "high" || q === "auto") return q;
  /** Default `high`—closer to polished ChatGPT thumbnails; use OPENAI_IMAGE_QUALITY=medium to save cost. */
  return "high";
}

/**
 * Digest thumbnails use GPT Image models (`gpt-image-1` default)—same product family as ChatGPT image generation.
 * Set `OPENAI_IMAGE_MODEL=dall-e-3` to use DALL·E 3 instead.
 */
async function generateDigestThumbnailImage(prompt: string): Promise<{ mime: string; base64: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Illustration generation requires a configured OpenAI API key.");
  }
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });
  const model = thumbnailImageModel();

  try {
    if (model === "dall-e-3" || model === "dall-e-2") {
      const full = prompt.length > 4000 ? `${prompt.slice(0, 3900)}…\n[Truncated]` : prompt;
      const result = await openai.images.generate({
        model,
        prompt: full,
        n: 1,
        size: "1024x1024",
        quality: model === "dall-e-3" ? "standard" : "standard",
        response_format: "b64_json",
      });
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) {
        throw new Error("OpenAI image response did not contain image data.");
      }
      return { mime: "image/png", base64: b64 };
    }

    const full = prompt.length > 32000 ? `${prompt.slice(0, 31900)}…\n[Truncated]` : prompt;
    const result = await openai.images.generate({
      model,
      prompt: full,
      n: 1,
      size: "1024x1024",
      quality: gptImageQuality(),
      background: "opaque",
      output_format: "png",
    });
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("OpenAI image response did not contain image data.");
    }
    return { mime: "image/png", base64: b64 };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Illustration image generation failed.");
  }
}

export async function generateIllustrationOptions(opts: {
  title: string;
  abstractText: string;
  rawText?: string | null;
  sourceUrl?: string | null;
}): Promise<DigestVisualCandidate[]> {
  const summaryAndExcerpts = [opts.abstractText, opts.rawText].filter(Boolean).join("\n\n").trim();
  const basePrompt = buildDigestThumbnailImagePrompt({
    title: truncate(opts.title, 500),
    sourceUrl: opts.sourceUrl?.trim() ?? null,
    summaryAndExcerpts,
  });

  const refine = await refineDigestThumbnailPrompt(basePrompt);
  const imagePrompt = refine.refinedPrompt;

  const img = await generateDigestThumbnailImage(imagePrompt);
  const imageModel = thumbnailImageModel();
  return [
    candidateFrom({
      type: "schematic",
      kind: "inline",
      mime: img.mime,
      base64: img.base64,
      provenance: `AI — BioRender-style editorial thumbnail (${imageModel}${refine.usedRefinement ? ", refined prompt" : ""})`,
      rights: "unknown",
      rightsNote: "AI-generated. Not a real figure or dataset from the source article.",
      aiGenerated: true,
      promptUsed: JSON.stringify(
        {
          mode: "thumbnail",
          image_model: imageModel,
          image_quality: imageModel === "dall-e-3" || imageModel === "dall-e-2" ? null : gptImageQuality(),
          prompt_refiner_used: refine.usedRefinement,
          prompt_refiner_note: refine.usedRefinement ? undefined : refine.skipReason,
          source_url: opts.sourceUrl ?? null,
          title: truncate(opts.title, 300),
          summary_and_excerpts_preview: truncate(summaryAndExcerpts, 1200),
          base_thumbnail_prompt: basePrompt,
          final_image_prompt: imagePrompt,
        },
        null,
        2,
      ),
      rationale:
        "News / digest / social thumbnail via OpenAI Images. A text model may rewrite the template prompt into a tighter art-director brief before generation (similar to ChatGPT). See promptUsed.base_thumbnail_prompt vs final_image_prompt.",
      scores: { relevance: 4, fidelity: 4, editorial: 4, risk: 2, rightsConfidence: 4 },
    }),
  ];
}

export async function generateStockOptions(opts: { title: string; abstractText: string }): Promise<DigestVisualCandidate[]> {
  void opts;
  return [];
}

function dedupeByUrl(cands: DigestVisualCandidate[]): DigestVisualCandidate[] {
  const seen = new Set<string>();
  return cands.filter((c) => {
    if (c.kind === "url" && c.url) {
      if (seen.has(c.url)) return false;
      seen.add(c.url);
    }
    return true;
  });
}

export async function runFullVisualPipeline(opts: {
  title: string;
  rawText: string | null;
  rawSummary: string | null;
  sourceType: string;
  sourceUrl: string | null;
}): Promise<DigestVisualBundle> {
  const abstractOrSummary =
    (opts.rawText?.trim() && opts.rawText.trim().slice(0, 8000)) ||
    (opts.rawSummary?.trim() && opts.rawSummary.trim().slice(0, 8000)) ||
    opts.title;

  const strategies = classifyVisualStrategies({
    title: opts.title,
    abstractText: abstractOrSummary,
    sourceType: opts.sourceType,
  });

  const candidates: DigestVisualCandidate[] = [];

  const pmid = opts.sourceType === "pubmed" ? extractPubmedPmidFromUrl(opts.sourceUrl) : null;
  if (pmid) {
    const pmcid = await resolvePmcidFromPmid(pmid);
    if (pmcid) {
      const pmcCands = await collectPmcSourceCandidates(pmcid);
      candidates.push(...pmcCands);
      if (candidates.length === 0) {
        const single = await tryPmcArticleImageUrl(pmcid);
        if (single) {
          candidates.push(
            candidateFrom({
              type: "source",
              kind: "url",
              url: single,
              provenance: "PMC — article image",
              sourceDetail: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`,
              rights: "open_access",
              rightsNote: "From PMC. Verify rights for your use case.",
              aiGenerated: false,
              rationale: "Fallback: first article-associated image on the PMC page.",
              scores: { relevance: 3, fidelity: 3, editorial: 3, risk: 2, rightsConfidence: 3 },
            }),
          );
        }
      }
    }
  } else if (opts.sourceUrl?.startsWith("http")) {
    const fromPage = await collectUrlSourceCandidates(opts.sourceUrl, "Source");
    candidates.push(...fromPage);
  }

  const schematics = await generateIllustrationOptions({
    title: opts.title,
    abstractText: abstractOrSummary,
    rawText: opts.rawText,
    sourceUrl: opts.sourceUrl,
  });
  candidates.push(...schematics);

  const unique = dedupeByUrl(candidates);
  const selectedId =
    unique.find((c) => c.type === "source" && c.kind === "url")?.id ??
    unique.find((c) => c.type === "schematic")?.id ??
    unique[0]?.id ??
    null;

  return {
    v: 2,
    selectedId,
    strategies,
    candidates: unique,
    updatedAt: new Date().toISOString(),
  };
}

export async function runDiscoverSourceOnly(opts: {
  title: string;
  rawText: string | null;
  rawSummary: string | null;
  sourceType: string;
  sourceUrl: string | null;
}): Promise<DigestVisualCandidate[]> {
  const abstractOrSummary =
    (opts.rawText?.trim() && opts.rawText.trim().slice(0, 8000)) ||
    (opts.rawSummary?.trim() && opts.rawSummary.trim().slice(0, 8000)) ||
    opts.title;
  const strategies = classifyVisualStrategies({
    title: opts.title,
    abstractText: abstractOrSummary,
    sourceType: opts.sourceType,
  });
  void strategies;
  const out: DigestVisualCandidate[] = [];
  const pmid = opts.sourceType === "pubmed" ? extractPubmedPmidFromUrl(opts.sourceUrl) : null;
  if (pmid) {
    const pmcid = await resolvePmcidFromPmid(pmid);
    if (pmcid) {
      out.push(...(await collectPmcSourceCandidates(pmcid)));
      if (out.length === 0) {
        const single = await tryPmcArticleImageUrl(pmcid);
        if (single) {
          out.push(
            candidateFrom({
              type: "source",
              kind: "url",
              url: single,
              provenance: "PMC — article image",
              sourceDetail: pmcid,
              rights: "open_access",
              rightsNote: "From PMC. Verify rights.",
              aiGenerated: false,
              rationale: "Fallback from PMC page.",
              scores: { relevance: 3, fidelity: 3, editorial: 3, risk: 2, rightsConfidence: 3 },
            }),
          );
        }
      }
    }
  } else if (opts.sourceUrl?.startsWith("http")) {
    out.push(...(await collectUrlSourceCandidates(opts.sourceUrl, "Source")));
  }
  return dedupeByUrl(out);
}

export function removeCandidateById(bundle: DigestVisualBundle, id: string): DigestVisualBundle {
  const next = bundle.candidates.filter((c) => c.id !== id);
  if (next.length === 0) {
    throw new Error("Cannot remove the last visual candidate.");
  }
  const selectedId =
    bundle.selectedId && next.some((c) => c.id === bundle.selectedId)
      ? bundle.selectedId
      : (next[0]?.id ?? null);
  return { ...bundle, candidates: next, selectedId, updatedAt: new Date().toISOString() };
}

export function removeAiCandidates(bundle: DigestVisualBundle): DigestVisualBundle {
  const next = bundle.candidates.filter((c) => !c.aiGenerated);
  const selectedId =
    bundle.selectedId && next.some((c) => c.id === bundle.selectedId)
      ? bundle.selectedId
      : (next.find((c) => c.type === "source")?.id ?? next[0]?.id ?? null);
  return { ...bundle, candidates: next, selectedId, updatedAt: new Date().toISOString() };
}

export function mergeCandidates(existing: DigestVisualBundle, incoming: DigestVisualCandidate[]): DigestVisualBundle {
  const merged = dedupeByUrl([...existing.candidates, ...incoming]);
  const selectedId =
    existing.selectedId && merged.some((c) => c.id === existing.selectedId)
      ? existing.selectedId
      : (merged.find((c) => c.type === "source")?.id ?? merged[0]?.id ?? null);
  return {
    v: 2,
    selectedId,
    strategies: existing.strategies,
    candidates: merged,
    updatedAt: new Date().toISOString(),
  };
}

export function setSelected(bundle: DigestVisualBundle, candidateId: string | null): DigestVisualBundle {
  if (candidateId && !bundle.candidates.some((c) => c.id === candidateId)) return bundle;
  return { ...bundle, selectedId: candidateId, updatedAt: new Date().toISOString() };
}

/** Update the same candidate id with edited pixels; stash `editOriginal` on first edit for revert. */
export function applyCandidateImageEditInPlace(
  bundle: DigestVisualBundle,
  opts: {
    candidateId: string;
    base64: string;
    mime: string;
    editMetadata: DigestVisualEditMetadata;
  },
): DigestVisualBundle {
  const idx = bundle.candidates.findIndex((c) => c.id === opts.candidateId);
  if (idx < 0) {
    throw new Error("Candidate not found.");
  }
  const c = bundle.candidates[idx]!;
  const snapshot: DigestVisualOriginalSnapshot =
    c.editOriginal ??
    ({
      kind: c.kind,
      url: c.url,
      mime: c.mime,
      base64: c.base64,
    } satisfies DigestVisualOriginalSnapshot);
  const updated: DigestVisualCandidate = {
    ...c,
    editOriginal: snapshot,
    kind: "inline",
    mime: opts.mime,
    base64: opts.base64,
    url: undefined,
    editMetadata: opts.editMetadata,
    editedFromId: undefined,
  };
  const next = bundle.candidates.map((x) => (x.id === opts.candidateId ? updated : x));
  return { ...bundle, candidates: next, selectedId: bundle.selectedId, updatedAt: new Date().toISOString() };
}

/** Restore candidate visual from `editOriginal` and clear edit metadata. */
export function revertCandidateImageEdit(bundle: DigestVisualBundle, candidateId: string): DigestVisualBundle {
  const c = bundle.candidates.find((x) => x.id === candidateId);
  if (!c?.editOriginal) {
    throw new Error("Nothing to revert for this candidate.");
  }
  const o = c.editOriginal;
  const restored: DigestVisualCandidate = {
    ...c,
    kind: o.kind,
    url: o.kind === "url" ? o.url : undefined,
    mime: o.kind === "inline" ? o.mime : undefined,
    base64: o.kind === "inline" ? o.base64 : undefined,
    editOriginal: undefined,
    editMetadata: undefined,
    editedFromId: undefined,
  };
  return {
    ...bundle,
    candidates: bundle.candidates.map((x) => (x.id === candidateId ? restored : x)),
    updatedAt: new Date().toISOString(),
  };
}

/** Replace or append the digest snapshot with a user-cropped inline image; keeps selection on the saved snapshot. */

export function applyCroppedSnapshot(
  bundle: DigestVisualBundle,
  opts: { base64: string; mime: string },
): DigestVisualBundle {
  const selId = bundle.selectedId;
  if (!selId) {
    throw new Error("No visual selected to save.");
  }
  const sel = bundle.candidates.find((c) => c.id === selId);
  if (!sel) {
    throw new Error("Selected visual not found.");
  }
  const updatedAt = new Date().toISOString();

  if (sel.kind === "inline") {
    const nextCandidates = bundle.candidates.map((c) =>
      c.id === selId
        ? {
            ...c,
            kind: "inline" as const,
            mime: opts.mime,
            base64: opts.base64,
            url: undefined,
            provenance: "Digest — edited snapshot",
            rationale: "User-cropped digest snapshot.",
            aiGenerated: false,
          }
        : c,
    );
    return { ...bundle, candidates: nextCandidates, selectedId: selId, updatedAt };
  }

  const newCandId = newId();
  const newCand: DigestVisualCandidate = {
    id: newCandId,
    type: sel.type,
    kind: "inline",
    mime: opts.mime,
    base64: opts.base64,
    provenance: "Digest — edited snapshot",
    sourceDetail: sel.kind === "url" ? sel.url : sel.sourceDetail,
    caption: sel.caption,
    rights: sel.rights === "open_access" ? "verify" : sel.rights,
    rightsNote:
      "User-edited crop for digest presentation. Verify usage rights before publication outside internal use.",
    aiGenerated: false,
    rationale: "User-cropped digest snapshot.",
    createdAt: updatedAt,
    scores: sel.scores,
  };
  return {
    ...bundle,
    candidates: [...bundle.candidates, newCand],
    selectedId: newCandId,
    updatedAt,
  };
}

/** @deprecated Use generateIllustrationOptions */
export const generateSchematicOptions = generateIllustrationOptions;
