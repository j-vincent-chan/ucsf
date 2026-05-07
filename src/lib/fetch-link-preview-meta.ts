import * as cheerio from "cheerio";

/**
 * Many sites (including NCBI) return 403 to non-browser or bot user agents from cloud/datacenter IPs.
 * Use a standard browser string for Open Graph fetches (see `fetchLinkPreviewMeta` + PubMed E-utilities fallback).
 */
const BROWSER_LIKE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const EUTILS_UA = "CommunitySignal/1.0 (link-preview; +https://github.com/j-vincent-chan/ucsf) eutils";
const MAX_HTML_BYTES = 400_000;

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + "…";
}

/** Open Graph scrape result (title/description + optional hero image URL). */
export type LinkPreviewMeta = {
  title: string;
  description: string;
  /** Resolved absolute https? URL when the page declares og:image / twitter:image. */
  imageUrl: string | null;
  /** Short domain or og:site_name for the card eyebrow. */
  siteLabel: string;
};

/** Block obvious SSRF targets (local / private). Public article URLs only. */
export function isLikelyPublicHttpArticleUrl(urlString: string): boolean {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h.endsWith(".localhost")) return false;
  if (h === "127.0.0.1" || h === "::1") return false;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m = ipv4.exec(h);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 0) return false;
  }
  return true;
}

/** /pubmed/12345/ or /12345/ on pubmed.ncbi.nlm.nih.gov */
function extractPubMedPmid(urlString: string): string | null {
  try {
    const u = new URL(urlString);
    if (!u.hostname.toLowerCase().endsWith("pubmed.ncbi.nlm.nih.gov")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.find((p) => /^\d{5,12}$/.test(p)) ?? null;
  } catch {
    return null;
  }
}

/**
 * NCBI E-utilities: works from Vercel while direct HTML to pubmed.ncbi.nlm.nih.gov often returns 403 for cloud IPs.
 * @see https://www.ncbi.nlm.nih.gov/books/NBK25501/
 */
async function tryPubMedEsummaryMeta(pageUrl: string): Promise<LinkPreviewMeta | null> {
  const pmid = extractPubMedPmid(pageUrl);
  if (!pmid) return null;
  const tool = "CommunitySignal";
  const email = process.env.NCBI_EUTILS_EMAIL?.trim();
  const q = new URLSearchParams({
    db: "pubmed",
    id: pmid,
    retmode: "json",
    tool,
  });
  if (email) q.set("email", email);
  try {
    const apiUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${q.toString()}`;
    const res = await fetch(apiUrl, {
      headers: { Accept: "application/json", "User-Agent": EUTILS_UA },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      result?: {
        uids?: string[];
        [pmid: string]: { title?: string; fulljournalname?: string; source?: string } | string[] | undefined;
      };
    };
    const block = data.result?.[pmid] as { title?: string; fulljournalname?: string; source?: string } | undefined;
    const title = block?.title?.trim();
    if (!title) return null;
    const siteLabel = clip((block?.fulljournalname || block?.source || "PubMed").trim(), 120);
    return {
      title: clip(title, 300),
      description: "",
      imageUrl: null,
      siteLabel,
    };
  } catch {
    return null;
  }
}

function resolveImageUrl(pageUrl: string, raw: string | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  try {
    let abs: string;
    if (t.startsWith("http://") || t.startsWith("https://")) abs = t;
    else if (t.startsWith("//")) abs = `https:${t}`;
    else if (t.startsWith("/")) abs = new URL(t, pageUrl).toString();
    else abs = new URL(t, pageUrl).toString();
    const u = new URL(abs);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return abs;
  } catch {
    return null;
  }
}

function parseOgFromHtml(pageUrl: string, html: string): LinkPreviewMeta {
  const $ = cheerio.load(html);
  const ogTitle =
    $('meta[property="og:title"]').attr("content")?.trim() ??
    $('meta[name="twitter:title"]').attr("content")?.trim();
  const ogDesc =
    $('meta[property="og:description"]').attr("content")?.trim() ??
    $('meta[name="twitter:description"]').attr("content")?.trim() ??
    $('meta[name="description"]').attr("content")?.trim();
  const titleTag = $("title").first().text().trim();
  const ogImageRaw =
    $('meta[property="og:image"]').attr("content")?.trim() ??
    $('meta[property="og:image:url"]').attr("content")?.trim() ??
    $('meta[name="twitter:image"]').attr("content")?.trim() ??
    $('meta[name="twitter:image:src"]').attr("content")?.trim();
  const imageUrl = resolveImageUrl(pageUrl, ogImageRaw);
  const ogSite = $('meta[property="og:site_name"]').attr("content")?.trim();
  let hostname = "";
  try {
    hostname = new URL(pageUrl).hostname;
  } catch {
    /* ignore */
  }
  const siteFallback = hostname.replace(/^www\./i, "") || "Link";
  const title = clip(ogTitle || titleTag || hostname, 300);
  const description = clip(ogDesc || "", 1000);
  const siteLabel = clip(ogSite || siteFallback, 120);
  return { title, description, imageUrl, siteLabel };
}

/**
 * Best-effort Open Graph / title scrape for link-card publishing (Bluesky external embed) and UI previews.
 * Never throws; returns fallbacks on failure.
 *
 * **Production note:** Requests originate from your deployment region (e.g. Vercel). Some publishers (notably
 * NCBI PubMed HTML) respond **403** to datacenter IPs while localhost succeeds. We use a browser-like `User-Agent`
 * and, for PubMed URLs, **NCBI E-utilities** (`esummary`) so title/metadata still resolve when HTML is blocked.
 */
export async function fetchLinkPreviewMeta(pageUrl: string): Promise<LinkPreviewMeta> {
  let hostname = "";
  try {
    hostname = new URL(pageUrl).hostname;
  } catch {
    return { title: "Link", description: "", imageUrl: null, siteLabel: "Link" };
  }

  const siteFallback = hostname.replace(/^www\./i, "") || "Link";

  const pubMedFallbackPromise = tryPubMedEsummaryMeta(pageUrl);

  try {
    const res = await fetch(pageUrl, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": BROWSER_LIKE_UA,
      },
      signal: AbortSignal.timeout(12_000),
    });

    const buf = Buffer.from(await res.arrayBuffer());
    const pubMedMeta = await pubMedFallbackPromise;

    if (res.ok) {
      const slice = buf.subarray(0, Math.min(buf.length, MAX_HTML_BYTES));
      const html = slice.toString("utf8");
      const parsed = parseOgFromHtml(pageUrl, html);
      const looksLikeHttpError = /^(403|404|401|502|503)\b/i.test(parsed.title.trim());
      if (looksLikeHttpError && pubMedMeta) {
        return {
          ...pubMedMeta,
          imageUrl: parsed.imageUrl ?? pubMedMeta.imageUrl,
          description: parsed.description || pubMedMeta.description,
        };
      }
      if (!parsed.title.trim() && pubMedMeta) {
        return {
          ...parsed,
          title: pubMedMeta.title,
          siteLabel: pubMedMeta.siteLabel || parsed.siteLabel,
        };
      }
      return parsed;
    }

    if (pubMedMeta) return pubMedMeta;

    return { title: hostname || "Link", description: "", imageUrl: null, siteLabel: siteFallback };
  } catch {
    const pubMedMeta = await pubMedFallbackPromise.catch(() => null);
    if (pubMedMeta) return pubMedMeta;
    return { title: hostname || "Link", description: "", imageUrl: null, siteLabel: siteFallback };
  }
}
