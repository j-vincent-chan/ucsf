/** KLIPY API + asset CDNs — GIF URLs are often on partner domains, not only `*.klipy.com`. */
export function isKlipyHttpsMediaHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "klipy.com" || h.endsWith(".klipy.com")) return true;
  const extra =
    process.env.KLIPY_MEDIA_HOST_ALLOWLIST?.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean) ?? [];
  for (const e of extra) {
    if (h === e || h.endsWith(`.${e}`)) return true;
  }
  return false;
}

export type KlipySearchItem = {
  id: string;
  title: string;
  /** Small preview for grid UI */
  previewUrl: string;
  /** GIF URL downloaded server-side for replies */
  gifUrl: string;
};

const KLIPY_API_BASE = "https://api.klipy.com/api/v1";

type KlipyPaginatedBody = {
  data?: unknown[];
  current_page?: number;
  per_page?: number;
  has_next?: boolean;
};

type KlipyEnvelope = {
  result?: boolean;
  message?: string;
  data?: KlipyPaginatedBody;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function firstHttpsUrl(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const s = c.trim();
    if (s.startsWith("https://")) return s;
    if (s.startsWith("http://")) return s;
  }
  return undefined;
}

function mediaRoot(item: Record<string, unknown>): Record<string, unknown> | null {
  return asRecord(item.files) ?? asRecord(item.file);
}

/**
 * Klipy nests formats under `file` / `files`, e.g. `hd.gif.url`, `gif.url`, `xs.jpg.url`.
 * @see https://github.com/dansup/klipy-php (paginated envelope) and community examples using `file` (singular).
 */
function extractGifUrl(item: Record<string, unknown>): string | undefined {
  const root = mediaRoot(item);
  if (root) {
    const hd = asRecord(root.hd);
    if (hd) {
      const hdGif = asRecord(hd.gif);
      const u = firstHttpsUrl(hdGif?.url, hdGif?.proxy_url, hdGif?.proxy_src, hdGif?.src);
      if (u) return u;
    }

    const gifBlock = asRecord(root.gif);
    const fromGif = firstHttpsUrl(
      gifBlock?.url,
      gifBlock?.proxy_url,
      gifBlock?.proxy_src,
      gifBlock?.src,
    );
    if (fromGif) return fromGif;

    for (const v of Object.values(root)) {
      const block = asRecord(v);
      if (!block) continue;
      const nestedGif = asRecord(block.gif);
      const fromNested = firstHttpsUrl(
        nestedGif?.url,
        nestedGif?.proxy_url,
        nestedGif?.proxy_src,
        nestedGif?.src,
      );
      if (fromNested) return fromNested;

      const u = firstHttpsUrl(block.url, block.proxy_url, block.proxy_src, block.src);
      if (u && /\.gif($|\?)/i.test(u)) return u;
    }
  }

  return firstHttpsUrl(item.src, item.proxy_src);
}

/**
 * Thumbnail for grid UI — prefer a **small GIF** so previews animate (Klipy often exposes `xs.jpg`
 * first; browsers show JPG as a still frame).
 */
function extractPreviewUrl(item: Record<string, unknown>, gifUrl: string): string {
  const root = mediaRoot(item);
  if (root) {
    const pickNestedGif = (block: Record<string, unknown> | null): string | undefined => {
      if (!block) return undefined;
      const g = asRecord(block.gif);
      return firstHttpsUrl(g?.url, g?.proxy_url, g?.proxy_src, g?.src);
    };

    const xs = asRecord(root.xs);
    const fromXsGif = pickNestedGif(xs);
    if (fromXsGif) return fromXsGif;

    for (const key of ["tiny", "small", "sm", "md", "preview", "gif_preview", "thumbnail"]) {
      const block = asRecord(root[key]);
      const fromNested = pickNestedGif(block);
      if (fromNested) return fromNested;
      const flat = block
        ? firstHttpsUrl(block.url, block.proxy_url, block.proxy_src, block.src)
        : undefined;
      if (flat && /\.gif($|\?)/i.test(flat)) return flat;
    }
  }
  return gifUrl;
}

function mapKlipyItems(rawList: unknown[]): KlipySearchItem[] {
  const out: KlipySearchItem[] = [];
  for (const raw of rawList) {
    const item = asRecord(raw);
    if (!item) continue;
    const gifUrlRaw = extractGifUrl(item);
    if (!gifUrlRaw) continue;
    const gifUrl = gifUrlRaw.startsWith("http://") ? `https://${gifUrlRaw.slice(7)}` : gifUrlRaw;
    try {
      const u = new URL(gifUrl);
      if (u.protocol !== "https:") continue;
    } catch {
      continue;
    }

    const previewUrl = extractPreviewUrl(item, gifUrl);
    let previewOk = false;
    try {
      const pu = new URL(previewUrl.startsWith("http://") ? `https://${previewUrl.slice(7)}` : previewUrl);
      previewOk = pu.protocol === "https:";
    } catch {
      previewOk = false;
    }

    const idRaw = item.slug ?? item.id ?? gifUrl;
    const id = typeof idRaw === "string" ? idRaw : String(idRaw);
    const title = typeof item.title === "string" ? item.title : "";

    out.push({
      id,
      title,
      previewUrl: previewOk ? (previewUrl.startsWith("http://") ? `https://${previewUrl.slice(7)}` : previewUrl) : gifUrl,
      gifUrl,
    });
  }
  return out;
}

/** Search when `query` is non-empty; otherwise trending. */
export async function fetchKlipySearch(
  query: string,
  limit: number,
): Promise<{ items: KlipySearchItem[]; configured: boolean; detail?: string }> {
  const key = process.env.KLIPY_API_KEY?.trim();
  if (!key) {
    return { items: [], configured: false, detail: "KLIPY_API_KEY is not set." };
  }

  const lim = Math.min(Math.max(limit, 8), 50);
  const q = query.trim();
  const locale = process.env.KLIPY_LOCALE?.trim() || "en_US";

  const pathSegment = q ? "gifs/search" : "gifs/trending";
  const params = new URLSearchParams({
    per_page: String(lim),
    page: "1",
    rating: "g",
    locale,
  });
  if (q) params.set("q", q);

  const url = `${KLIPY_API_BASE}/${encodeURIComponent(key)}/${pathSegment}?${params}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "CommunitySignal/1.0 (Klipy GIF search)",
    },
    cache: "no-store",
  });

  const raw = (await res.json().catch(() => ({}))) as KlipyEnvelope;
  if (!res.ok) {
    const msg =
      typeof raw.message === "string"
        ? raw.message
        : `Klipy error (${res.status})`;
    return { items: [], configured: true, detail: msg };
  }

  if (raw.result === false) {
    const msg = typeof raw.message === "string" ? raw.message : "Klipy request failed.";
    return { items: [], configured: true, detail: msg };
  }

  let list: unknown[] = [];
  if (Array.isArray(raw.data?.data)) {
    list = raw.data!.data!;
  } else if (Array.isArray(raw.data)) {
    list = raw.data as unknown[];
  }
  return { items: mapKlipyItems(list), configured: true };
}

function isGifMagic(buf: Buffer): boolean {
  return buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;
}

/** Download a GIF from an allowed Klipy CDN URL (used when posting replies). */
export async function fetchGifFromKlipyCdnUrl(
  urlStr: string,
  maxBytes: number,
): Promise<{ buffer: Buffer; mime: string }> {
  const normalized = urlStr.startsWith("http://") ? `https://${urlStr.slice(7)}` : urlStr;
  let u: URL;
  try {
    u = new URL(normalized);
  } catch {
    throw new Error("Invalid GIF URL.");
  }
  if (u.protocol !== "https:") throw new Error("Invalid GIF URL.");
  if (!isKlipyHttpsMediaHostname(u.hostname)) {
    throw new Error(
      `GIF host not allowed (${u.hostname}). Add it to KLIPY_MEDIA_HOST_ALLOWLIST in server env (comma-separated), or use URLs from Klipy’s CDN.`,
    );
  }

  const res = await fetch(normalized, { redirect: "follow" });
  if (!res.ok) throw new Error("Could not download GIF from Klipy.");

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
