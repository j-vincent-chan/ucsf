import * as cheerio from "cheerio";

const USER_AGENT = "CommunitySignalDigest/1.0 (link-preview)";
const MAX_HTML_BYTES = 400_000;

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + "…";
}

/**
 * Best-effort Open Graph / title scrape for link-card publishing (Bluesky external embed).
 * Never throws; returns fallbacks on failure.
 */
export async function fetchLinkPreviewMeta(pageUrl: string): Promise<{ title: string; description: string }> {
  let hostname = "";
  try {
    hostname = new URL(pageUrl).hostname;
  } catch {
    return { title: "Link", description: "" };
  }

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

    const title = clip(ogTitle || titleTag || hostname, 300);
    const description = clip(ogDesc || "", 1000);

    return { title, description };
  } catch {
    return { title: hostname || "Link", description: "" };
  }
}
