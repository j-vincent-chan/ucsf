import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_DIGEST_SUMMARY_TONE,
  digestSummaryToneAdjustExtraRules,
  digestSummaryTonePromptBlock,
} from "@/lib/digest-summary-tone";

const bodySchema = z.object({
  text: z.string().min(1),
  target_words: z.number().int().min(10).max(400),
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
});

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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const { text, target_words, model: requestedModel, tone: requestedTone } = parsed.data;
  const tone = requestedTone ?? DEFAULT_DIGEST_SUMMARY_TONE;
  const toneInstruction = digestSummaryTonePromptBlock(tone);
  const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const ALLOWED_MODELS = new Set([
    DEFAULT_MODEL,
    "gpt-4o-mini",
    "gpt-4.1-mini",
    "gpt-4o",
    "gpt-4.1",
  ]);
  const model =
    requestedModel && ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;

  const openai = new OpenAI({ apiKey });
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: [
            "You are an expert science communications editor. Rewrite the user's text while preserving every factual claim, name, number, and causal relationship. If the prose lists many linked investigators unnecessarily, tightening to correspondent-or-lead + colleagues-style wording is acceptable when it keeps the same substantive attributions implied by the source. Output ONLY the rewritten text, no quotes, no markdown, no title line unless the input was only a title.",
            digestSummaryToneAdjustExtraRules(),
            "Apply BOTH: (1) the writing tone below—voice, register, what gets emphasized, and how ideas connect—so the full piece reads as if originally drafted in that voice; (2) the target word count (within ~10% if needed for clarity).",
            toneInstruction,
          ].join("\n\n"),
        },
        {
          role: "user",
          content: [
            `Target length: approximately ${target_words} words (stay close).`,
            "Perform a full rewrite in the selected tone: new phrasing and flow through the whole passage, not an opening hook only.",
            "",
            "TEXT:",
            text,
          ].join("\n"),
        },
      ],
      temperature: 0.55,
    });
    const out = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!out) {
      return NextResponse.json({ error: "Model returned empty text" }, { status: 502 });
    }
    return NextResponse.json({ text: out });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "OpenAI request failed" },
      { status: 502 },
    );
  }
}

