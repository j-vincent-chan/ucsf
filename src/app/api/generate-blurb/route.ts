import { NextResponse } from "next/server";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { createClient } from "@/lib/supabase/server";
import { blurbJsonSchema } from "@/lib/blurb-content";
import {
  fetchPubmedLastAuthorFullNameByPmid,
  isPubmedStyleAbbrevAuthor,
} from "@/lib/discovery/pubmed-last-author-full";
import {
  nihFundingSupportYearLabel,
  parseNihSupportYearFromProjectNum,
  resolveNihProjectNumForItem,
} from "@/lib/nih-project-num";
import { digestDisplayInvestigators } from "@/lib/social-signals/resolve-investigators-for-post";
import type { SummaryStyle } from "@/types/database";
import { blurbCharRangeForStyle } from "@/lib/blurb-length-range";
import {
  DEFAULT_DIGEST_SUMMARY_TONE,
  digestSummaryTonePromptBlock,
  type DigestSummaryTone,
} from "@/lib/digest-summary-tone";
import { z } from "zod";

const GENERATE_BLURB_STYLES = [
  "newsletter",
  "donor",
  "social",
  "concise",
  "linkedin",
  "bluesky_x",
  "x",
  "bluesky",
  "web_blurb",
  "internal_digest",
] as const;

const bodySchema = z.object({
  source_item_id: z.string().uuid(),
  style: z.enum(GENERATE_BLURB_STYLES),
  model: z.string().min(1).optional(),
  tone: z
    .enum([
      "professional",
      "warm",
      "strategic",
      "witty",
      "thought_leadership",
      "technical",
    ])
    .optional(),
  /** Discrete length — used only when target_blurb_chars is omitted. */
  length_tier: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  /** Target character count for the blurb body (headline separate) — preferred over length_tier when set. */
  target_blurb_chars: z.number().int().min(100).max(2000).optional(),
  refinement_instruction: z.string().max(4000).optional(),
});

const LENGTH_TIER_GUIDANCE: Record<0 | 1 | 2, string> = {
  0: "Editorial length target: Short — tighter than the channel default (shorter blurbs, sharper cuts). Still respect the channel rules/hard caps.",
  1: "Editorial length target: Medium — follow the channel length guidance.",
  2: "Editorial length target: Long — richer than the channel default within channel norms (more context; stay concise).",
};

const PROMPT_VERSION = "v3.8";
const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

const GLOBAL_RULES = `You write platform-specific versions of the same research update for oncology and immunotherapy research audiences—internal summaries, newsletters, or professional channels where accuracy and clarity matter.

Output valid JSON only, matching the schema exactly: headline, blurb, why_it_matters, confidence_notes (all strings).

Cross-platform rules:
- This version is for ONE channel only. Do not reuse the same sentences or parallel "template" wording you would use on another platform; each channel must read like distinct copy, not a resized draft of the same text.
- Keep facts aligned with the source; never invent claims. If something is uncertain, note it briefly in confidence_notes.
- Co-authorship: do not imply other named investigators belong to one person. Avoid possessive "his team", "her team", "his lab", "her lab", or similar for mixed authorship. Prefer neutral wording ("colleagues", "co-authors", "the authors") or name people in parallel without subordinating them to someone else's "team".
- Attribution in headlines/blurbs (every channel/tone): **Do not roster every investigator linked on the workspace watchlist.** When crediting authors in prose: (1) If Summary/Full text clearly identifies **corresponding author(s)**, cite **those names only**, then bridge with **and colleagues**, **and coworkers**, **and co-authors**, **with their team**, **with collaborators**, or similar—pick what fits rhythm. (2) If correspondence is unstated but a **Publication last author** line appears in metadata, cite that person alone as senior/corresponding-style lead plus the same colleague phrasing—not a stacked list from the watchlist. (3) If neither is workable, orient on the findings without a dense author tally.
- When the metadata gives a publication last author, do not assign sole **"conducted by"**, **"led by"**, **"headed by"**, or **"spearheaded by"** to a different person (abstract first authorship order, arbitrary watchlist order, or unrelated "Tracked investigator") unless the source clearly identifies that other person as the same individual named in the correspondent/last-author rule above.

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
- Do not repeat the source title verbatim. Name people sparingly—the correspondent anchor rule in global instructions applies here—and connect the work to the broader oncology and immunotherapy landscape where the source supports it.`,

  linkedin: `CHANNEL: LinkedIn (medium length).
- Aim ~70–115 words in blurb. Professional, credible, skimmable.
- Lead with a clear insight or takeaway (in headline or opening of blurb).
- Short paragraphs or line breaks mentally OK in the single blurb string. At most 1–2 hashtags only if they feel natural; no hashtag stuffing.`,

  bluesky_x: `CHANNEL: Social media — short posts (e.g. Bluesky, X).
- One idea per post. Blurb is the post: aim under 260 characters when possible (hard cap 280). Sharp, immediate, zero fluff.
- Prefer plain language. At most one hashtag if it clearly helps; often none.
- Headline: optional 3–8 word stake in the ground that does not duplicate the blurb verbatim. why_it_matters: one short clause (not a second post).`,

  x: `CHANNEL: X (Twitter).
- One idea per post. Blurb is the post: aim under 260 characters when possible (hard cap 280). Sharp, immediate, zero fluff.
- Prefer plain language. At most one hashtag if it clearly helps; often none.
- Headline: optional 3–8 word stake that does not duplicate the blurb verbatim. why_it_matters: one short clause (not a second post).`,

  bluesky: `CHANNEL: Bluesky.
- One idea per post. Blurb is the post: aim under 280 characters when possible; stay within Bluesky norms. Sharp and readable.
- Prefer plain language. Hashtags sparingly. Headline optional and non-redundant with blurb.`,

  web_blurb: `CHANNEL: Website / listing blurb (short public teaser).
- Aim ~45–90 words in blurb. Plain language; skimmable; credible. No hashtag stuffing.
- Headline: crisp hook suitable for a card or listing.`,

  internal_digest: `CHANNEL: Internal team digest / briefing.
- Aim ~90–140 words in blurb. Practical: what changed, why it matters for the team, no outward-marketing hype.
- Headline: direct and specific.`,

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
  tone: DigestSummaryTone,
): string {
  const lead = publicationLead?.trim() || null;
  const publicationLeadRules = lead
    ? leadOnPeopleList
      ? `Publication correspondent / senior lead (matched to workspace People list via last-author metadata); follow when this block appears:
- Treat **"${lead}"** as the named correspondent/senior attribution anchor when correspondence labels are absent—if Summary/Full text names **explicit corresponding author(s)** instead (or additionally), prioritize those for naming; tie them to colleagues phrasing (**and colleagues**, **and coworkers**, **and co-authors**, etc.).
- Open headline and/or blurb with that anchor when you credit the lab (e.g. "${lead}" and colleagues / **In work led by** … **and collaborators**). Sole **conducted by** / **led by** constructions must honor the correspondent/metadata rule—not a random watchlist name. Avoid possessive lab framing for collaborators.
- Expand PubMed-style "LastName initials" to fullest name from supplied author lists, Summary, or Full text. Write anchors with **full given name(s) and surname** (e.g. "Jingjing Li"); never bare "Li J"-style initials alone.
- **Do not enumerate** other workspace-linked investigators in the prose unless the excerpts themselves materially name additional people or ultra-tight caps leave no room—even then skip watchlist rostering.

`
      : `Publication last author — not flagged on People/watchlist; follow when this block appears:
- Last-author metadata for grounding: "${lead}". **Do not** make them headline bait (no lone "Name leads…" hype). Prefer science- or outlet-first framing in the headline unless editorial discipline allows a subdued correspondent cue.
- **Do not roster** workspace-linked investigator names together in the blurb. If excerpts state **who is corresponding**, name only those correspondent(s), then colleague phrasing (**and colleagues**, etc.). Else if attribution needs a hook, cite **"${lead}"** once as senior/contact-style anchor plus colleagues phrasing—not every linked watchlist name in a comma barrage.
- Wrong conductorship: Never attribute sole conductorship to a tracked/watched name solely because they're linked when that clashes with excerpts or anchor rules. Prefer study-first framing when unsure.
- Expand PubMed-style names from supplied author lists, Summary, or Full text.

`
    : "";

  const toneBlock = digestSummaryTonePromptBlock(tone);

  return `${GLOBAL_RULES}

${publicationLeadRules}Linked watchlist investigators indicate **community linkage only**—not an authorship checklist. Mention them sparingly unless the excerpts name them organically or the refinement instruction requests specific names.

${toneBlock}

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
  const {
    source_item_id,
    style,
    model: requestedModel,
    tone: requestedTone,
    length_tier: lengthTierRaw,
    target_blurb_chars: targetBlurbCharsRaw,
    refinement_instruction: refinementRaw,
  } = parsed.data;
  const tone = requestedTone ?? DEFAULT_DIGEST_SUMMARY_TONE;
  const lengthTier = lengthTierRaw ?? 1;
  const targetBlurbChars =
    typeof targetBlurbCharsRaw === "number" && Number.isFinite(targetBlurbCharsRaw)
      ? Math.round(targetBlurbCharsRaw)
      : null;
  const refinementInstruction = refinementRaw?.trim() ?? "";

  /** One row per channel — upsert by (source_item_id, style) without deleting sibling outputs. */
  const { data: styleRow, error: existingErr } = await supabase
    .from("summaries")
    .select("id")
    .eq("source_item_id", source_item_id)
    .eq("style", style)
    .maybeSingle();
  if (existingErr) {
    console.error("generate-blurb: existing blurb lookup", existingErr);
    return NextResponse.json(
      { error: existingErr.message ?? "Could not look up existing summary" },
      { status: 500 },
    );
  }
  const existingId = styleRow?.id ?? null;

  const { data: item, error: itemErr } = await supabase
    .from("source_items")
    .select(
      "id, community_id, title, raw_text, raw_summary, source_url, source_type, category, nih_project_num, published_at, tracked_entity_id, signal_group_key, tracked_entities!tracked_entity_id ( name )",
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
    let siblingQuery = supabase
      .from("source_items")
      .select("id, tracked_entity_id")
      .eq("signal_group_key", item.signal_group_key)
      .limit(200);
    if (item.community_id) {
      siblingQuery = siblingQuery.eq("community_id", item.community_id);
    }
    const { data: siblingItems } = await siblingQuery;
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
        .select("id, name, first_name, last_name")
        .in("id", [...investigatorIds])
    : { data: [] as { id: string; name: string; first_name: string; last_name: string }[] };

  const displayLinked =
    item.category === "award"
      ? digestDisplayInvestigators({
          category: item.category,
          title: item.title,
          raw_summary: item.raw_summary,
          investigators: linkedInvestigators ?? [],
          primary_tracked_entity_id: item.tracked_entity_id,
        })
      : linkedInvestigators ?? [];

  const linkedInvestigatorNames = displayLinked
    .map((r) => r.name?.trim() ?? "")
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);

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

  const nihProj =
    item.category === "funding"
      ? resolveNihProjectNumForItem({
          nih_project_num: item.nih_project_num,
          title: item.title,
        })
      : null;
  const nihSupportYear = nihProj ? parseNihSupportYearFromProjectNum(nihProj) : null;
  const nihFundingLine =
    nihProj && item.category === "funding"
      ? [
          `NIH project number: ${nihProj}`,
          nihFundingSupportYearLabel(nihProj) ?? "",
          nihSupportYear != null && nihSupportYear >= 2
            ? "This is continuing/renewed funding for an ongoing award (support year 2+). Do not describe it as a newly awarded grant or first-year award."
            : nihSupportYear === 1
              ? "This is the first support year of the award (new grant)."
              : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : "";

  const userContent = [
    `Title: ${item.title}`,
    nihFundingLine,
    publicationLastAuthor
      ? `Publication last author (biblio-position anchor; treat as correspondent/senior lead when excerpts do not explicitly name differing corresponding author(s)): ${publicationLastAuthor}. On People/watchlist (name match): ${leadOnPeopleList ? "yes" : "no"}. Crediting prose: correspondent(s) from excerpts **if labeled**; otherwise this anchor alone + **and colleagues** (or analogous)—**not** a roll call of linked investigators when only metadata links exist.`
      : "",
    trackedName && publicationLastAuthor && !trackedIsPublicationLast
      ? `Important: Workspace "Tracked investigator" (${trackedName}) is not the publication last author (${publicationLastAuthor}). Do not use "${trackedName}" alone in "conducted by", "led by", or similar—those constructions would misstate authorship.`
      : "",
    entityName ? `Tracked investigator: ${entityName}` : "",
    linkedInvestigatorNames.length && publicationLastAuthor
      ? `Workspace-linked investigator names (${linkedInvestigatorNames.join("; ")}) signal community relevance only—not a roster requirement. Do **not** string them together as co-equal attributions solely because they appear here.`
      : linkedInvestigatorNames.length
        ? `Workspace-linked investigators (community context—not automatic prose roster): ${linkedInvestigatorNames.join("; ")}.`
        : "",
    item.source_url ? `URL: ${item.source_url}` : "",
    item.published_at ? `Published: ${item.published_at}` : "",
    item.raw_summary ? `Summary: ${item.raw_summary}` : "",
    item.raw_text ? `Full text: ${item.raw_text.slice(0, 12000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const lengthGuidance =
    targetBlurbChars != null
      ? `Editorial length target: aim for approximately ${targetBlurbChars} characters in the blurb (headline is separate; count plain text characters). If this conflicts with the channel caps or norms in the system prompt (e.g. very short social posts), follow those channel rules first.`
      : LENGTH_TIER_GUIDANCE[lengthTier];

  const editorialBlock = [
    lengthGuidance,
    refinementInstruction
      ? `Additional editor direction (honor when compatible with facts):\n${refinementInstruction}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

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
          content: systemPrompt(style, publicationLastAuthor, leadOnPeopleList, tone),
        },
        {
          role: "user",
          content: `Generate the ${style} version only (structured fields) from this source item. Apply the selected writing tone throughout headline, blurb, and why_it_matters.\n\n${userContent}\n\n---\n${editorialBlock}`,
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
  const storedTargetBlurbChars =
    targetBlurbChars != null
      ? Math.round(targetBlurbChars)
      : blurbCharRangeForStyle(style).default;
  const characterCount = [...`${structured.headline}\n\n${structured.blurb}`.trim()].length;
  const generatedAtIso = new Date().toISOString();

  const persistPayload = {
    style,
    prompt_version: PROMPT_VERSION,
    generated_text: generatedText,
    model_name: model,
    edited_text: null,
    final_text: null,
    digest_tone: tone,
    target_blurb_chars: storedTargetBlurbChars,
    output_status: "draft" as const,
    character_count: characterCount,
    generated_at: generatedAtIso,
  };

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
      .update(persistPayload)
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

    return NextResponse.json({ blurb: structured, record: blurb });
  }

  const { data: blurb, error: insertErr } = await supabase
    .from("summaries")
    .insert({
      source_item_id,
      created_by: user.id,
      ...persistPayload,
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
