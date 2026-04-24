import * as cheerio from "cheerio";
import { resolvePmcidFromPmid, tryPmcArticleImageUrl } from "@/lib/digest-cover";
import { type DigestVisualBundle, type DigestVisualCandidate, type RightsHint } from "@/lib/digest-visual-types";

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

type IllustrationBrief = {
  visual_concept: string;
  main_subject: string;
  supporting_elements: string[];
  avoid: string[];
};

const ILLUSTRATION_FORBIDDEN_TERMS = [
  "source content:",
  "first, identify",
  "schematic",
  "pathway",
  "mechanism figure",
  "callout",
  "annotation",
  "multi-panel",
  "biorender-like",
  "clinical trial",
  "biomarker",
];

function inferIllustrationBrief(opts: { title: string; sourceText: string }): IllustrationBrief {
  const t = `${opts.title} ${opts.sourceText}`.toLowerCase();
  const hasT1D = /\b(type 1 diabetes|t1d|insulin)\b/.test(t);
  const hasImmune = /\b(immune|autoimmune|t cell|immune cell)\b/.test(t);
  const hasDiscovery = /\b(discovery|finding|advance|progress|breakthrough)\b/.test(t);
  const hasPrevention = /\b(prevent|prevention|delay)\b/.test(t);
  const hasClinical = /\b(patient|care|clinical|cohort|outcome)\b/.test(t);

  if (hasT1D && hasImmune) {
    return {
      visual_concept:
        "immune regulation in type 1 diabetes, shown as a stylized immune cell gently redirected away from an insulin-producing cell",
      main_subject: "one stylized immune cell and one simplified insulin-producing cell",
      supporting_elements: ["a soft protective shield or gentle curved cue"],
      avoid: ["DNA helix", "syringe", "doctors", "patients", "lab benches"],
    };
  }

  if (hasClinical) {
    return {
      visual_concept: "progress in patient care represented by one calm protective medical symbol",
      main_subject: "one stylized protective care symbol",
      supporting_elements: hasDiscovery ? ["a subtle upward progress cue"] : [],
      avoid: ["hospital room scene", "multiple people", "dense workflow elements"],
    };
  }

  if (hasPrevention) {
    return {
      visual_concept: "disease prevention represented as gentle protection around one vulnerable biological element",
      main_subject: "one simplified vulnerable cell-like form with protection",
      supporting_elements: ["one soft directional cue"],
      avoid: ["complex arrows", "dense cell clusters", "multi-scene composition"],
    };
  }

  return {
    visual_concept: hasDiscovery
      ? "a single symbolic discovery concept shown as one protected biological form"
      : "a single symbolic health science concept with calm protective framing",
    main_subject: "one simple central biomedical symbol",
    supporting_elements: ["at most one subtle supporting cue"],
    avoid: ["pseudo-infographic layout", "publication-style figure styling"],
  };
}

function buildIllustrationPromptFromBrief(brief: IllustrationBrief): string {
  const supporting = brief.supporting_elements.length > 0 ? brief.supporting_elements.join(", ") : "none";
  const avoid = brief.avoid.join(", ");
  return `Create a flat editorial spot illustration for a health/science digest.

Concept: ${brief.visual_concept}

Main subject: ${brief.main_subject}

Supporting elements, if any: ${supporting}

Style: simple 2D vector editorial illustration, soft rounded shapes, muted professional colors, mostly solid fills, subtle layering, clean negative space.

Composition: one centered focal subject on a simple background. No more than three object types total. At least 60% negative space. No panels, no workflows, no timelines, no lab-scene montage. No more than one subtle directional cue.

Text: absolutely no text, labels, numbers, captions, callouts, pseudo-writing, charts, or annotations.

Avoid: ${avoid}, pseudo-infographic, fake scientific diagram, biomedical diagram, pathway diagram, mechanism figure, dense annotations, callout boxes, explanatory panels, hyper-detailed cells, complex arrows, glossy 3D, photorealism, crowded biomedical detail.`;
}

function enforceIllustrationPromptGuardrails(prompt: string, brief: IllustrationBrief): string {
  let next = prompt.trim().replace(/\s+\n/g, "\n");
  const lowered = next.toLowerCase();
  const hasForbidden = ILLUSTRATION_FORBIDDEN_TERMS.some((term) => lowered.includes(term));
  const tooLong = next.length > 1200;
  const tooManyEntities = brief.supporting_elements.length > 2;
  if (hasForbidden || tooLong || tooManyEntities) {
    const safeBrief: IllustrationBrief = {
      visual_concept: truncate(brief.visual_concept, 180),
      main_subject: truncate(brief.main_subject, 140),
      supporting_elements: brief.supporting_elements.slice(0, 2).map((s) => truncate(s, 90)),
      avoid: [...brief.avoid, "pseudo-infographic", "biomedical diagram", "dense annotations"].slice(0, 8),
    };
    next = buildIllustrationPromptFromBrief(safeBrief);
  }
  return next.slice(0, 1200);
}

async function dalleImage(prompt: string): Promise<{ mime: string; base64: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Illustration generation requires a configured OpenAI API key.");
  }
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });
  const full = prompt.length > 4000 ? `${prompt.slice(0, 3900)}…\n[Truncated]` : prompt;
  try {
    const result = await openai.images.generate({
      model: "dall-e-3",
      prompt: full,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      response_format: "b64_json",
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
  const scraped = await scrapeSourceText(opts.sourceUrl ?? null);
  const sourceText = [scraped, opts.rawText, opts.abstractText].filter(Boolean).join("\n\n");
  const brief = inferIllustrationBrief({
    title: truncate(opts.title, 200),
    sourceText: sourceText || opts.title,
  });
  const prompt = enforceIllustrationPromptGuardrails(buildIllustrationPromptFromBrief(brief), brief);
  const img = await dalleImage(prompt);
  return [
    candidateFrom({
      type: "schematic",
      kind: "inline",
      mime: img.mime,
      base64: img.base64,
      provenance: "AI — article-grounded biomedical illustration (DALL·E 3)",
      rights: "unknown",
      rightsNote: "AI-generated. Not a real figure or dataset from the source article.",
      aiGenerated: true,
      promptUsed: JSON.stringify(
        {
          extracted_topic: truncate(opts.title, 180),
          visual_brief: brief,
          final_image_prompt: prompt,
        },
        null,
        2,
      ),
      rationale: "Article-specific editorial spot illustration generated from a minimal visual brief.",
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

/** @deprecated Use generateIllustrationOptions */
export const generateSchematicOptions = generateIllustrationOptions;
