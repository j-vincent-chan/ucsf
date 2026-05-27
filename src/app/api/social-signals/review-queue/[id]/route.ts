import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const patchSchema = z.object({
  text: z.string().min(1).max(8000).optional(),
  status: z.enum(["draft", "scheduled", "published", "needs_review", "approved"]).optional(),
  scheduled_at: z.union([z.string(), z.null()]).optional(),
  image_url: z.string().url().nullable().optional(),
  source_url: z.string().url().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.text !== undefined) patch.text = body.text;
  if (body.status !== undefined) patch.status = body.status;
  if (body.scheduled_at !== undefined) patch.scheduled_at = body.scheduled_at;
  if (body.status === "scheduled") patch.publish_error = null;
  if (body.image_url !== undefined) patch.image_url = body.image_url;
  if (body.source_url !== undefined) patch.source_url = body.source_url;

  const { data: updated, error } = await supabase
    .from("social_review_queue_posts")
    .update(patch as never)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message ?? "Update failed" }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, id: updated.id });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { data: deleted, error } = await supabase
    .from("social_review_queue_posts")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message ?? "Delete failed" }, { status: 500 });
  }
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, id: deleted.id });
}
