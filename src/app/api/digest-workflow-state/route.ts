import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  source_item_id: z.string().uuid(),
  complete: z.boolean(),
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

  const { source_item_id: sourceItemId, complete } = parsed.data;

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("community_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile?.community_id) {
    return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  }

  const { data: row, error: rowErr } = await supabase
    .from("source_items")
    .select("id, community_id")
    .eq("id", sourceItemId)
    .maybeSingle();

  if (rowErr || !row) {
    return NextResponse.json({ error: "Source item not found" }, { status: 404 });
  }
  if (row.community_id !== profile.community_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: updateErr } = await supabase
    .from("source_items")
    .update({
      digest_marked_complete_at: complete ? new Date().toISOString() : null,
    })
    .eq("id", sourceItemId);

  if (updateErr) {
    if (updateErr.message.includes("digest_marked_complete_at")) {
      return NextResponse.json(
        {
          error:
            "Database is missing digest_marked_complete_at. Apply the migration supabase/migrations/20260506140000_source_items_digest_marked_complete.sql in the Supabase SQL Editor (or run supabase db push).",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
