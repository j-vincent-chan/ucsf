/**
 * Isolate Sutro Tower from composite artwork → transparent PNG + trim.
 * Run: node scripts/extract-sutro-tower.mjs [input.png]
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const defaultInput = path.join(
  root,
  "Sutro Tower with radiating signals.png",
);
const input = process.argv[2] || defaultInput;
const output = path.join(root, "public", "sutro-tower-mark.png");

function dist2(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

const base = await sharp(input).ensureAlpha().png().toBuffer();
const full = await sharp(base).raw().toBuffer({ resolveWithObject: true });
const fw = full.info.width;
const fh = full.info.height;
const fd = full.data;

function sample(x, y) {
  const i = (y * fw + x) * 4;
  return { r: fd[i], g: fd[i + 1], b: fd[i + 2] };
}

const pad = 12;
const samples = [
  sample(pad, pad),
  sample(fw - 1 - pad, pad),
  sample(pad, fh - 1 - pad),
  sample(fw - 1 - pad, fh - 1 - pad),
];
const bgRef = {
  r: Math.round(samples.reduce((a, s) => a + s.r, 0) / 4),
  g: Math.round(samples.reduce((a, s) => a + s.g, 0) / 4),
  b: Math.round(samples.reduce((a, s) => a + s.b, 0) / 4),
};

const BG_DIST = 38 * 38;
const maxc = (r, g, b) => Math.max(r, g, b);
const minc = (r, g, b) => Math.min(r, g, b);

function keepPixel(r, g, b, x, y, ww, hh) {
  const sat = maxc(r, g, b) - minc(r, g, b);
  const minv = minc(r, g, b);
  const edgeX = x < ww * 0.13 || x > ww * 0.87;

  // Flat white / off-white page background
  if (r > 243 && g > 243 && b > 243) return false;
  if (minv > 210 && sat < 28) return false;
  if (r > 228 && g > 228 && b > 228 && sat < 18) return false;

  // Tan / brown background (even if gradient shifts)
  if (dist2(r, g, b, bgRef.r, bgRef.g, bgRef.b) < BG_DIST) return false;
  if (r > 120 && g > 95 && b < 115 && r - b > 25 && sat < 70) return false;

  // Yellow / sun
  if (r > 195 && g > 155 && b < 120) return false;

  // Pink / magenta / pastel signal arcs
  if (r > 125 && b > 95 && g < 110 && sat > 35) return false;
  if (r > 210 && b > 200 && g < 230 && sat < 50) return false;

  // Cool teal side waves (not tower blue)
  if (g > 115 && b > 120 && r < 100 && g + b > r + r + 95) return false;

  // Side margins: only strong tower blues / ink (drops faint wave pixels)
  if (edgeX && !(b > r + 18 && b > 65)) return false;

  // Tower ink: white / silver highlight (on structure, not blank canvas)
  if (r > 198 && g > 198 && b > 198 && sat < 25) return true;
  if (r > 175 && g > 175 && b > 175 && sat < 30 && b >= r - 8) return true;

  // Tower blues (structure ink)
  if (b > r + 12 && b > g + 8 && b > 50) return true;
  if (b > 85 && b >= r - 5 && b >= g - 5 && r < 175 && g < 185) return true;

  return false;
}

// Tight crop around tower only (drops side arcs + skyline below)
const cropW = Math.round(fw * 0.36);
const cropH = Math.round(fh * 0.54);
const left = Math.round((fw - cropW) / 2);
const top = Math.round(fh * 0.11);

const cropped = await sharp(base)
  .extract({ left, top, width: cropW, height: cropH })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { data, info } = cropped;
const ww = info.width;
const hh = info.height;
const out = Buffer.alloc(ww * hh * 4);

for (let y = 0; y < hh; y++) {
  for (let x = 0; x < ww; x++) {
    const i = (y * ww + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    let a = keepPixel(r, g, b, x, y, ww, hh) ? 255 : 0;
    const sat = maxc(r, g, b) - minc(r, g, b);
    // Drop far left/right columns (any residual arc pixels)
    if (x < ww * 0.04 || x > ww * 0.96) a = 0;
    // Legs end above decorative base
    if (y > hh * 0.92) a = 0;
    // Remove skyline mass (lighter blues) while keeping dark lattice legs
    if (
      y > hh * 0.5 &&
      a > 0 &&
      r > 100 &&
      b > 125 &&
      g > 90 &&
      sat < 78
    ) {
      a = 0;
    }

    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = a;
  }
}

await sharp(out, { raw: { width: ww, height: hh, channels: 4 } })
  .png()
  .trim({ threshold: 12 })
  .toFile(output);

console.log("Wrote", output, "bgRef=", bgRef);
