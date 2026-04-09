import type { ItemCategory } from "@/types/database";
import type { DiscoveryCandidate } from "./types";

/** Google News RSS rejects bare bot UAs; use a browser-like string. */
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 CommunitySignalDigest/1.0",
  Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Last name (word boundary) and, when first name has 2+ chars, first name (word boundary). */
export function facultyMentionedInPlaintext(
  firstName: string,
  lastName: string,
  textLower: string,
): boolean {
  const ln = lastName.trim().toLowerCase();
  const fn = firstName.trim().toLowerCase();
  if (!ln) return false;
  if (!new RegExp(`\\b${escapeRegExp(ln)}\\b`, "i").test(textLower)) {
    return false;
  }
  if (fn.length >= 2) {
    return new RegExp(`\\b${escapeRegExp(fn)}\\b`, "i").test(textLower);
  }
  return true;
}

function extractTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const mm = block.match(re);
  if (!mm) return null;
  let inner = mm[1]!.trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  if (cdata) inner = cdata[1]!;
  return inner.trim();
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/&nbsp;/g, " ");
}

export type RssItem = {
  title: string;
  link: string;
  pubDate: string | null;
};

function extractAtomLinkHref(block: string): string | null {
  const relAlt =
    block.match(/<link[^>]+rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ||
    block.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']alternate["']/i);
  if (relAlt?.[1]) return decodeXmlEntities(relAlt[1]!.trim());
  const any = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (any?.[1]) return decodeXmlEntities(any[1]!.trim());
  return null;
}

export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1]!;
    const titleRaw = extractTag(block, "title");
    const linkRaw = extractTag(block, "link");
    const pubRaw =
      extractTag(block, "pubDate") ||
      extractTag(block, "dc:date") ||
      extractTag(block, "date");
    if (!titleRaw || !linkRaw) continue;
    const title = decodeXmlEntities(titleRaw).replace(/<[^>]+>/g, "").trim();
    const link = decodeXmlEntities(linkRaw).trim();
    const pubDate = pubRaw ? decodeXmlEntities(pubRaw).trim() : null;
    if (title && link) items.push({ title, link, pubDate });
  }
  return items;
}

/** Atom 1.0 entries (common on academic / modern CMS sites). */
export function parseAtomItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1]!;
    const titleRaw = extractTag(block, "title");
    const link = extractAtomLinkHref(block);
    const pubRaw =
      extractTag(block, "published") || extractTag(block, "updated");
    if (!titleRaw || !link) continue;
    const title = decodeXmlEntities(titleRaw).replace(/<[^>]+>/g, "").trim();
    const pubDate = pubRaw ? decodeXmlEntities(pubRaw).trim() : null;
    if (title && link) items.push({ title, link, pubDate });
  }
  return items;
}

export type GoogleNewsRssOptions = {
  query: string;
  trackedEntityId: string;
  maxResults: number;
  notBefore: Date;
  throttleMs: number;
};

export async function fetchGoogleNewsRssCandidates(
  opts: GoogleNewsRssOptions,
): Promise<{ candidates: DiscoveryCandidate[]; error?: string }> {
  const candidates: DiscoveryCandidate[] = [];
  const q = opts.query.trim();
  if (!q) return { candidates };

  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", q);
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("gl", "US");
  url.searchParams.set("ceid", "US:en");

  try {
    await sleep(opts.throttleMs);
    const res = await fetch(url.toString(), { headers: BROWSER_HEADERS });
    if (!res.ok) {
      return { candidates, error: `Google News RSS ${res.status}` };
    }
    const xml = await res.text();
    const items = parseRssItems(xml);
    const cutoff = opts.notBefore.getTime();

    for (const item of items) {
      if (candidates.length >= opts.maxResults) break;
      if (!item.pubDate) continue;
      const t = new Date(item.pubDate).getTime();
      if (!Number.isFinite(t) || t < cutoff) continue;
      const published = new Date(t).toISOString();
      let host = "news.google.com";
      try {
        host = new URL(item.link).hostname || host;
      } catch {
        /* keep default */
      }

      candidates.push({
        tracked_entity_id: opts.trackedEntityId,
        title: item.title,
        source_url: item.link,
        source_domain: host,
        published_at: published,
        raw_summary: "Google News",
        source_type: "web",
        category: "media" as ItemCategory,
      });
    }
  } catch (e) {
    return {
      candidates,
      error: e instanceof Error ? e.message : "Google News RSS failed",
    };
  }

  return { candidates };
}

export type UcsfArticle = {
  title: string;
  url: string;
  published: string;
  textLower: string;
};

type JsonApiArticle = {
  data?: Array<{
    attributes?: {
      title?: string;
      path?: { alias?: string };
      body?: { value?: string };
      created?: string;
      field_date_and_time?: string;
    };
  }>;
  links?: { next?: { href?: string } };
};

export async function fetchUcsfNewsArticlePool(
  notBefore: Date,
  maxArticles: number,
): Promise<{ articles: UcsfArticle[]; error?: string }> {
  const articles: UcsfArticle[] = [];
  const cutoff = notBefore.getTime();

  let next: string | null = (() => {
    const u = new URL("https://www.ucsf.edu/jsonapi/node/article");
    u.searchParams.append("sort", "-created");
    u.searchParams.append("page[limit]", "25");
    return u.toString();
  })();

  let pages = 0;
  const maxPages = 8;

  try {
    while (next && articles.length < maxArticles && pages < maxPages) {
      pages += 1;
      const res = await fetch(next, { headers: BROWSER_HEADERS });
      if (!res.ok) {
        return {
          articles,
          error: `UCSF News (JSON:API) ${res.status}`,
        };
      }
      const json = (await res.json()) as JsonApiArticle;
      const rows = json.data ?? [];
      let stopPaging = false;

      for (const row of rows) {
        const attrs = row.attributes;
        if (!attrs?.title) continue;
        const publishedRaw = attrs.field_date_and_time ?? attrs.created;
        if (!publishedRaw) continue;
        const t = new Date(publishedRaw).getTime();
        if (!Number.isFinite(t) || t < cutoff) {
          stopPaging = true;
          break;
        }
        const alias = attrs.path?.alias;
        if (!alias) continue;
        const url = `https://www.ucsf.edu${alias}`;
        const bodyText = stripHtml(attrs.body?.value ?? "");
        const textLower = `${attrs.title}\n${bodyText}`.toLowerCase();
        articles.push({
          title: attrs.title.trim(),
          url,
          published: new Date(publishedRaw).toISOString(),
          textLower,
        });
        if (articles.length >= maxArticles) {
          stopPaging = true;
          break;
        }
      }

      if (stopPaging) break;
      const href = json.links?.next?.href;
      next = href
        ? new URL(href, "https://www.ucsf.edu").toString()
        : null;
    }
  } catch (e) {
    return {
      articles,
      error: e instanceof Error ? e.message : "UCSF News request failed",
    };
  }

  return { articles };
}

export function ucsfArticlesToCandidates(
  articles: UcsfArticle[],
  opts: {
    firstName: string;
    lastName: string;
    trackedEntityId: string;
    maxResults: number;
  },
): DiscoveryCandidate[] {
  const candidates: DiscoveryCandidate[] = [];
  const fn = opts.firstName.trim();
  const ln = opts.lastName.trim();

  for (const a of articles) {
    if (candidates.length >= opts.maxResults) break;
    if (!facultyMentionedInPlaintext(fn, ln, a.textLower)) continue;
    candidates.push({
      tracked_entity_id: opts.trackedEntityId,
      title: a.title,
      source_url: a.url,
      source_domain: "www.ucsf.edu",
      published_at: a.published,
      raw_summary: "UCSF News Center",
      source_type: "web",
      category: "media" as ItemCategory,
    });
  }

  return candidates;
}
