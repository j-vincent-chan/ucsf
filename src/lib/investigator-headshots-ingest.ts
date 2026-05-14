const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25_000;

const ALLOWED_CT = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function normalizeContentType(header: string | null): string | null {
  if (!header) return null;
  const base = header.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base === "image/jpg") return "image/jpeg";
  return base || null;
}

/**
 * Server-only: fetch image bytes from a public URL (e.g. LinkedIn CDN) for Storage upload.
 * Enforces size and image type.
 */
export async function downloadHeadshotImageFromUrl(
  url: string,
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const trimmed = url.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
    throw new Error("URL must start with http:// or https://");
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(trimmed, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent": "CommunitySignal/1.0 (headshot bulk ingest)",
      },
    });
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const lenHeader = res.headers.get("content-length");
  if (lenHeader) {
    const n = Number(lenHeader);
    if (Number.isFinite(n) && n > MAX_BYTES) {
      throw new Error("Image exceeds 5 MB");
    }
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    throw new Error("Image exceeds 5 MB");
  }
  if (buf.byteLength === 0) {
    throw new Error("Empty response");
  }

  const ct = normalizeContentType(res.headers.get("content-type"));
  const bytes = new Uint8Array(buf);
  const sniffed = sniffImageMime(bytes);
  const contentType =
    ct && ALLOWED_CT.has(ct) ? ct : sniffed && ALLOWED_CT.has(sniffed) ? sniffed : null;
  if (!contentType) {
    throw new Error("Not a supported image type (JPEG, PNG, GIF, WebP)");
  }

  return { buffer: buf, contentType };
}
