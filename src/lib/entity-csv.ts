import type { MemberStatus } from "@/types/database";
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
  last_name: string;
  member_status: MemberStatus;
  slug: string;
  institution: string | null;
  pubmed_url: string | null;
  lab_website: string | null;
  google_alert_query: string | null;
  nih_profile_id: string | null;
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
  const iMember = idx("member_status");
  const iSlug = idx("slug");
  const iInst = idx("institution");
  const iPmUrl = idx("pubmed_url");
  const iLab = idx("lab_website");
  const iGa = idx("google_alert_query");
  const iNih = idx("nih_profile_id");
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

    rows.push({
      first_name: firstName,
      last_name: lastName,
      member_status: memberStatus,
      slug,
      institution: iInst >= 0 ? (cells[iInst] ?? "").trim() || null : null,
      pubmed_url: iPmUrl >= 0 ? (cells[iPmUrl] ?? "").trim() || null : null,
      lab_website: iLab >= 0 ? (cells[iLab] ?? "").trim() || null : null,
      google_alert_query: iGa >= 0 ? (cells[iGa] ?? "").trim() || null : null,
      nih_profile_id: iNih >= 0 ? parseNihProfileIdCell(cells[iNih]) : null,
      priority_tier: tierFromMemberStatus(memberStatus),
      active: iActive >= 0 ? parseBool(cells[iActive]) : true,
    });
  });

  return { rows, errors };
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
  return rowsToEntities(data, header);
}

export const ENTITY_CSV_TEMPLATE = `Last Name,First Name,Member status,slug,institution,pubmed_url,lab_website,google_alert_query,nih_profile_id,active
Smith,Jane,Associate,jane-smith,UCSF,,,,,true
Chen,Maya,Member,maya-chen,Stanford University,,,,,true
Ng,Riley,Leadership Committee,riley-ng,"UCSF; University of California San Francisco",,,,,true`;
