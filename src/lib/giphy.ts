/** Hostnames GIPHY serves GIF bytes from (HTTPS only). */
export const GIPHY_MEDIA_HOSTS = new Set([
  "media.giphy.com",
  "media0.giphy.com",
  "media1.giphy.com",
  "media2.giphy.com",
  "media3.giphy.com",
  "media4.giphy.com",
  "i.giphy.com",
]);

export type GiphySearchItem = {
  id: string;
  title: string;
  /** Small preview (GIF) for grid UI */
  previewUrl: string;
  /** GIF URL we download server-side for replies (keeps size reasonable). */
  gifUrl: string;
};

type GiphyApiEnvelope = {
  data?: Array<{
    id?: string;
    title?: string;
    images?: {
      downsized?: { url?: string };
      preview_gif?: { url?: string };
      fixed_height_small?: { url?: string };
    };
  }>;
};

function mapGiphyData(raw: GiphyApiEnvelope): GiphySearchItem[] {
  const out: GiphySearchItem[] = [];
  for (const g of raw.data ?? []) {
    const gifUrl = g.images?.downsized?.url ?? g.images?.fixed_height_small?.url;
    const previewUrl = g.images?.preview_gif?.url ?? gifUrl;
    if (!gifUrl || !g.id) continue;
    try {
      const u = new URL(gifUrl);
      if (u.protocol !== "https:" || !GIPHY_MEDIA_HOSTS.has(u.hostname)) continue;
    } catch {
      continue;
    }
    out.push({
      id: g.id,
      title: typeof g.title === "string" ? g.title : "",
      previewUrl: previewUrl ?? gifUrl,
      gifUrl,
    });
  }
  return out;
}

/** Search or trending when `query` is empty. */
export async function fetchGiphySearch(
  query: string,
  limit: number,
): Promise<{ items: GiphySearchItem[]; configured: boolean; detail?: string }> {
  const key = process.env.GIPHY_API_KEY?.trim();
  if (!key) {
    return { items: [], configured: false, detail: "GIPHY_API_KEY is not set." };
  }

  const lim = Math.min(Math.max(limit, 1), 50);
  const q = query.trim();
  const base = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&limit=${lim}&rating=g&lang=en`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(key)}&limit=${lim}&rating=g`;

  const res = await fetch(base);
  const raw = (await res.json().catch(() => ({}))) as GiphyApiEnvelope & { meta?: { msg?: string } };
  if (!res.ok) {
    return {
      items: [],
      configured: true,
      detail: typeof raw.meta?.msg === "string" ? raw.meta.msg : `GIPHY error (${res.status})`,
    };
  }
  return { items: mapGiphyData(raw), configured: true };
}

function isGifMagic(buf: Buffer): boolean {
  return buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;
}

/** Download a GIF from an allowed GIPHY CDN URL (used when posting replies). */
export async function fetchGifFromAllowedCdnUrl(
  urlStr: string,
  maxBytes: number,
): Promise<{ buffer: Buffer; mime: string }> {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error("Invalid GIF URL.");
  }
  if (u.protocol !== "https:") throw new Error("Invalid GIF URL.");
  if (!GIPHY_MEDIA_HOSTS.has(u.hostname)) {
    throw new Error("GIF URL must be from GIPHY.");
  }

  const res = await fetch(urlStr, { redirect: "follow" });
  if (!res.ok) throw new Error("Could not download GIF from GIPHY.");

  const len = res.headers.get("content-length");
  if (len && Number(len) > maxBytes) {
    throw new Error("GIF is too large (max 5 MB).");
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error("GIF is too large (max 5 MB).");

  const ct = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ct.includes("gif") && !isGifMagic(buf)) {
    throw new Error("Downloaded file was not a GIF.");
  }

  return { buffer: buf, mime: "image/gif" };
}
