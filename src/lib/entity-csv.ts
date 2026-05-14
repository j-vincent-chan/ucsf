import type { MemberStatus } from "@/types/database";
import type { EmbeddedHeadshotBytes } from "@/lib/entity-xlsx-embedded-images";
import { slugify } from "@/lib/slug";
import { tierFromMemberStatus } from "@/lib/member-tier";

/** Minimal CSV parser with double-quote escaping and CRLF support */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  const pushCell = () => {
    row.push(cur);
    cur = "";
  };
  const flushRow = () => {
    if (row.length > 1 || row[0] !== "") {
      rows.push(row);
    }
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushCell();
    } else if (c === "\n") {
      pushCell();
      flushRow();
    } else if (c === "\r") {
      if (text[i + 1] === "\n") {
        i++;
      }
      pushCell();
      flushRow();
    } else {
      cur += c;
    }
  }
  pushCell();
  if (row.some((c) => c.trim() !== "")) {
    rows.push(row);
  }

  return rows.map((r) => r.map((c) => c.trim()));
}

/** Map human CSV headers to canonical keys */
function canonicalHeader(raw: string): string {
  const spaced = raw.trim().toLowerCase().replace(/\s*\/\s*/g, "/");
  const aliases: Record<string, string> = {
    "last name": "last_name",
    lastname: "last_name",
    "first name": "first_name",
    firstname: "first_name",
    "middle initial": "middle_initial",
    middleinitial: "middle_initial",
    "middle name": "middle_initial",
    "associate/full member": "member_status",
    "associate full member": "member_status",
    membership: "member_status",
    "member status": "member_status",
    school: "institution",
    university: "institution",
    organization: "institution",
    organisation: "institution",
    institution: "institution",
    "pubmed url": "pubmed_url",
    pubmedurl: "pubmed_url",
    "lab website": "lab_website",
    labwebsite: "lab_website",
    "lab site": "lab_website",
    labsite: "lab_website",
    nih_profile_id: "nih_profile_id",
    "nih profile id": "nih_profile_id",
    "nih reporter profile id": "nih_profile_id",
    "twitter handle": "x_handle",
    "x/twitter": "x_handle",
    headshot: "headshot_url",
    "headshot url": "headshot_url",
    "head shot": "headshot_url",
    photo: "headshot_url",
    "photo url": "headshot_url",
    "profile photo": "headshot_url",
    "profile image": "headshot_url",
    "linkedin photo": "headshot_url",
    "linkedin image": "headshot_url",
    "linkedin headshot": "headshot_url",
    investigator_photo: "headshot_url",
    "investigator photo": "headshot_url",
    image_url: "headshot_url",
    "image url": "headshot_url",
    portrait: "headshot_url",
    "portrait url": "headshot_url",
    image: "headshot_url",
    photo_url: "headshot_url",
  };
  if (aliases[spaced]) return aliases[spaced];
  return spaced
    .replace(/\//g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_");
}

function parseBool(v: string | undefined): boolean {
  if (v === undefined || v === "") return true;
  const s = v.trim().toLowerCase();
  return !["false", "0", "no", "n"].includes(s);
}

/** NIH profile IDs (RePORTER person IDs) are numeric; ignore malformed cells. */
function parseNihProfileIdCell(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  return /^\d+$/.test(t) ? t : null;
}

/** X / Bluesky usernames: strip leading @, trim; empty → null. */
function parseSocialHandleCell(v: string | undefined): string | null {
  const t = (v ?? "").replace(/^@+/u, "").trim();
  return t || null;
}

/** Accepts http(s) image URLs; rejects non-URLs and oversized strings. */
function parseHeadshotUrlCell(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  if (t.length > 4000) return null;
  if (!/^https?:\/\//i.test(t)) return null;
  return t;
}

function parseMemberStatus(raw: string): MemberStatus | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!s) return null;
  const underscored = s.replace(/\s+/g, "_");
  if (
    s === "leadership committee" ||
    underscored === "leadership_committee" ||
    underscored === "leadershipcommittee" ||
    s === "leadership"
  ) {
    return "leadership_committee";
  }
  if (
    s === "member" ||
    s === "full member" ||
    s === "full_member" ||
    s === "fullmember" ||
    s === "full"
  ) {
    return "member";
  }
  if (
    s === "associate" ||
    s === "assoc" ||
    s === "a" ||
    s.startsWith("associate")
  ) {
    return "associate";
  }
  return null;
}

export type EntityCsvRowResult = {
  first_name: string;
  middle_initial: string;
  last_name: string;
  member_status: MemberStatus;
  slug: string;
  institution: string | null;
  pubmed_url: string | null;
  lab_website: string | null;
  google_alert_query: string | null;
  nih_profile_id: string | null;
  /** Present only when the CSV header included this column (avoids wiping handles on re-import). */
  x_handle?: string | null;
  bluesky_handle?: string | null;
  x_lab_handle?: string | null;
  bluesky_lab_handle?: string | null;
  /** Present only when the sheet included a headshot / photo URL column. */
  headshot_url?: string | null;
  /** Index of this row in the parsed data matrix (0-based). Used for embedded Excel images. */
  sourceDataRowIndex?: number;
  priority_tier: number;
  active: boolean;
};

export type EntityCsvError = { row: number; message: string };

export function rowsToEntities(
  dataRows: string[][],
  header: string[],
): { rows: EntityCsvRowResult[]; errors: EntityCsvError[] } {
  const keys = header.map(canonicalHeader);
  const idx = (name: string) => keys.indexOf(name);

  const iLast = idx("last_name");
  const iFirst = idx("first_name");
  const iMiddle = idx("middle_initial");
  const iMember = idx("member_status");
  const iSlug = idx("slug");
  const iInst = idx("institution");
  const iPmUrl = idx("pubmed_url");
  const iLab = idx("lab_website");
  const iGa = idx("google_alert_query");
  const iNih = idx("nih_profile_id");
  const iX = idx("x_handle");
  const iBsky = idx("bluesky_handle");
  const iXLab = idx("x_lab_handle");
  const iBskyLab = idx("bluesky_lab_handle");
  const iHeadshot = idx("headshot_url");
  const iActive = idx("active");

  const errors: EntityCsvError[] = [];
  if (iLast < 0) {
    errors.push({ row: 1, message: 'Missing required column "Last Name"' });
  }
  if (iFirst < 0) {
    errors.push({ row: 1, message: 'Missing required column "First Name"' });
  }
  if (iMember < 0) {
    errors.push({
      row: 1,
      message:
        'Missing member status column (e.g. "Member status", "Associate/Full Member", or member_status)',
    });
  }
  if (errors.length) {
    return { rows: [], errors };
  }

  const rows: EntityCsvRowResult[] = [];
  const seenSlugs = new Map<string, number>();

  dataRows.forEach((cells, dataIndex) => {
    const lineNum = dataIndex + 2;
    if (cells.every((c) => c === "")) return;

    const lastName = (cells[iLast] ?? "").trim();
    const firstName = (cells[iFirst] ?? "").trim();
    const middleInitial = iMiddle >= 0 ? (cells[iMiddle] ?? "").trim().slice(0, 1).toUpperCase() : "";
    if (!lastName) {
      errors.push({ row: lineNum, message: "Last Name is empty" });
      return;
    }
    if (!firstName) {
      errors.push({ row: lineNum, message: "First Name is empty" });
      return;
    }

    const memberRaw = (cells[iMember] ?? "").trim();
    const memberStatus = parseMemberStatus(memberRaw);
    if (!memberStatus) {
      errors.push({
        row: lineNum,
        message:
          'Member status must be Member, Associate, or Leadership Committee (legacy: Full Member → Member)',
      });
      return;
    }

    let slug = (iSlug >= 0 ? cells[iSlug] : "")?.trim() ?? "";
    if (!slug) {
      slug = slugify(`${lastName}-${firstName}`);
    }

    const prev = seenSlugs.get(slug);
    if (prev !== undefined) {
      errors.push({
        row: lineNum,
        message: `duplicate slug "${slug}" (also on row ${prev})`,
      });
      return;
    }
    seenSlugs.set(slug, lineNum);

    const headshotCell = iHeadshot >= 0 ? parseHeadshotUrlCell(cells[iHeadshot]) : null;

    rows.push({
      first_name: firstName,
      middle_initial: middleInitial,
      last_name: lastName,
      member_status: memberStatus,
      slug,
      institution: iInst >= 0 ? (cells[iInst] ?? "").trim() || null : null,
      pubmed_url: iPmUrl >= 0 ? (cells[iPmUrl] ?? "").trim() || null : null,
      lab_website: iLab >= 0 ? (cells[iLab] ?? "").trim() || null : null,
      google_alert_query: iGa >= 0 ? (cells[iGa] ?? "").trim() || null : null,
      nih_profile_id: iNih >= 0 ? parseNihProfileIdCell(cells[iNih]) : null,
      ...(iX >= 0 ? { x_handle: parseSocialHandleCell(cells[iX]) } : {}),
      ...(iBsky >= 0 ? { bluesky_handle: parseSocialHandleCell(cells[iBsky]) } : {}),
      ...(iXLab >= 0 ? { x_lab_handle: parseSocialHandleCell(cells[iXLab]) } : {}),
      ...(iBskyLab >= 0
        ? { bluesky_lab_handle: parseSocialHandleCell(cells[iBskyLab]) }
        : {}),
      ...(headshotCell ? { headshot_url: headshotCell } : {}),
      priority_tier: tierFromMemberStatus(memberStatus),
      active: iActive >= 0 ? parseBool(cells[iActive]) : true,
      sourceDataRowIndex: dataIndex,
    });
  });

  return { rows, errors };
}

export function parseEntityTable(
  header: string[],
  dataRows: string[][],
): { rows: EntityCsvRowResult[]; errors: EntityCsvError[] } {
  if (header.length === 0 || header.every((h) => !String(h ?? "").trim())) {
    return { rows: [], errors: [{ row: 0, message: "Missing header row" }] };
  }
  return rowsToEntities(dataRows, header);
}

export function parseEntityCsv(text: string): {
  rows: EntityCsvRowResult[];
  errors: EntityCsvError[];
} {
  const all = parseCsvRows(text.trim());
  if (all.length === 0) {
    return { rows: [], errors: [{ row: 0, message: "CSV is empty" }] };
  }
  const [header, ...data] = all;
  return parseEntityTable(header, data);
}

function stringifySpreadsheetCell(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string") return cell.trim();
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
  return String(cell).trim();
}

/** First worksheet only; dynamic import keeps the xlsx bundle off the initial load until used. */
export async function parseEntityXlsx(arrayBuffer: ArrayBuffer): Promise<{
  rows: EntityCsvRowResult[];
  errors: EntityCsvError[];
  embeddedHeadshotsByDataIndex?: Map<number, EmbeddedHeadshotBytes>;
  /** Set when the sheet names an Image/Picture column but no anchors matched (misplaced anchors, wrong sheet, etc.). */
  embeddedHeadshotExtractionWarning?: string;
}> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: [{ row: 0, message: "Workbook has no sheets" }] };
  }
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    return { rows: [], errors: [{ row: 0, message: "First sheet could not be read" }] };
  }
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];
  const strMatrix = matrix.map((row) =>
    (Array.isArray(row) ? row : []).map(stringifySpreadsheetCell),
  );
  if (strMatrix.length === 0) {
    return { rows: [], errors: [{ row: 0, message: "Sheet is empty" }] };
  }
  const [headerRow, ...dataRows] = strMatrix;
  const header = (headerRow ?? []).map((h) => String(h ?? ""));
  const parsed = parseEntityTable(header, dataRows);

  let embeddedHeadshotsByDataIndex: Map<number, EmbeddedHeadshotBytes> | undefined;
  let embeddedHeadshotExtractionWarning: string | undefined;
  if (parsed.errors.length === 0) {
    try {
      const {
        extractEmbeddedHeadshotsFromFirstSheet,
        findEmbeddedImageHeaderColumn1Based,
      } = await import("@/lib/entity-xlsx-embedded-images");
      const embedded = await extractEmbeddedHeadshotsFromFirstSheet(arrayBuffer, {
        headerLabels: header,
      });
      if (embedded.size > 0) {
        embeddedHeadshotsByDataIndex = embedded;
      } else if (findEmbeddedImageHeaderColumn1Based(header) != null) {
        embeddedHeadshotExtractionWarning =
          "This file has an Image (or Picture) column, but no photos were read from it. " +
          "Use Excel 365 pictures in that column, paste embedded images, or provide image URLs in the headshot column.";
      }
    } catch {
      /* ignore — tabular import still succeeds */
    }
  }

  return { ...parsed, embeddedHeadshotsByDataIndex, embeddedHeadshotExtractionWarning };
}

export const ENTITY_CSV_TEMPLATE = `Last Name,First Name,Middle Initial,Member status,slug,institution,pubmed_url,lab_website,google_alert_query,nih_profile_id,x_handle,bluesky_handle,x_lab_handle,bluesky_lab_handle,headshot_url,active
Smith,Jane,M,Associate,jane-smith,UCSF,,,,,,,,,,true
Chen,Maya,,Member,maya-chen,Stanford University,,,,,,,,,,true
Ng,Riley,A,Leadership Committee,riley-ng,"UCSF; University of California San Francisco",,,,,,,,,,true`;
