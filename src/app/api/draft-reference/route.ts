import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  source_item_id: z.string().uuid(),
  model: z.string().min(1).optional(),
});
const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function extractReporterIcFromRawSummary(rawSummary: string | null): string | null {
  if (!rawSummary) return null;
  const first = rawSummary
    .split(" · ")
    .map((x) => x.trim())
    .find(Boolean);
  return first || null;
}

function extractPubmedPmidFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
  return m?.[1] ?? null;
}

function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/["“”'`]/g, "").replace(/\s+/g, " ").trim();
}

function ensurePaperAuthorPrefix(reference: string, authorList: string | null): string {
  const authors = (authorList ?? "").trim();
  if (!authors) return reference;
  const ref = reference.trim();
  if (!ref) return `${authors}.`;
  if (normalizeForCompare(ref).startsWith(normalizeForCompare(authors))) return ref;
  return `${authors}. ${ref}`;
}

function limitPaperAuthorList(authorList: string | null): string | null {
  if (!authorList) return null;
  const authors = authorList
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (authors.length === 0) return null;
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")}, et al.`;
}

function dedupeAdjacentReferenceSegments(reference: string): string {
  const segments = reference
    .split(".")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length <= 1) return reference.trim();

  const deduped: string[] = [];
  for (const segment of segments) {
    const previous = deduped[deduped.length - 1];
    if (previous && normalizeForCompare(previous) === normalizeForCompare(segment)) continue;
    deduped.push(segment);
  }
  return `${deduped.join(". ")}.`;
}

type PubmedArticleSummary = {
  authorList: string | null;
  journal: string | null;
  pubDateLabel: string | null;
  year: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
};

function extractYearFromPubmedRecord(pubdate: string | undefined, sortpubdate: string | undefined): string | null {
  const m = (pubdate ?? "").match(/^(\d{4})\b/) ?? (sortpubdate ?? "").match(/^(\d{4})/);
  return m?.[1] ?? null;
}

async function fetchPubmedArticleSummaryByPmid(pmid: string): Promise<PubmedArticleSummary | null> {
  const apiKey = process.env.NCBI_API_KEY?.trim();
  const keyParam = apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : "";
  try {
    const res = await fetch(
      `${EUTILS}/esummary.fcgi?db=pubmed&retmode=json&id=${encodeURIComponent(pmid)}${keyParam}`,
      { headers: { "User-Agent": "CommunitySignalDigest/1.0 (draft-reference)" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: Record<string, unknown> & { uids?: string[] };
    };
    const record = json.result?.[pmid] as
      | {
          authors?: { name?: string }[];
          source?: string;
          fulljournalname?: string;
          pubdate?: string;
          sortpubdate?: string; // e.g. 2024/01/10 00:00
          volume?: string;
          issue?: string;
          pages?: string;
        }
      | undefined;
    if (!record) return null;
    const names = Array.isArray(record.authors)
      ? record.authors
          .map((a) => (typeof a?.name === "string" ? a.name.trim() : ""))
          .filter(Boolean)
      : [];
    const str = (v: unknown) => (typeof v === "string" ? v.trim() || null : null);
    const journal = str(record.source) ?? str(record.fulljournalname);
    return {
      authorList: names.length > 0 ? names.join(", ") : null,
      journal,
      pubDateLabel: str(record.pubdate),
      year: extractYearFromPubmedRecord(record.pubdate, record.sortpubdate),
      volume: str(record.volume),
      issue: str(record.issue),
      pages: str(record.pages),
    };
  } catch {
    return null;
  }
}

/** Remove a spurious space before the closing title quote (…word. " Journal → …word." Journal). */
function fixSpaceBeforeClosingTitleQuote(reference: string): string {
  return reference.replace(/(\.)\s+(["'""\u201c\u201d\u2018\u2019])\s+([A-Z0-9#])/g, "$1$2 $3");
}

/** Strip template literals the model echoed; fill :Pages from PubMed when available. */
function fixVolumeIssuePagesArtifacts(reference: string, pubmed: PubmedArticleSummary | null): string {
  let s = reference;
  const vol = pubmed?.volume ?? "";
  const iss = pubmed?.issue ?? "";
  const pgs = pubmed?.pages ?? "";
  const vi = vol && iss ? `${vol}(${iss})` : vol ? vol : iss ? `(${iss})` : "";

  if (pgs) {
    s = s.replace(/:\s*Pages\b\.?/gi, `:${pgs}.`);
    s = s.replace(/\bVolume\s*\(\s*Issue\s*\)\s*:\s*Pages\b\.?/gi, () => (vi ? `${vi}:${pgs}.` : `${pgs}.`));
  } else {
    s = s.replace(/;?\s*\bVolume\s*\(\s*Issue\s*\)\s*:\s*Pages\b\.?/gi, "");
    s = s.replace(/\(\s*Issue\s*\)\s*:\s*Pages\b\.?/gi, "");
    s = s.replace(/:\s*Pages\b\.?/gi, ".");
  }
  s = s.replace(/\s+\.(?=\s*$)/, ".").replace(/\.\s*\.\s*$/g, ".").replace(/\s{2,}/g, " ");
  return s.trim();
}

function polishPaperReferenceLine(reference: string, pubmed: PubmedArticleSummary | null): string {
  return fixVolumeIssuePagesArtifacts(fixSpaceBeforeClosingTitleQuote(reference.trim()), pubmed);
}

/** NIH mechanism from project number (e.g., 5R01AI175312-04 -> R01). */
function extractNihMechanism(projectNum: string | null): string | null {
  const s = (projectNum ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return null;
  const m = s.match(/^[1-9]?([A-Z]\d{2})/);
  return m?.[1] ?? null;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { source_item_id, model: requestedModel } = parsed.data;
  const { data: item, error: itemErr } = await supabase
    .from("source_items")
    .select(
      "id, title, source_type, source_url, published_at, category, raw_summary, raw_text, nih_project_num, tracked_entity_id, tracked_entities!tracked_entity_id ( name )",
    )
    .eq("id", source_item_id)
    .maybeSingle();

  if (itemErr || !item) {
    return NextResponse.json({ error: "Source item not found" }, { status: 404 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
  }
  const openai = new OpenAI({ apiKey });

  const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const ALLOWED_MODELS = new Set([
    DEFAULT_MODEL,
    "gpt-4o-mini",
    "gpt-4.1-mini",
    "gpt-4o",
    "gpt-4.1",
  ]);
  const model = requestedModel && ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;

  const tracked = item.tracked_entities as { name?: string } | { name?: string }[] | null;
  const piName = Array.isArray(tracked)
    ? tracked[0]?.name?.trim() ?? null
    : tracked && typeof tracked === "object"
      ? (tracked.name?.trim() ?? null)
      : null;
  const nihIc = extractReporterIcFromRawSummary(item.raw_summary ?? null);
  const mechanism = extractNihMechanism(item.nih_project_num ?? null);
  const pmid =
    item.source_type === "pubmed" ? extractPubmedPmidFromUrl(item.source_url ?? null) : null;
  const pubmedSummary = pmid ? await fetchPubmedArticleSummaryByPmid(pmid) : null;
  const paperAuthorList = limitPaperAuthorList(pubmedSummary?.authorList ?? null);

  const pubmedBibliographyLines: string[] = [];
  if (pubmedSummary && item.category === "paper") {
    pubmedBibliographyLines.push("PubMed-indexed bibliographic fields (use verbatim; omit any line’s segment if you cannot place it correctly):");
    if (pubmedSummary.journal) pubmedBibliographyLines.push(`- Journal: ${pubmedSummary.journal}`);
    if (pubmedSummary.year) pubmedBibliographyLines.push(`- Year: ${pubmedSummary.year}`);
    if (pubmedSummary.pubDateLabel) pubmedBibliographyLines.push(`- PubMed date: ${pubmedSummary.pubDateLabel}`);
    if (pubmedSummary.volume) pubmedBibliographyLines.push(`- Volume: ${pubmedSummary.volume}`);
    if (pubmedSummary.issue) pubmedBibliographyLines.push(`- Issue: ${pubmedSummary.issue}`);
    if (pubmedSummary.pages) pubmedBibliographyLines.push(`- Pages: ${pubmedSummary.pages}`);
  }

  const sourceFacts = [
    `Title: ${item.title}`,
    `Type: ${item.source_type}`,
    item.category ? `Category: ${item.category}` : "",
    paperAuthorList ? `Paper Author List: ${paperAuthorList}` : "",
    ...pubmedBibliographyLines,
    piName ? `Funding PI Name: ${piName}` : "",
    item.nih_project_num ? `Funding Project Number: ${item.nih_project_num}` : "",
    nihIc ? `Funding NIH Institute/Center: ${nihIc}` : "",
    mechanism ? `Funding Mechanism: ${mechanism}` : "",
    item.published_at ? `Published date: ${item.published_at}` : "",
    item.source_url ? `Source URL: ${item.source_url}` : "",
    item.raw_summary ? `Raw summary: ${item.raw_summary}` : "",
    item.raw_text ? `Raw text: ${item.raw_text.slice(0, 8000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You create concise bibliography/reference drafts for monthly newsletter editors. Return plain text only, no markdown, no bullets, no JSON.",
        },
        {
          role: "user",
          content: `Create one polished citation/reference line for this signal.\n\nFormatting rules:\n- If Category is paper and "Paper Author List" is provided, you MUST start the output with that exact author list.\n- If this is a paper/publication, use this structure (straight double quotes around the title):\n  Author list. "Article title." Journal Abbrev_or_Full Year; then volume and issue in the form 12(3) when both exist, a colon, then page range or article number (e.g. e123 or 456-460). If volume, issue, or pages are not in the facts, omit that part—do not write placeholders, template text, or the word "Pages" as a stand-in.\n- If this is a grant/award/funding signal, use exactly this format:\n  PI Name. Project Title. NIH Institute/Center. Mechanism.\n- If any required field is missing, keep the same order and omit only the missing segment cleanly (no placeholders like N/A or Volume(Issue):Pages).\n- Keep output factual and under 320 characters when possible.\n\n${sourceFacts}`,
        },
      ],
      temperature: 0.2,
    });
    const rawReference = completion.choices[0]?.message?.content?.trim() ?? "";
    const reference =
      item.category === "paper"
        ? polishPaperReferenceLine(
            dedupeAdjacentReferenceSegments(ensurePaperAuthorPrefix(rawReference, paperAuthorList)),
            pubmedSummary,
          )
        : item.category === "funding"
          ? dedupeAdjacentReferenceSegments(rawReference)
          : rawReference;
    if (!reference) {
      return NextResponse.json({ error: "No reference generated" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, reference });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OpenAI request failed" },
      { status: 502 },
    );
  }
}
