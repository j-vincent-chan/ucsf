import { NextResponse } from "next/server";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { createClient } from "@/lib/supabase/server";
import { blurbJsonSchema } from "@/lib/blurb-content";
import {
  fetchPubmedLastAuthorFullNameByPmid,
  isPubmedStyleAbbrevAuthor,
} from "@/lib/discovery/pubmed-last-author-full";
import type { SummaryStyle } from "@/types/database";
import { z } from "zod";

const bodySchema = z.object({
  source_item_id: z.string().uuid(),
  style: z.enum([
    "newsletter",
    "donor",
    "social",
    "concise",
    "linkedin",
    "bluesky_x",
  ]),
  model: z.string().min(1).optional(),
});

const PROMPT_VERSION = "v3.5";
const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

const GLOBAL_RULES = `You write platform-specific versions of the same research update for an oncology immunotherapy community (ImmunoX / OCR context).

Output valid JSON only, matching the schema exactly: headline, blurb, why_it_matters, confidence_notes (all strings).

Cross-platform rules:
- This version is for ONE channel only. Do not reuse the same sentences or parallel "template" wording you would use on another platform; each channel must read like distinct copy, not a resized draft of the same text.
- Keep facts aligned with the source; never invent claims. If something is uncertain, note it briefly in confidence_notes.
- Co-authorship: do not imply other named investigators belong to one person. Avoid possessive "his team", "her team", "his lab", "her lab", or similar for mixed authorship. Prefer neutral wording ("colleagues", "co-authors", "the authors") or name people in parallel without subordinating them to someone else's "team".
- When the user message gives a publication last author, do not attribute sole "conducted by", "led by", "headed by", or "spearheaded by" to a different person (first author in abstract, watchlist order, or "Tracked investigator") unless the source clearly identifies that other person as the same individual as the last author.

Field roles:
- headline: a channel-appropriate hook (length and tone match the platform below).
- blurb: the main body for this platform (length, structure, and tone per platform rules).
- why_it_matters: one clear line on stakes or relevance for readers. For the very shortest platform, keep it non-redundant with blurb—add angle or framing, do not repeat the blurb verbatim.

Voice (every platform):
- Smart, modern, concise, editorial. Never robotic or overly institutional.`;

const PLATFORM = {
  newsletter: `CHANNEL: Newsletter (longest version).
- Aim ~110–170 words in blurb (headline separate). This is the richest, most editorial pass.
- Add context, synthesis, and why it matters inside the flow—polished and useful for reporting or internal briefings.
- Do not repeat the source title verbatim. Name people/groups and tie to ImmunoX, OCR, or the broader immunotherapy landscape where the source supports it.`,

  linkedin: `CHANNEL: LinkedIn (medium length).
- Aim ~70–115 words in blurb. Professional, credible, skimmable.
- Lead with a clear insight or takeaway (in headline or opening of blurb).
- Short paragraphs or line breaks mentally OK in the single blurb string. At most 1–2 hashtags only if they feel natural; no hashtag stuffing.`,

  bluesky_x: `CHANNEL: Social media — short posts (e.g. Bluesky, X).
- One idea per post. Blurb is the post: aim under 260 characters when possible (hard cap 280). Sharp, immediate, zero fluff.
- Prefer plain language. At most one hashtag if it clearly helps; often none.
- Headline: optional 3–8 word stake in the ground that does not duplicate the blurb verbatim. why_it_matters: one short clause (not a second post).`,

  donor: `CHANNEL: Donor-facing (legacy).
- Warm, precise, impact-oriented. Blurb under ~120 words. No sensationalism.`,

  social: `CHANNEL: Social (legacy).
- Single professional post. Blurb under ~220 characters when possible; punchy headline.`,

  concise: `CHANNEL: Concise (legacy).
- One tight paragraph; blurb under ~55 words.`,
} satisfies Record<Exclude<SummaryStyle, "instagram">, string>;

/** True if publication last author matches a People / watchlist display name (order-insensitive). */
function publicationLeadOnPeopleList(lead: string, peopleNames: string[]): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/[.,]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const L = norm(lead);
  if (!L) return false;
  for (const p of peopleNames) {
    const P = norm(p);
    if (!P) continue;
    if (L === P) return true;
    const lt = L.split(" ").filter(Boolean).sort().join(" ");
    const pt = P.split(" ").filter(Boolean).sort().join(" ");
    if (lt === pt) return true;
  }
  return false;
}

function systemPrompt(
  style: Exclude<SummaryStyle, "instagram">,
  publicationLead: string | null,
  leadOnPeopleList: boolean,
): string {
  const lead = publicationLead?.trim() || null;
  const publicationLeadRules = lead
    ? leadOnPeopleList
      ? `Publication lead / senior investigator (last author) — on People list; follow when this block appears:
- The publication last author to treat as senior/lead for narrative framing is: "${lead}".
- Open the headline and the blurb by centering this person as the lead or principal investigator (e.g. "Justin Eyquem and colleagues…" / "In work led by …"). Do not open by featuring the first author or another co-author as the primary lead unless they are the same person as this last author. If you use sole "conducted by" / "led by" with one name, it must be "${lead}"—not a different watchlist investigator. When naming co-authors, never use "his team" / "her team"—other investigators are not their subordinates; use "colleagues" or list names without possessive team framing.
- If the string is in PubMed-style "LastName initials" form, expand to the fullest name that appears with that surname in the supplied author list, Summary, or Full text.
- In headline and blurb, always write this person using their full given name(s) and surname (for example "Jingjing Li"). Never use surname plus bare initials alone (do not write "Li J").
- Still mention every other linked watchlist investigator by name naturally in the copy where it fits (unless tight character limits force abbreviation).

`
      : `Publication last author — not on People list; follow when this block appears:
- The publication last author for factual context is: "${lead}". They are not on the provided People / watchlist names—do not use their name in the headline and do not make them the headline hook (no "Name leads…" / solo billing).
- Headline: Focus on the science, impact, or the research community in general terms (ImmunoX / UCSF / OCR context is fine). You may refer vaguely to investigators in the community (e.g. work involving our watchlist researchers, community-linked investigators, the team) without centering the non-listed last author.
- Blurb: There is no single People-list lead—treat all named investigators as peers. List everyone you name from the linked watchlist (and the publication last author "${lead}" when you credit authorship) together in one neutral run: same grammatical level, e.g. "Alexis J. Combes, Adrian Erlebacher, Tippi C. MacKenzie, and Robert Blelloch report…" or "In work by X, Y, Z, and W, …". Do not write one investigator as the main subject and the others only as "and colleagues" / "and his or her colleagues" / "along with". Never use "his team" / "her team" / "his lab" for co-authors. If only one person is named, keep a neutral clause; if no watchlist names are provided, open with the science or journal framing without a hierarchical author hook.
- Wrong conductorship: Never open with "Conducted by [Name]…" / "Led by [Name]…" using only a watchlist-linked name when that person is not "${lead}" (the publication last author). Open study-first ("In a Nature study, …") or use one balanced author list that includes "${lead}" alongside watchlist names—never incorrect sole credit to a non-last author.
- If the string is in PubMed-style "LastName initials" form, expand to the fullest name from the supplied author list, Summary, or Full text.

`
    : "";

  return `${GLOBAL_RULES}

${publicationLeadRules}When the source is a paper/publication and linked watchlist investigators are provided, mention all linked investigators by name naturally in the copy (unless character limits force abbreviation; if so, keep at least key names and avoid inventing any). 

${PLATFORM[style]}`;
}

function parsePubmedLastAuthor(rawSummary: string | null): string | null {
  if (!rawSummary) return null;
  const part = rawSummary
    .split(" · ")
    .map((x) => x.trim())
    .find((x) => x.toLowerCase().startsWith("last_author:"));
  if (!part) return null;
  const v = part.slice("last_author:".length).trim();
  return v || null;
}

function extractPubmedPmidFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
  return m?.[1] ?? null;
}

async function fetchPubmedLastAuthorByPmid(pmid: string): Promise<string | null> {
  const apiKey = process.env.NCBI_API_KEY?.trim();
  const keyParam = apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : "";
  try {
    const res = await fetch(
      `${EUTILS}/esummary.fcgi?db=pubmed&retmode=json&id=${encodeURIComponent(pmid)}${keyParam}`,
      { headers: { "User-Agent": "CommunitySignalDigest/1.0 (blurb-gen)" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: Record<string, unknown> & { uids?: string[] };
    };
    const record = json.result?.[pmid] as { authors?: { name?: string }[] } | undefined;
    const names = Array.isArray(record?.authors)
      ? record.authors
          .map((a) => (typeof a?.name === "string" ? a.name.trim() : ""))
          .filter(Boolean)
      : [];
    return names.length > 0 ? (names[names.length - 1] ?? null) : null;
  } catch {
    return null;
  }
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
  const { source_item_id, style, model: requestedModel } = parsed.data;

  /** Latest summary for this item, if any — regenerating overwrites this row and removes extras. */
  const { data: existingRows, error: existingErr } = await supabase
    .from("summaries")
    .select("id")
    .eq("source_item_id", source_item_id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (existingErr) {
    console.error("generate-blurb: existing blurb lookup", existingErr);
    return NextResponse.json(
      { error: existingErr.message ?? "Could not look up existing summary" },
      { status: 500 },
    );
  }
  const existingId = existingRows?.[0]?.id ?? null;

  const { data: item, error: itemErr } = await supabase
    .from("source_items")
    .select(
      "id, title, raw_text, raw_summary, source_url, source_type, published_at, tracked_entity_id, signal_group_key, tracked_entities!tracked_entity_id ( name )",
    )
    .eq("id", source_item_id)
    .maybeSingle();

  if (itemErr || !item) {
    return NextResponse.json({ error: "Source item not found" }, { status: 404 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const openai = new OpenAI({ apiKey });
  const te = item.tracked_entities as { name?: string } | { name?: string }[] | null;
  const entityName = Array.isArray(te)
    ? te[0]?.name
    : te && typeof te === "object"
      ? te.name
      : undefined;

  const relatedItemIds = new Set<string>([source_item_id]);
  const investigatorIds = new Set<string>();
  if (typeof item.tracked_entity_id === "string" && item.tracked_entity_id) {
    investigatorIds.add(item.tracked_entity_id);
  }

  if (item.signal_group_key) {
    const { data: siblingItems } = await supabase
      .from("source_items")
      .select("id, tracked_entity_id")
      .eq("signal_group_key", item.signal_group_key)
      .limit(200);
    for (const row of siblingItems ?? []) {
      relatedItemIds.add(row.id);
      if (row.tracked_entity_id) investigatorIds.add(row.tracked_entity_id);
    }
  }

  const { data: linkedRows } = await supabase
    .from("source_item_tracked_entities")
    .select("tracked_entity_id")
    .in("source_item_id", [...relatedItemIds]);
  for (const row of linkedRows ?? []) {
    if (row.tracked_entity_id) investigatorIds.add(row.tracked_entity_id);
  }

  const { data: linkedInvestigators } = investigatorIds.size
    ? await supabase
        .from("tracked_entities")
        .select("name")
        .in("id", [...investigatorIds])
    : { data: [] as { name: string }[] };

  const linkedInvestigatorNames = [
    ...(entityName ? [entityName] : []),
    ...((linkedInvestigators ?? [])
      .map((r) => r.name?.trim() ?? "")
      .filter(Boolean) as string[]),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const pmid =
    item.source_type === "pubmed" ? extractPubmedPmidFromUrl(item.source_url ?? null) : null;

  let publicationLastAuthor: string | null =
    parsePubmedLastAuthor(item.raw_summary ?? null) ?? null;
  if (!publicationLastAuthor && pmid) {
    publicationLastAuthor = await fetchPubmedLastAuthorByPmid(pmid);
  }
  if (pmid) {
    const full = await fetchPubmedLastAuthorFullNameByPmid(pmid);
    if (full && (!publicationLastAuthor || isPubmedStyleAbbrevAuthor(publicationLastAuthor))) {
      publicationLastAuthor = full;
    }
  }

  const leadOnPeopleList = publicationLastAuthor
    ? publicationLeadOnPeopleList(publicationLastAuthor, linkedInvestigatorNames)
    : false;

  const trackedName = entityName?.trim() ?? "";
  const trackedIsPublicationLast =
    Boolean(trackedName && publicationLastAuthor) &&
    publicationLeadOnPeopleList(publicationLastAuthor as string, [trackedName]);

  const userContent = [
    `Title: ${item.title}`,
    publicationLastAuthor
      ? `Publication last author: ${publicationLastAuthor}. On People/watchlist (name match): ${leadOnPeopleList ? "yes" : "no"}. If no: do not name them in the headline (science / community framing). In the blurb, list all named linked investigators—and the last author when crediting authorship—in one neutral comma-style group, not one name plus "and colleagues" for the rest.`
      : "",
    trackedName && publicationLastAuthor && !trackedIsPublicationLast
      ? `Important: Workspace "Tracked investigator" (${trackedName}) is not the publication last author (${publicationLastAuthor}). Do not use "${trackedName}" alone in "conducted by", "led by", or similar—those constructions would misstate authorship.`
      : "",
    entityName ? `Tracked investigator: ${entityName}` : "",
    linkedInvestigatorNames.length && publicationLastAuthor
      ? `Linked watchlist investigators (not manuscript authorship order): ${linkedInvestigatorNames.join(", ")}. Do not pick who "conducted" or "led" the study from this list order or from the first author in the abstract unless that person is the publication last author.`
      : linkedInvestigatorNames.length
        ? `Linked watchlist investigators: ${linkedInvestigatorNames.join(", ")}`
        : "",
    item.source_url ? `URL: ${item.source_url}` : "",
    item.published_at ? `Published: ${item.published_at}` : "",
    item.raw_summary ? `Summary: ${item.raw_summary}` : "",
    item.raw_text ? `Full text: ${item.raw_text.slice(0, 12000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const ALLOWED_MODELS = new Set([
    DEFAULT_MODEL,
    "gpt-4o-mini",
    "gpt-4.1-mini",
    "gpt-4o",
    "gpt-4.1",
  ]);
  const model = requestedModel && ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;

  let structured: z.infer<typeof blurbJsonSchema>;
  try {
    const completion = await openai.chat.completions.parse({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt(style, publicationLastAuthor, leadOnPeopleList),
        },
        {
          role: "user",
          content: `Generate the ${style} version only (structured fields) from this source item:\n\n${userContent}`,
        },
      ],
      response_format: zodResponseFormat(blurbJsonSchema, "digest_blurb"),
    });
    const msg = completion.choices[0]?.message;
    if (!msg?.parsed) {
      return NextResponse.json(
        { error: "Model did not return structured output" },
        { status: 502 },
      );
    }
    structured = msg.parsed;
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "OpenAI request failed" },
      { status: 502 },
    );
  }

  const generatedText = JSON.stringify(structured);

  function mapBlurbSaveError(message: string): string {
    const m = message.toLowerCase();
    if (
      m.includes("summary_style") ||
      m.includes("blurb_style") ||
      m.includes("invalid input value for enum") ||
      m.includes("invalid enum")
    ) {
      return [
        "This database is missing newer summary format values (e.g. LinkedIn, social media / bluesky_x).",
        "Apply pending Supabase migrations (including enum extensions and `20260408160000_drop_newsletters_rename_blurbs.sql`), or run `supabase db push`.",
      ].join(" ");
    }
    return message;
  }

  if (existingId) {
    const { data: updated, error: updateErr } = await supabase
      .from("summaries")
      .update({
        style,
        prompt_version: PROMPT_VERSION,
        generated_text: generatedText,
        model_name: model,
        edited_text: null,
        final_text: null,
      })
      .eq("id", existingId)
      .select("id, generated_text, style, created_at, model_name, prompt_version");

    if (updateErr) {
      console.error("generate-blurb: update", updateErr);
      return NextResponse.json(
        { error: mapBlurbSaveError(updateErr.message) },
        { status: 500 },
      );
    }
    const blurb = updated?.[0];
    if (!blurb) {
      return NextResponse.json(
        {
          error:
            "Could not update this summary (no row matched). Try refreshing the page in case it was removed.",
        },
        { status: 500 },
      );
    }

    const { data: dupes } = await supabase
      .from("summaries")
      .select("id")
      .eq("source_item_id", source_item_id);
    const toDelete = (dupes ?? []).map((r) => r.id).filter((id) => id !== existingId);
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase.from("summaries").delete().in("id", toDelete);
      if (delErr) {
        console.error("generate-blurb: prune duplicate summaries", delErr);
      }
    }

    return NextResponse.json({ blurb: structured, record: blurb });
  }

  const { data: blurb, error: insertErr } = await supabase
    .from("summaries")
    .insert({
      source_item_id,
      style,
      prompt_version: PROMPT_VERSION,
      generated_text: generatedText,
      model_name: model,
      created_by: user.id,
    })
    .select("id, generated_text, style, created_at, model_name, prompt_version")
    .single();

  if (insertErr || !blurb) {
    return NextResponse.json(
      { error: mapBlurbSaveError(insertErr?.message ?? "Failed to save blurb") },
      { status: 500 },
    );
  }

  return NextResponse.json({ blurb: structured, record: blurb });
}
