import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  source_item_id: z.string().uuid(),
  text: z.string().min(1).max(4000),
  platforms: z.array(z.enum(["x", "bluesky"])).min(1).max(2),
  attachment: z.enum(["digest_visual", "source_link"]).optional(),
  image_url: z.string().url().nullable().optional(),
  source_url: z.string().url().nullable().optional(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("community_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profErr || !profile?.community_id) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const wantsImage = body.attachment !== "source_link";
  const image_url = wantsImage ? (body.image_url ?? null) : null;
  const source_url = body.source_url ?? null;

  const rows = body.platforms.map((platform) => ({
    community_id: profile.community_id,
    source_item_id: body.source_item_id,
    platform,
    status: "needs_review" as const,
    text: body.text,
    image_url,
    source_url,
  }));

  const { error: insErr } = await supabase.from("social_review_queue_posts").insert(rows);
  if (insErr) {
    return NextResponse.json({ error: insErr.message ?? "Could not create drafts" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, created: rows.length });
}

