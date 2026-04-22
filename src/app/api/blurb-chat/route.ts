import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { createClient } from "@/lib/supabase/server";
import { blurbJsonSchema } from "@/lib/blurb-content";

const bodySchema = z.object({
  instruction: z.string().min(1),
  content: blurbJsonSchema,
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

  const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const ALLOWED_MODELS = new Set([
    DEFAULT_MODEL,
    "gpt-4o-mini",
    "gpt-4.1-mini",
    "gpt-4o",
    "gpt-4.1",
  ]);
  const model =
    parsed.data.model && ALLOWED_MODELS.has(parsed.data.model)
      ? parsed.data.model
      : DEFAULT_MODEL;

  const openai = new OpenAI({ apiKey });
  try {
    const completion = await openai.chat.completions.parse({
      model,
      messages: [
        {
          role: "system",
          content:
            "You edit structured summary fields. Preserve factual claims; do not invent facts. Keep JSON valid and match schema exactly. Do not use possessive framing like his team/her team for co-authors; prefer colleagues, co-authors, or neutral parallel naming.",
        },
        {
          role: "user",
          content: [
            `INSTRUCTION:\n${parsed.data.instruction}`,
            "",
            "CURRENT CONTENT (JSON):",
            JSON.stringify(parsed.data.content),
          ].join("\n"),
        },
      ],
      response_format: zodResponseFormat(blurbJsonSchema, "blurb_chat"),
      temperature: 0.4,
    });
    const msg = completion.choices[0]?.message;
    if (!msg?.parsed) {
      return NextResponse.json(
        { error: "Model did not return structured output" },
        { status: 502 },
      );
    }
    return NextResponse.json({ content: msg.parsed });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "OpenAI request failed" },
      { status: 502 },
    );
  }
}

