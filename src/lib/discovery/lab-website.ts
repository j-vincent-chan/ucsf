import type { ItemCategory } from "@/types/database";
import {
  parseAtomItems,
  parseRssItems,
  type RssItem,
} from "./news-media";
import type { DiscoveryCandidate } from "./types";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 CommunitySignalDigest/1.0",
  Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
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

/** Candidate feed URLs: homepage RSS paths, then treat pasted URL as a direct feed if path hints XML. */
function feedUrlsToTry(siteUrl: URL): string[] {
  const origin = `${siteUrl.protocol}//${siteUrl.hostname}${siteUrl.port ? `:${siteUrl.port}` : ""}`;
  const paths = [
    "/feed",
    "/feed/",
    "/feed.xml",
    "/rss",
    "/rss/",
    "/rss.xml",
    "/atom.xml",
    "/feed/atom",
    "/feed/rss",
    "/news/feed",
    "/news/rss",
    "/blog/feed",
    "/articles/feed",
    "/?feed=rss2",
    "/?feed=atom",
  ];
  const out: string[] = [];
  const path = (siteUrl.pathname || "/").replace(/\/$/, "") || "/";
  if (path !== "/" && /\.(xml|rss)$/i.test(path)) {
    out.push(siteUrl.toString());
  }
  for (const p of paths) {
    out.push(origin + p);
  }
  if (path !== "/" && !out.includes(siteUrl.toString())) {
    out.push(siteUrl.toString());
  }
  return [...new Set(out)];
}

function looksLikeFeedXml(text: string): boolean {
  const t = text.slice(0, 2500).toLowerCase();
  if (t.includes("<rss")) return true;
  if (t.includes("<channel") && t.includes("<item")) return true;
  if (t.includes("<feed") && t.includes("<entry")) return true;
  if (t.includes("<?xml") && t.includes("<item")) return true;
  return false;
}

function itemToCandidate(
  item: RssItem,
  trackedEntityId: string,
  notBeforeMs: number,
): DiscoveryCandidate | null {
  let published: string;
  if (item.pubDate) {
    const t = new Date(item.pubDate).getTime();
    if (!Number.isFinite(t) || t < notBeforeMs) return null;
    published = new Date(t).toISOString();
  } else {
    /** Stable fallback so undated feed items still appear once; dedup key won’t drift daily. */
    published = new Date(notBeforeMs).toISOString();
  }
  let host = "";
  try {
    host = new URL(item.link).hostname;
  } catch {
    host = "lab";
  }
  return {
    tracked_entity_id: trackedEntityId,
    title: item.title,
    source_url: item.link,
    source_domain: host,
    published_at: published,
    raw_summary: "Lab website (RSS)",
    source_type: "lab_website",
    category: "community_update" as ItemCategory,
  };
}

export type LabWebsiteRssOptions = {
  labWebsiteUrl: string;
  trackedEntityId: string;
  maxResults: number;
  notBefore: Date;
  throttleMs: number;
};

/**
 * Try common WordPress / site RSS locations for the PI lab URL.
 * RSS 2.0 &lt;item&gt; and Atom &lt;entry&gt;; tries common WordPress / CMS feed URLs.
 */
export async function fetchLabWebsiteRssCandidates(
  opts: LabWebsiteRssOptions,
): Promise<{ candidates: DiscoveryCandidate[]; error?: string }> {
  const candidates: DiscoveryCandidate[] = [];
  const site = normalizeSiteUrl(opts.labWebsiteUrl);
  if (!site) return { candidates };

  const cutoff = opts.notBefore.getTime();
  const tryUrls = feedUrlsToTry(site);

  for (const feedUrl of tryUrls) {
    try {
      await sleep(opts.throttleMs);
      const res = await fetch(feedUrl, {
        headers: BROWSER_HEADERS,
        redirect: "follow",
      });
      if (!res.ok) continue;
      const xml = await res.text();
      if (!looksLikeFeedXml(xml)) continue;
      let items = parseRssItems(xml);
      if (items.length === 0) items = parseAtomItems(xml);
      if (items.length === 0) continue;

      for (const item of items) {
        if (candidates.length >= opts.maxResults) break;
        const c = itemToCandidate(item, opts.trackedEntityId, cutoff);
        if (c) candidates.push(c);
      }
      if (candidates.length > 0) break;
    } catch {
      /* try next feed URL */
    }
  }

  return { candidates };
}
