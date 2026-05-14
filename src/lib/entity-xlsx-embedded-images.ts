export type EmbeddedHeadshotBytes = {
  buffer: ArrayBuffer;
  mime: string;
};

export type ExtractEmbeddedHeadshotsOptions = {
  /**
   * Header text from the same workbook (e.g. SheetJS `sheet_to_json` row 0).
   * Prefer this over scanning ExcelJS row 1: ExcelJS `eachCell` only reaches `row.cellCount`,
   * so a trailing "Image" column can be missed when earlier columns are sparse.
   */
  headerLabels?: string[];
  /** 1-based worksheet row that contains headers (default 1). */
  headerRowNumber?: number;
};

function normalizeEmbeddedImageHeaderLabel(raw: string): string {
  return raw
    .replace(/^\uFEFF/u, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Column is treated as the embedded-picture column (not URL headshots). */
function matchesEmbeddedImageColumnHeader(normalized: string): boolean {
  return (
    normalized === "image" ||
    normalized === "picture" ||
    normalized === "pictures" ||
    normalized === "embedded image"
  );
}

/** 1-based column index of the embedded-image column, or null if none of the headers match. */
export function findEmbeddedImageHeaderColumn1Based(headerLabels: string[]): number | null {
  for (let i = 0; i < headerLabels.length; i++) {
    const n = normalizeEmbeddedImageHeaderLabel(String(headerLabels[i] ?? ""));
    if (matchesEmbeddedImageColumnHeader(n)) return i + 1;
  }
  return null;
}

function extensionToMime(ext: string): string | null {
  const e = ext.trim().toLowerCase();
  if (e === "png") return "image/png";
  if (e === "jpg" || e === "jpeg") return "image/jpeg";
  if (e === "gif") return "image/gif";
  if (e === "webp") return "image/webp";
  return null;
}

function bytesToArrayBuffer(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  const u =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const copy = new Uint8Array(u.byteLength);
  copy.set(u);
  return copy.buffer;
}

/**
 * Reads embedded pictures from the first worksheet where the picture anchor sits in a column
 * whose header matches the embedded-image column names (e.g. "Image", case-insensitive, BOM-safe).
 * Keys are 0-based indices into the tabular data row array (same as `parseEntityTable` /
 * `rowsToEntities` `dataIndex`).
 */
export async function extractEmbeddedHeadshotsFromFirstSheet(
  arrayBuffer: ArrayBuffer,
  options?: ExtractEmbeddedHeadshotsOptions,
): Promise<Map<number, EmbeddedHeadshotBytes>> {
  const exceljs = await import("exceljs");
  const WB = exceljs.Workbook;
  const wb = new WB();

  const loadPayload =
    typeof Buffer !== "undefined"
      ? Buffer.from(arrayBuffer)
      : (new Uint8Array(arrayBuffer) as unknown as Buffer);

  await wb.xlsx.load(loadPayload as never);

  const ws = wb.worksheets[0];
  const out = new Map<number, EmbeddedHeadshotBytes>();
  if (!ws) return out;

  const headerRowNumber = options?.headerRowNumber ?? 1;
  const headerRow = ws.getRow(headerRowNumber);

  let imageCol1Based =
    options?.headerLabels && options.headerLabels.length > 0
      ? findEmbeddedImageHeaderColumn1Based(options.headerLabels)
      : null;

  if (imageCol1Based === null) {
    const dim = ws.dimensions;
    let maxCol = Math.max(headerRow.cellCount, dim.right, 1);
    for (const img of ws.getImages()) {
      if (img.type !== "image" || !img.range?.tl) continue;
      maxCol = Math.max(maxCol, (img.range.tl.nativeCol ?? 0) + 1);
      const br = img.range.br;
      if (br) maxCol = Math.max(maxCol, (br.nativeCol ?? 0) + 1);
    }
    for (let c = 1; c <= maxCol; c++) {
      const cell = headerRow.findCell(c);
      if (!cell) continue;
      const n = normalizeEmbeddedImageHeaderLabel(cell.text);
      if (matchesEmbeddedImageColumnHeader(n)) {
        imageCol1Based = c;
        break;
      }
    }
  }

  if (imageCol1Based === null) return out;

  const imageColNative = imageCol1Based - 1;

  for (const img of ws.getImages()) {
    if (img.type !== "image") continue;
    const tl = img.range?.tl;
    if (!tl) continue;
    const tlCol = tl.nativeCol ?? Math.max(0, Math.floor(Number(tl.col) || 0));
    const br = img.range.br;
    const brCol = br
      ? br.nativeCol ?? Math.max(0, Math.floor(Number(br.col) || 0))
      : tlCol;
    const minCol = Math.min(tlCol, brCol);
    const maxCol = Math.max(tlCol, brCol);
    if (imageColNative < minCol || imageColNative > maxCol) continue;

    const rowNative = tl.nativeRow ?? Math.max(0, Math.floor(Number(tl.row) || 0));
    if (rowNative < 1) continue;
    const dataIndex = rowNative - 1;

    const imageId = typeof img.imageId === "number" ? img.imageId : Number(img.imageId);
    if (!Number.isFinite(imageId)) continue;

    const medium = wb.getImage(imageId) as
      | { buffer?: Buffer | Uint8Array; extension?: string }
      | undefined;
    if (!medium?.buffer) continue;

    const ext = (medium.extension ?? "png").toLowerCase();
    const mime = extensionToMime(ext);
    if (!mime) continue;

    const ab = bytesToArrayBuffer(medium.buffer);
    if (ab.byteLength === 0) continue;
    if (ab.byteLength > 5 * 1024 * 1024) continue;

    out.set(dataIndex, { buffer: ab, mime });
  }

  /** Excel 365 IMAGE() / "place in cell" uses richData + metadata, not drawing anchors. */
  const { extractHeadshotsFromExcelRichValueImageColumn } = await import(
    "@/lib/entity-xlsx-richvalue-images"
  );
  const richMap = extractHeadshotsFromExcelRichValueImageColumn(arrayBuffer, imageCol1Based);
  for (const [k, v] of richMap) {
    if (!out.has(k)) out.set(k, v);
  }

  return out;
}
