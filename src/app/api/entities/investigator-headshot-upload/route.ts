import { NextResponse } from "next/server";
import { getProfile, getSessionUser } from "@/lib/auth";
import {
  INVESTIGATOR_HEADSHOTS_BUCKET,
  investigatorHeadshotObjectPath,
} from "@/lib/investigator-headshots";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Upload one investigator headshot to Storage using the server Supabase client.
 * Avoids browser → Supabase Storage edge cases where storage.objects.owner_id is written as "".
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (profile.role === "admin" && !profile.community_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (profile.role !== "admin" && profile.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const communityId = profile.community_id?.trim() ?? "";
  if (!communityId) {
    return NextResponse.json({ error: "Profile has no community" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const entityId = String(form.get("entityId") ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entityId)) {
    return NextResponse.json({ error: "Invalid entityId" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "Missing or empty file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 5MB limit" }, { status: 400 });
  }

  const declaredType = String(form.get("contentType") ?? "").trim();
  const contentType =
    declaredType ||
    (typeof (file as File).type === "string" && (file as File).type ? (file as File).type : "") ||
    "application/octet-stream";

  const supabase = await createClient();

  const { data: ent, error: entErr } = await supabase
    .from("tracked_entities")
    .select("id")
    .eq("id", entityId)
    .eq("community_id", communityId)
    .maybeSingle();

  if (entErr) {
    return NextResponse.json({ error: entErr.message }, { status: 502 });
  }
  if (!ent?.id) {
    return NextResponse.json({ error: "Person not found in your community" }, { status: 404 });
  }

  const path = investigatorHeadshotObjectPath(communityId, entityId);
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from(INVESTIGATOR_HEADSHOTS_BUCKET)
    .upload(path, buffer, { upsert: true, contentType });

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 502 });
  }

  const { error: dbErr } = await supabase
    .from("tracked_entities")
    .update({ headshot_storage_path: path, headshot_url: null })
    .eq("id", entityId);

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, path });
}
