import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  text: z.string().min(1),
  target_words: z.number().int().min(10).max(400),
  model: z.string().min(1).optional(),
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

  const { text, target_words, model: requestedModel } = parsed.data;
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
          content:
            "You rewrite text to a target word count while preserving meaning and factual claims. Output ONLY the rewritten text, no quotes, no markdown.",
        },
        {
          role: "user",
          content: `Rewrite to approximately ${target_words} words.\n\nTEXT:\n${text}`,
        },
      ],
      temperature: 0.4,
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

