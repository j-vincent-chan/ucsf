import sharp from "sharp";

/** Bluesky `com.atproto.repo.uploadBlob` / embed validation — stay under this (bytes). */
export const BSKY_BLOB_MAX_BYTES = 2_000_000;

/** Target slightly under the hard limit for JPEG variance. */
const TARGET_BYTES = 1_950_000;

/**
 * Ensures image bytes fit Bluesky’s blob cap by re-encoding as JPEG and shrinking if needed.
 * On failure, returns the original buffer so callers can try upload or fall back to text-only.
 */
export async function compressBufferForBlueskyEmbed(
  input: Buffer,
  mime: string,
): Promise<{ buffer: Buffer; mime: string }> {
  if (!mime.startsWith("image/") || input.length === 0) {
    return { buffer: input, mime };
  }
  if (input.length <= TARGET_BYTES) {
    return { buffer: input, mime };
  }

  try {
    const meta = await sharp(input, { failOn: "none" }).metadata();
    const fullW = meta.width ?? 2048;
    const fullH = meta.height ?? 2048;

    let scale = 1;
    let quality = 88;

    for (let attempt = 0; attempt < 14; attempt++) {
      const w = Math.max(1, Math.round(fullW * scale));
      const h = Math.max(1, Math.round(fullH * scale));

      const buf = await sharp(input, { failOn: "none", limitInputPixels: 268_402_689 })
        .resize({ width: w, height: h, fit: "inside", withoutEnlargement: true })
        .rotate()
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();

      if (buf.length <= TARGET_BYTES) {
        return { buffer: buf, mime: "image/jpeg" };
      }

      scale *= 0.82;
      quality = Math.max(38, quality - 7);
    }

    const last = await sharp(input, { failOn: "none" })
      .resize(960, 960, { fit: "inside", withoutEnlargement: true })
      .rotate()
      .jpeg({ quality: 38, mozjpeg: true })
      .toBuffer();

    return { buffer: last, mime: "image/jpeg" };
  } catch {
    return { buffer: input, mime };
  }
}
