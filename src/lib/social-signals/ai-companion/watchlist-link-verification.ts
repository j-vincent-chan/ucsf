/** Fetch linked pages and match People / tracked investigator roster terms (server-side). */

export type WatchlistMatchTerms = {
  lastNames: string[];
  namePhrases: string[];
  handleHints: string[];
};

export function extractHttpUrlsFromText(text: string): string[] {
  const t = text || "";
  const matches = t.match(/\bhttps?:\/\/[^\s<>"')]+/gi) ?? [];
  return matches.map((m) => m.replace(/[)\].,;:!?'"]+$/g, ""));
}

/** Block obvious SSRF targets when fetching arbitrary user-supplied URLs. */
export function isAllowedPublicHttpUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local")) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const p = host.split(".").map(Number);
      const a = p[0]!;
      const b = p[1]!;
      if (a === 10 || a === 127 || a === 0) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      if (a === 169 && b === 254) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip tags / scripts; collapse whitespace — enough for author-line matching on publisher HTML. */
export function stripHtmlToPlainText(html: string): string {
  let s = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  s = s.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&amp;/g, "&");
  s = s.replace(/&lt;/g, "<");
  s = s.replace(/&gt;/g, ">");
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  return s.replace(/\s+/g, " ").trim();
}

export function buildWatchlistMatchTerms(
  rows: {
    name: string | null;
    last_name: string | null;
    x_handle: string | null;
    bluesky_handle: string | null;
  }[],
): WatchlistMatchTerms {
  const lastNames = new Set<string>();
  const namePhrases = new Set<string>();
  const handleHints = new Set<string>();
  for (const r of rows) {
    const ln = r.last_name?.trim();
    if (ln && ln.length >= 2) lastNames.add(ln.toLowerCase());
    const n = r.name?.trim();
    if (n && n.length >= 3) {
      namePhrases.add(n.toLowerCase());
      if (n.includes(",")) {
        const parts = n
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        if (parts.length >= 2) {
          namePhrases.add(`${parts[1]} ${parts[0]}`.toLowerCase());
        }
      }
    }
    const xh = r.x_handle?.trim().replace(/^@+/, "");
    if (xh && xh.length >= 2) handleHints.add(xh.toLowerCase());
    const bh = r.bluesky_handle?.trim().replace(/^@+/, "");
    if (bh && bh.length >= 2) handleHints.add(bh.toLowerCase());
  }
  return {
    lastNames: [...lastNames].filter((x) => x.length >= 3),
    namePhrases: [...namePhrases].filter((x) => x.length >= 4),
    handleHints: [...handleHints].filter((x) => x.length >= 3),
  };
}

export function plainTextMatchesWatchlistTerms(plain: string, terms: WatchlistMatchTerms): boolean {
  const t = plain.replace(/\s+/g, " ").trim().toLowerCase();
  if (t.length < 12) return false;

  for (const ln of terms.lastNames) {
    const re = new RegExp(`\\b${escapeRegex(ln)}\\b`, "i");
    if (re.test(t)) return true;
  }
  for (const phrase of terms.namePhrases) {
    if (t.includes(phrase)) return true;
  }
  for (const h of terms.handleHints) {
    if (t.includes(`@${h}`) || t.includes(`${h}.bsky.social`) || t.includes(`twitter.com/${h}`) || t.includes(`x.com/${h}`)) {
      return true;
    }
  }
  return false;
}

const MAX_HTML_BYTES = 512 * 1024;

export async function fetchUrlPlainText(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        "User-Agent": "CommunitySignal/1.0 (+social watchlist link verification)",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (/octet-stream|pdf|video|audio|image\/(?!svg)/i.test(ct)) return null;

    const buf = await res.arrayBuffer();
    const capped = buf.byteLength > MAX_HTML_BYTES ? buf.slice(0, MAX_HTML_BYTES) : buf;
    const html = new TextDecoder("utf-8", { fatal: false }).decode(capped);
    return stripHtmlToPlainText(html);
  } catch {
    return null;
  }
}
