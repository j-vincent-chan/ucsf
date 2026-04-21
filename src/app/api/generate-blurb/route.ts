import { NextResponse } from "next/server";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { createClient } from "@/lib/supabase/server";
import { blurbJsonSchema } from "@/lib/blurb-content";
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
    "instagram",
  ]),
  model: z.string().min(1).optional(),
});

const PROMPT_VERSION = "v2";

const GLOBAL_RULES = `You write platform-specific versions of the same research update for an oncology immunotherapy community (ImmunoX / OCR context).

Output valid JSON only, matching the schema exactly: headline, blurb, why_it_matters, confidence_notes (all strings).

Cross-platform rules:
- This version is for ONE channel only. Do not reuse the same sentences or parallel "template" wording you would use on another platform; each channel must read like distinct copy, not a resized draft of the same text.
- Keep facts aligned with the source; never invent claims. If something is uncertain, note it briefly in confidence_notes.

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

  instagram: `CHANNEL: Instagram (visual-first caption).
- Aim ~40–75 words in blurb: shorter, simpler, accessible language.
- Write as if the post sits beside a visual—evocative but factual; emphasize one key takeaway and shareability.
- Optional 1–3 relevant hashtags at the end of blurb if appropriate; keep tone human.`,

  bluesky_x: `CHANNEL: Bluesky or X (shortest version).
- One idea per post. Blurb is the post: aim under 260 characters when possible (hard cap 280). Sharp, immediate, zero fluff.
- Prefer plain language. At most one hashtag if it clearly helps; often none.
- Headline: optional 3–8 word stake in the ground that does not duplicate the blurb verbatim. why_it_matters: one short clause (not a second post).`,

  donor: `CHANNEL: Donor-facing (legacy).
- Warm, precise, impact-oriented. Blurb under ~120 words. No sensationalism.`,

  social: `CHANNEL: Social (legacy).
- Single professional post. Blurb under ~220 characters when possible; punchy headline.`,

  concise: `CHANNEL: Concise (legacy).
- One tight paragraph; blurb under ~55 words.`,
} satisfies Record<SummaryStyle, string>;

function systemPrompt(style: SummaryStyle): string {
  return `${GLOBAL_RULES}\n\n${PLATFORM[style]}`;
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
      "id, title, raw_text, raw_summary, source_url, source_type, published_at, tracked_entities!tracked_entity_id ( name )",
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

  const userContent = [
    `Title: ${item.title}`,
    entityName ? `Tracked investigator: ${entityName}` : "",
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
        { role: "system", content: systemPrompt(style) },
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
        "This database is missing newer summary format values (e.g. LinkedIn, Bluesky or X, Instagram).",
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
