import type { DigestVisualCandidate } from "@/lib/digest-visual-types";

const MAX_BYTES = 12 * 1024 * 1024;

function normalizeMime(m: string): string {
  const t = m.trim().toLowerCase();
  if (t === "image/jpg") return "image/jpeg";
  return t;
}

function guessMimeFromUrl(url: string): string {
  const u = url.split("?")[0]?.toLowerCase() ?? "";
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "image/jpeg";
  if (u.endsWith(".gif")) return "image/gif";
  if (u.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

/**
 * Load raw image bytes for the digest visual candidate (inline base64 or fetched URL).
 */
export async function bufferFromDigestVisualCandidate(
  candidate: DigestVisualCandidate,
): Promise<{ buffer: Buffer; mime: string } | null> {
  if (candidate.kind === "inline" && candidate.base64 && candidate.mime) {
    const buffer = Buffer.from(candidate.base64, "base64");
    if (buffer.length === 0 || buffer.length > MAX_BYTES) return null;
    return { buffer, mime: normalizeMime(candidate.mime) };
  }

  if (candidate.kind === "url" && candidate.url?.trim()) {
    try {
      const res = await fetch(candidate.url.trim(), {
        headers: { "User-Agent": "CommunitySignal/1.0 (digest publish)" },
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_BYTES) return null;
      const ct = res.headers.get("content-type")?.split(";")[0]?.trim();
      const mime = normalizeMime(ct && ct.startsWith("image/") ? ct : guessMimeFromUrl(candidate.url));
      if (!mime.startsWith("image/")) return null;
      return { buffer: buf, mime };
    } catch {
      return null;
    }
  }

  return null;
}
