import type { ItemCategory } from "@/types/database";
import type { DiscoveryCandidate } from "./types";
import * as cheerio from "cheerio";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 CommunitySignalDigest/1.0",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeSiteUrl(raw: string): URL | null {
  try {
    let s = raw.trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    const u = new URL(s);
    if (!u.hostname) return null;
    return u;
  } catch {
    return null;
  }
}

function sameHost(a: URL, b: URL): boolean {
  return (
    a.hostname.replace(/^www\./i, "").toLowerCase() ===
    b.hostname.replace(/^www\./i, "").toLowerCase()
  );
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function parseFirstDate(text: string): Date | null {
  const t = text.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isFinite(d.getTime())) return d;
  const m =
    t.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/) ||
    t.match(/\b(20\d{2})\.(\d{1,2})\.(\d{1,2})\b/);
  if (m?.[1] && m?.[2] && m?.[3]) {
    const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return Number.isFinite(dt.getTime()) ? dt : null;
  }
  return null;
}

function extractPublishedDate($: cheerio.CheerioAPI): Date | null {
  const metaCandidates = [
    $("meta[property='article:published_time']").attr("content"),
    $("meta[name='article:published_time']").attr("content"),
    $("meta[name='pubdate']").attr("content"),
    $("meta[name='publishdate']").attr("content"),
    $("meta[name='date']").attr("content"),
    $("meta[property='og:updated_time']").attr("content"),
  ]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);

  for (const s of metaCandidates) {
    const d = parseFirstDate(s);
    if (d) return d;
  }

  const timeEl =
    $("time[datetime]").first().attr("datetime") ||
    $("time").first().text();
  if (timeEl) {
    const d = parseFirstDate(timeEl);
    if (d) return d;
  }

  // Fallback: scan visible-ish text for a date. Keep this conservative.
  const snippet = cleanText($("body").text()).slice(0, 2200);
  return parseFirstDate(snippet);
}

function classifyCategory(title: string, urlPath: string, body: string): ItemCategory {
  const t = `${title}\n${urlPath}\n${body}`.toLowerCase();
  if (/(publication|paper|preprint|journal|doi\.org|pubmed|pmid)/i.test(t)) return "paper";
  if (/(award|honou?r|prize|recognized|named fellow|elected|appointed)/i.test(t)) return "award";
  if (/(grant|funded|funding|nih|r01|u01|p01|award number)/i.test(t)) return "funding";
  if (/(press|media|featured in|interview|podcast)/i.test(t)) return "media";
  if (/(event|seminar|symposium|workshop|webinar)/i.test(t)) return "event";
  return "community_update";
}

function looksLikeSignal(title: string, urlPath: string, body: string): boolean {
  const t = `${title}\n${urlPath}\n${body}`.toLowerCase();
  // High-signal keywords.
  if (
    /(publication|publications|paper|preprint|doi|pubmed|pmid|award|honou?r|prize|grant|funding|nih|r01|u01|p01|elected|appointed|named|recognized)/i.test(
      t,
    )
  ) {
    return true;
  }
  // If the URL itself screams "news/blog", treat as potentially relevant.
  if (
    /(\/news\/|\/blog\/|\/posts?\/|\/updates?\/|\/press\/|\/publications\/|\/papers\/|\/awards\/|\/honors\/|\/funding\/)/i.test(
      urlPath,
    )
  ) {
    return true;
  }
  return false;
}

function scoreUrlPath(pathname: string): number {
  const p = (pathname || "").toLowerCase();
  let score = 0;
  if (/(^|\/)(news|blog|post|posts|updates|press)(\/|$)/.test(p)) score += 6;
  if (/(^|\/)(publications|papers|pubs)(\/|$)/.test(p)) score += 10;
  if (/(^|\/)(awards|honors|honours|recognition)(\/|$)/.test(p)) score += 10;
  if (/(^|\/)(funding|grants)(\/|$)/.test(p)) score += 8;
  if (/(^|\/)(events|seminars|talks|workshops|webinars)(\/|$)/.test(p)) score += 4;
  // Penalize obviously non-content.
  if (/(privacy|terms|accessibility|contact|people|team|members)(\/|$)/.test(p)) score -= 4;
  return score;
}

function prioritizeUrls(urls: string[], max: number): string[] {
  const scored: { url: string; score: number }[] = [];
  for (const u of urls) {
    try {
      const parsed = new URL(u);
      scored.push({ url: u, score: scoreUrlPath(parsed.pathname) });
    } catch {
      scored.push({ url: u, score: 0 });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((s) => s.url);
}

async function fetchText(
  url: string,
  opts: { timeoutMs: number; throttleMs: number },
): Promise<{ text: string | null; contentType: string | null; status: number | null }> {
  await sleep(opts.throttleMs);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: ac.signal,
    });
    const ct = res.headers.get("content-type");
    if (!res.ok) return { text: null, contentType: ct, status: res.status };
    const text = await res.text();
    return { text, contentType: ct, status: res.status };
  } catch {
    return { text: null, contentType: null, status: null };
  } finally {
    clearTimeout(t);
  }
}

function extractInternalLinks($: cheerio.CheerioAPI, base: URL, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, el) => {
    if (out.length >= limit) return;
    const href = $(el).attr("href");
    if (!href) return;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return;
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      return;
    }
    if (!sameHost(base, u)) return;
    u.hash = "";
    // Avoid obviously non-content assets.
    if (/\.(pdf|png|jpg|jpeg|gif|webp|svg|zip|mp4|mov|css|js)(\?|$)/i.test(u.pathname)) return;
    const s = u.toString();
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}

function titleFromHtml($: cheerio.CheerioAPI): string {
  const og = $("meta[property='og:title']").attr("content");
  if (og && og.trim()) return cleanText(og);
  const h1 = $("h1").first().text();
  if (h1 && h1.trim()) return cleanText(h1);
  const t = $("title").first().text();
  return cleanText(t || "");
}

function bodySnippet($: cheerio.CheerioAPI): string {
  // Drop nav/footers/scripts; this is intentionally lightweight.
  $("script,noscript,style,nav,footer,header").remove();
  const main =
    $("main").first().text() ||
    $("[role='main']").first().text() ||
    $("article").first().text() ||
    $("body").text();
  return cleanText(main).slice(0, 6000);
}

function extractExternalLinks(
  $: cheerio.CheerioAPI,
  base: URL,
  max: number,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, el) => {
    if (out.length >= max) return;
    const href = $(el).attr("href");
    if (!href) return;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return;
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      return;
    }
    if (sameHost(base, u)) return;
    u.hash = "";
    // Skip obvious non-content assets.
    if (/\.(pdf|png|jpg|jpeg|gif|webp|svg|zip|mp4|mov)(\?|$)/i.test(u.pathname)) return;
    const s = u.toString();
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}

function scoreExternalLink(url: URL, category: ItemCategory): number {
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  const path = url.pathname.toLowerCase();
  const full = `${host}${path}`;

  // Publications: prefer PubMed / DOI / journals.
  if (category === "paper") {
    if (host === "pubmed.ncbi.nlm.nih.gov") return 100;
    if (host.endsWith("doi.org")) return 95;
    if (/\/pmc\/articles\//.test(full) || host === "pmc.ncbi.nlm.nih.gov") return 90;
    if (/doi/.test(full)) return 80;
    return 40;
  }

  // Funding: prefer NIH RePORTER, NIH domains.
  if (category === "funding") {
    if (host === "reporter.nih.gov") return 100;
    if (host.endsWith(".nih.gov")) return 85;
    return 35;
  }

  // Media: prefer well-known news domains / press outlets.
  if (category === "media") {
    if (
      /(nytimes|washingtonpost|wsj|nature|science|statnews|axios|bbc|cnn|nbcnews|cbsnews|abcnews|reuters|apnews|theguardian)/i.test(
        host,
      )
    ) {
      return 90;
    }
    if (/(news|press|media)/i.test(full)) return 70;
    return 45;
  }

  // Awards/honors: any external corroboration is helpful.
  if (category === "award") {
    if (/(award|honou?r|prize|fellow|academy|society|elected)/i.test(full)) return 75;
    return 40;
  }

  // Events/community: external link less critical.
  if (category === "event") {
    if (/(event|seminar|webinar|symposium|workshop|conference)/i.test(full)) return 60;
    return 35;
  }

  return 30;
}

function pickBestExternalLink(
  links: string[],
  base: URL,
  category: ItemCategory,
): string | null {
  let best: { url: string; score: number } | null = null;
  for (const s of links) {
    try {
      const u = new URL(s, base);
      const score = scoreExternalLink(u, category);
      if (!best || score > best.score) best = { url: u.toString(), score };
    } catch {
      // ignore
    }
  }
  return best?.url ?? null;
}

export type LabWebsiteHtmlOptions = {
  labWebsiteUrl: string;
  trackedEntityId: string;
  maxResults: number;
  notBefore: Date;
  throttleMs: number;
  maxPages?: number;
  timeoutMs?: number;
};

/**
 * HTML discovery for lab websites.
 * - Bounded crawl (same-host only)
 * - Tries sitemap first, then falls back to homepage link extraction + common hubs
 */
export async function fetchLabWebsiteHtmlCandidates(
  opts: LabWebsiteHtmlOptions,
): Promise<{ candidates: DiscoveryCandidate[]; error?: string }> {
  const candidates: DiscoveryCandidate[] = [];
  const site = normalizeSiteUrl(opts.labWebsiteUrl);
  if (!site) return { candidates };

  const cutoff = opts.notBefore.getTime();
  const maxPages = Math.max(3, Math.min(opts.maxPages ?? 18, 40));
  const timeoutMs = Math.max(1500, Math.min(opts.timeoutMs ?? 8000, 20_000));

  const origin = `${site.protocol}//${site.hostname}${site.port ? `:${site.port}` : ""}`;
  const hubPaths = [
    "/news",
    "/blog",
    "/posts",
    "/updates",
    "/publications",
    "/papers",
    "/awards",
    "/honors",
    "/funding",
    "/press",
  ];

  const sitemapSeed: string[] = [];

  // 1) sitemap
  const sitemapUrls = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  for (const sm of sitemapUrls) {
    const r = await fetchText(sm, { timeoutMs, throttleMs: opts.throttleMs });
    if (!r.text) continue;
    const locs = [...r.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
      .map((m) => m[1]?.trim())
      .filter((s): s is string => Boolean(s));
    if (locs.length > 0) {
      for (const u of locs) {
        if (sitemapSeed.length >= 500) break;
        try {
          const uu = new URL(u);
          if (!sameHost(site, uu)) continue;
          sitemapSeed.push(uu.toString());
        } catch {
          // ignore
        }
      }
      break;
    }
  }

  // 2) common hubs + homepage FIRST (so we spend our page budget on high-value pages)
  const primarySeeds: string[] = [site.toString(), ...hubPaths.map((p) => origin + p)];

  // 3) prioritize sitemap URLs toward likely signal-bearing paths
  const prioritizedSitemap = prioritizeUrls(sitemapSeed, 120);

  const queue: string[] = [...new Set([...primarySeeds, ...prioritizedSitemap])];
  const visited = new Set<string>();
  let fetchOk = 0;
  let fetchBlockedOrFailed = 0;
  let nonHtmlSkipped = 0;

  while (queue.length > 0 && visited.size < maxPages && candidates.length < opts.maxResults) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    const r = await fetchText(url, { timeoutMs, throttleMs: opts.throttleMs });
    if (!r.text) {
      fetchBlockedOrFailed += 1;
      continue;
    }
    fetchOk += 1;
    if (r.contentType && !r.contentType.toLowerCase().includes("text/html")) {
      // Many sites omit correct headers; allow unknown, but skip obvious non-HTML.
      if (r.contentType.toLowerCase().includes("xml") || r.contentType.toLowerCase().includes("json")) {
        nonHtmlSkipped += 1;
        continue;
      }
    }

    const $ = cheerio.load(r.text);
    const title = titleFromHtml($);
    const body = bodySnippet($);

    let u: URL | null = null;
    try {
      u = new URL(url);
    } catch {
      u = null;
    }
    const path = u?.pathname ?? "";

    if (title && looksLikeSignal(title, path, body)) {
      const dt = extractPublishedDate($);
      const publishedAt =
        dt && Number.isFinite(dt.getTime()) ? dt.toISOString() : new Date(cutoff).toISOString();
      if (new Date(publishedAt).getTime() >= cutoff) {
        const cat = classifyCategory(title, path, body);
        const baseForLinks = u ?? site;
        const externalLinks = extractExternalLinks($, baseForLinks, 80);
        const bestExternal = pickBestExternalLink(externalLinks, baseForLinks, cat);
        const chosenUrl = bestExternal ?? url;
        let chosenHost = site.hostname;
        try {
          chosenHost = new URL(chosenUrl).hostname;
        } catch {
          chosenHost = u?.hostname ?? site.hostname;
        }
        candidates.push({
          tracked_entity_id: opts.trackedEntityId,
          title,
          source_url: chosenUrl,
          source_domain: chosenHost,
          published_at: publishedAt,
          raw_summary: bestExternal ? "Lab website (scraped → external)" : "Lab website (scraped)",
          source_type: "lab_website",
          category: cat,
        });
      }
    }

    // Expand crawl frontier: only if we still need results.
    if (candidates.length < opts.maxResults && visited.size < maxPages) {
      const base = u ?? site;
      const links = extractInternalLinks($, base, 120);
      const prioritized = prioritizeUrls(links, 120);
      for (const link of prioritized) {
        if (queue.length >= 400) break;
        if (!visited.has(link)) queue.push(link);
      }
    }
  }

  // If we fetched pages but found no candidates, report a mild hint.
  if (visited.size > 0 && candidates.length === 0) {
    return {
      candidates,
      error:
        fetchOk === 0
          ? "Lab website scrape fetched 0 HTML pages (blocked/timeout or non-HTML)."
          : `Lab website scrape fetched ${fetchOk} page(s) but found 0 signal-like pages (skipped non-HTML: ${nonHtmlSkipped}).`,
    };
  }
  return { candidates };
}

