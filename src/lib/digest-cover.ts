import * as cheerio from "cheerio";

import {
  type DigestVisualBundle,
  parseDigestVisualBundleFromDb,
} from "@/lib/digest-visual-types";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

/** @deprecated Use DigestVisualBundle; kept for any legacy imports. */
export type DigestCoverPayload =
  | { kind: "url"; url: string; source: string }
  | { kind: "inline"; mime: string; base64: string; source: string };

/** V2 visual bundle in `source_items.digest_cover` (replaces single legacy payload). */
export function parseDigestCoverFromDb(raw: unknown): DigestVisualBundle | null {
  return parseDigestVisualBundleFromDb(raw);
}

function ncbiKeyParam(): string {
  const key = process.env.NCBI_API_KEY?.trim();
  return key ? `&api_key=${encodeURIComponent(key)}` : "";
}

/** PubMed ID → PMC ID (e.g. PMC12477338), if linked in PMC (NCBI elink). */
export async function resolvePmcidFromPmid(pmid: string): Promise<string | null> {
  const id = pmid.replace(/\D/g, "");
  if (!id) return null;
  try {
    const res = await fetch(
      `${EUTILS}/elink.fcgi?dbfrom=pubmed&db=pmc&retmode=json&id=${encodeURIComponent(id)}${ncbiKeyParam()}`,
      { headers: { "User-Agent": "CommunitySignalDigest/1.0 (digest-cover)" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      linksets?: {
        linksetdbs?: { dbto?: string; linkname?: string; links?: string[] }[];
      }[];
    };
    const blocks = json.linksets?.[0]?.linksetdbs;
    if (!Array.isArray(blocks)) return null;
    const block = blocks.find((b) => b.dbto === "pmc" && b.linkname === "pubmed_pmc");
    const n = block?.links?.[0]?.trim();
    if (!n) return null;
    return /^\d+$/.test(n) ? `PMC${n}` : n.startsWith("PMC") ? n : `PMC${n}`;
  } catch {
    return null;
  }
}

/** Try og:image or first figure image on the NCBI PMC HTML article page. */
export async function tryPmcArticleImageUrl(pmcid: string): Promise<string | null> {
  const raw = pmcid.replace(/^PMC/i, "").trim();
  if (!raw) return null;
  const url = `https://pmc.ncbi.nlm.nih.gov/articles/PMC${raw}/`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CommunitySignalDigest/1.0 (digest-cover)" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    const og = $('meta[property="og:image"]').attr("content")?.trim();
    if (og?.startsWith("http")) return og;
    const pick = (sel: string) => {
      const el = $(sel).first();
      const src = el.attr("src")?.trim();
      if (!src) return null;
      if (src.startsWith("http")) return src;
      if (src.startsWith("//")) return `https:${src}`;
      if (src.startsWith("/")) return new URL(src, "https://pmc.ncbi.nlm.nih.gov").toString();
      return new URL(src, url).toString();
    };
    return (
      pick("figure img") ??
      pick(".fig img") ??
      pick("img.graphic") ??
      pick(".graphic img") ??
      null
    );
  } catch {
    return null;
  }
}

function truncate(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** DALL·E 3 — ultra-minimal diagram fallback (legacy single-image path). */
const DIGEST_ILLUSTRATION_PROMPT_BODY = `Create ONE ultra-minimal flat vector diagram on a pure white background for this publication/news article — not a poster, not photorealism, not a busy infographic.

Style:
- 2D line art only: thin dark-gray strokes, large empty margins, at most 4–6 simple shapes (rounded rectangles/circles) and plain arrows between them.
- At most one muted accent color used sparingly; no gradients, textures, shadows, glow, 3D, isometric views, blueprint grids, or decorative frames.

Content:
- Abstract the main idea into a tiny high-level flow with short generic labels (2–4 words each). Do not render the title or long summary as readable text in the image.
- Do not fabricate data, scans, charts, microscopy, histology, molecular detail, DNA helices, lab equipment, or anything that could look like real experimental output.

Forbidden:
- Photorealistic labs, faces, identifiable people, logos, cluttered “science montage” imagery.

Add a tiny corner label: "AI — not data".`;

const DALL_E_3_PROMPT_MAX_CHARS = 4000;

export async function generateDigestIllustration(opts: {
  title: string;
  abstractOrSummary: string;
}): Promise<{ mime: string; base64: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const body = DIGEST_ILLUSTRATION_PROMPT_BODY;
  const titleBlock = truncate(opts.title, 280);
  const tailPrefix = `

---
Source material (interpret only; do not render as readable text in the image):
Title: ${titleBlock}
Summary: `;
  const rawSummary = opts.abstractOrSummary || opts.title;
  let summaryMax = 1200;
  let prompt = "";
  for (;;) {
    prompt = `${body}${tailPrefix}${truncate(rawSummary, summaryMax)}`;
    if (prompt.length <= DALL_E_3_PROMPT_MAX_CHARS || summaryMax <= 200) break;
    summaryMax -= 150;
  }
  if (prompt.length > DALL_E_3_PROMPT_MAX_CHARS) {
    prompt = prompt.slice(0, DALL_E_3_PROMPT_MAX_CHARS - 1) + "…";
  }

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });
    const result = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      response_format: "b64_json",
    });
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) return null;
    return { mime: "image/png", base64: b64 };
  } catch {
    return null;
  }
}

/**
 * Prefer a figure URL from the PMC HTML page when the paper is in PMC; otherwise AI illustration.
 */
export async function resolveDigestCover(opts: {
  pmid: string | null;
  title: string;
  abstractOrSummary: string;
}): Promise<DigestCoverPayload | null> {
  if (opts.pmid) {
    const pmcid = await resolvePmcidFromPmid(opts.pmid);
    if (pmcid) {
      const imgUrl = await tryPmcArticleImageUrl(pmcid);
      if (imgUrl) {
        return { kind: "url", url: imgUrl, source: "pmc_article_image" };
      }
    }
  }
  const gen = await generateDigestIllustration({
    title: opts.title,
    abstractOrSummary: opts.abstractOrSummary || opts.title,
  });
  if (!gen) return null;
  return { kind: "inline", mime: gen.mime, base64: gen.base64, source: "dall-e-3" };
}
