import * as cheerio from "cheerio";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

export type DigestCoverPayload =
  | { kind: "url"; url: string; source: string }
  | { kind: "inline"; mime: string; base64: string; source: string };

export function parseDigestCoverFromDb(raw: unknown): DigestCoverPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === "url" && typeof o.url === "string" && o.url.startsWith("http")) {
    return { kind: "url", url: o.url, source: typeof o.source === "string" ? o.source : "unknown" };
  }
  if (
    o.kind === "inline" &&
    typeof o.base64 === "string" &&
    typeof o.mime === "string" &&
    o.mime.startsWith("image/")
  ) {
    return {
      kind: "inline",
      mime: o.mime,
      base64: o.base64,
      source: typeof o.source === "string" ? o.source : "unknown",
    };
  }
  return null;
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

/** DALL·E 3 editorial illustration (no journal marks, no readable fake text). */
export async function generateDigestIllustration(opts: {
  title: string;
  abstractOrSummary: string;
}): Promise<{ mime: string; base64: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const prompt = [
    "Editorial scientific illustration for a research newsletter or social post.",
    "Clean modern infographic style, soft muted colors, no photorealistic faces, no logos, no journal names, no readable text in the image.",
    "Single cohesive scene suggesting the research topic abstractly.",
    `Research title: ${truncate(opts.title, 220)}`,
    `Context: ${truncate(opts.abstractOrSummary, 600)}`,
  ].join(" ");

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
