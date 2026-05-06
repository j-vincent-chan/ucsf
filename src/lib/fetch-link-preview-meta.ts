import * as cheerio from "cheerio";

const USER_AGENT = "CommunitySignalDigest/1.0 (link-preview)";
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

/**
 * Best-effort Open Graph / title scrape for link-card publishing (Bluesky external embed) and UI previews.
 * Never throws; returns fallbacks on failure.
 */
export async function fetchLinkPreviewMeta(pageUrl: string): Promise<LinkPreviewMeta> {
  let hostname = "";
  try {
    hostname = new URL(pageUrl).hostname;
  } catch {
    return { title: "Link", description: "", imageUrl: null, siteLabel: "Link" };
  }

  const siteFallback = hostname.replace(/^www\./i, "") || "Link";

  try {
    const res = await fetch(pageUrl, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(12_000),
    });

    const buf = Buffer.from(await res.arrayBuffer());
    const slice = buf.subarray(0, Math.min(buf.length, MAX_HTML_BYTES));
    const html = slice.toString("utf8");
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

    const title = clip(ogTitle || titleTag || hostname, 300);
    const description = clip(ogDesc || "", 1000);
    const siteLabel = clip(ogSite || siteFallback, 120);

    return { title, description, imageUrl, siteLabel };
  } catch {
    return { title: hostname || "Link", description: "", imageUrl: null, siteLabel: siteFallback };
  }
}
