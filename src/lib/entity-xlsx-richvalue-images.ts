import { read as cfbRead } from "cfb";

type CfbEntry = { name?: string; content?: unknown };
type CfbContainer = { FileIndex: CfbEntry[] };

export type RichValueHeadshotBytes = {
  buffer: ArrayBuffer;
  mime: string;
};

function colIndex1BasedToLetters(index: number): string {
  let n = index;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cfbUtf8String(cfb: CfbContainer, basename: string): string | null {
  const hit = cfb.FileIndex.find((f) => f.name === basename);
  const raw = hit?.content;
  if (raw == null) return null;
  const u8 = toUint8Array(raw);
  return new TextDecoder("utf-8").decode(u8);
}

function toUint8Array(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (Array.isArray(raw)) return Uint8Array.from(raw);
  if (raw && typeof raw === "object" && "buffer" in raw && "byteLength" in raw) {
    const v = raw as ArrayBufferView;
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  }
  return new Uint8Array();
}

function cfbBytes(cfb: CfbContainer, basename: string): Uint8Array | null {
  const hit = cfb.FileIndex.find((f) => f.name === basename);
  const raw = hit?.content;
  if (raw == null) return null;
  const u8 = toUint8Array(raw);
  return u8.byteLength ? u8 : null;
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

function resolveFirstSheetBasename(workbookXml: string, relsXml: string): string | null {
  const rid = workbookXml.match(/<sheet[^>]*\br:id="(rId\d+)"/)?.[1];
  if (!rid) return null;
  const esc = rid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const relBlock = new RegExp(`<Relationship[^>]*\\bId="${esc}"[^>]*>`, "i").exec(relsXml)?.[0];
  if (!relBlock) return null;
  const target = relBlock.match(/Target="([^"]+)"/i)?.[1];
  if (!target) return null;
  const norm = target.replace(/^\/+/, "");
  const base = norm.split("/").pop();
  return base || null;
}

/**
 * Excel 365 "picture in cell" / IMAGE() stores pixels under xl/richData + xl/metadata (not xl/drawings).
 * Reads the Office Open XML ZIP via the `cfb` reader (same container SheetJS uses internally).
 */
export function extractHeadshotsFromExcelRichValueImageColumn(
  arrayBuffer: ArrayBuffer,
  imageCol1Based: number,
): Map<number, RichValueHeadshotBytes> {
  const out = new Map<number, RichValueHeadshotBytes>();
  if (!imageCol1Based || imageCol1Based < 1) return out;

  const cfb = cfbRead(new Uint8Array(arrayBuffer), { type: "array" });

  const workbookXml = cfbUtf8String(cfb, "workbook.xml");
  const workbookRels = cfbUtf8String(cfb, "workbook.xml.rels");
  if (!workbookXml || !workbookRels) return out;

  const sheetBasename = resolveFirstSheetBasename(workbookXml, workbookRels) ?? "sheet1.xml";
  const sheetXml = cfbUtf8String(cfb, sheetBasename);
  if (!sheetXml) return out;

  const metadataXml = cfbUtf8String(cfb, "metadata.xml");
  const rvXml = cfbUtf8String(cfb, "rdrichvalue.xml");
  const rvRelOrderXml = cfbUtf8String(cfb, "richValueRel.xml");
  const rvRelTargetsXml = cfbUtf8String(cfb, "richValueRel.xml.rels");
  if (!metadataXml || !rvXml || !rvRelOrderXml || !rvRelTargetsXml) return out;

  const valueMetaMatches = [...metadataXml.matchAll(/<bk>\s*<rc[^>]*\bv="(\d+)"[^>]*\/>\s*<\/bk>/g)];
  const richValueIndices = valueMetaMatches.map((m) => parseInt(m[1]!, 10));
  if (richValueIndices.length === 0) return out;

  const relIdsInOrder = [...rvRelOrderXml.matchAll(/<rel[^>]*\br:id="(rId\d+)"[^>]*\/?>/gi)].map(
    (m) => m[1]!,
  );
  if (relIdsInOrder.length === 0) return out;

  const rIdToFile = new Map<string, string>();
  for (const m of rvRelTargetsXml.matchAll(
    /<Relationship[^>]*\bId="(rId\d+)"[^>]*Target="\.\.\/media\/([^"]+)"/gi,
  )) {
    rIdToFile.set(m[1]!, m[2]!);
  }

  const rvBlocks = [...rvXml.matchAll(/<rv\b[^>]*>([\s\S]*?)<\/rv>/gi)];
  const relIndexPerRichValue: number[] = [];
  for (const block of rvBlocks) {
    const inner = block[1] ?? "";
    const firstV = inner.match(/<v>(\d+)<\/v>/);
    if (!firstV) continue;
    relIndexPerRichValue.push(parseInt(firstV[1]!, 10));
  }
  if (relIndexPerRichValue.length === 0) return out;

  const colLetters = colIndex1BasedToLetters(imageCol1Based);

  const cellOpen = /<c\b([^>]+)>/gi;
  let cellMatch: RegExpExecArray | null;
  while ((cellMatch = cellOpen.exec(sheetXml)) !== null) {
    const attrs = cellMatch[1] ?? "";
    const rM = /\br="([A-Z]+)(\d+)"/.exec(attrs);
    const vmM = /\bvm="(\d+)"/.exec(attrs);
    if (!rM || !vmM) continue;
    const letters = rM[1]!;
    const row = parseInt(rM[2]!, 10);
    if (letters !== colLetters || row < 2) continue;

    const vm = parseInt(vmM[1]!, 10);
    if (!Number.isFinite(vm) || vm < 1) continue;
    const richValIdx = richValueIndices[vm - 1];
    if (richValIdx === undefined || !Number.isFinite(richValIdx)) continue;

    const relIdx = relIndexPerRichValue[richValIdx];
    if (relIdx === undefined || !Number.isFinite(relIdx)) continue;

    const rId = relIdsInOrder[relIdx];
    if (!rId) continue;
    const mediaName = rIdToFile.get(rId);
    if (!mediaName) continue;

    const bytes = cfbBytes(cfb, mediaName);
    if (!bytes || bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) continue;

    const ext = (mediaName.split(".").pop() ?? "png").toLowerCase();
    const mime = extensionToMime(ext);
    if (!mime) continue;

    const dataIndex = row - 2;
    out.set(dataIndex, { buffer: bytesToArrayBuffer(bytes), mime });
  }

  return out;
}
