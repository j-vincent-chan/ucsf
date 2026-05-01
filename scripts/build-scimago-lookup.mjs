/**
 * Reads data/scimagojr-journals-2025.csv (SCImago JR export; semicolon-separated)
 * and writes src/data/scimago-sjr-lookup.json for client-side journal ranking.
 *
 * Run: node scripts/build-scimago-lookup.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const csvPath = path.join(root, "data/scimagojr-journals-2025.csv");
const outPath = path.join(root, "src/data/scimago-sjr-lookup.json");

function splitSemicolonRespectingQuotes(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === ";" && !inQuotes) {
      cells.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  cells.push(cur);
  return cells;
}

function normJournalTitle(s) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[.,&']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSjr(cell) {
  if (!cell) return 0;
  const t = cell.trim().replace(",", ".");
  const v = Number.parseFloat(t);
  return Number.isFinite(v) ? v : 0;
}

function issnDigits(chunk) {
  const d = chunk.replace(/\D/g, "");
  if (d.length === 8) return d;
  if (d.length === 7) return null;
  return d.length > 8 ? d.slice(0, 8) : null;
}

function main() {
  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error(`Empty or invalid CSV: ${csvPath}`);

  const header = splitSemicolonRespectingQuotes(lines[0]);
  const idxTitle = header.indexOf("Title");
  const idxIssn = header.indexOf("Issn");
  const idxSjr = header.indexOf("SJR");
  if (idxTitle < 0 || idxIssn < 0 || idxSjr < 0) {
    throw new Error(`Unexpected SCImago header: ${header.join(";")}`);
  }

  /** @type {Record<string, number>} */
  const byIssn = {};
  /** @type {Record<string, number>} */
  const byTitleNorm = {};

  function mergeMax(rec, key, score) {
    if (!(score > 0)) return;
    const prev = rec[key];
    if (prev == null || score > prev) rec[key] = score;
  }

  for (let li = 1; li < lines.length; li++) {
    const cells = splitSemicolonRespectingQuotes(lines[li]);
    const title = cells[idxTitle]?.trim() ?? "";
    const issnRaw = cells[idxIssn]?.trim() ?? "";
    const sjr = parseSjr(cells[idxSjr] ?? "");
    if (!(sjr > 0) || !title) continue;

    const tn = normJournalTitle(title.replace(/^"|"$/g, ""));
    if (tn) mergeMax(byTitleNorm, tn, sjr);

    const parts = issnRaw.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
    for (const p of parts) {
      const key = issnDigits(p);
      if (key) mergeMax(byIssn, key, sjr);
    }
  }

  const payload = {
    v: 1,
    source: "SCImago Journal Rank 2025 export",
    byIssn,
    byTitleNorm,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload), "utf8");
  console.log(
    `Wrote ${outPath} (${Object.keys(byIssn).length} ISSN keys, ${Object.keys(byTitleNorm).length} title keys)`,
  );
}

main();
