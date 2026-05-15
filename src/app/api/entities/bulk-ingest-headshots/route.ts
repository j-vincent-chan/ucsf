import { NextResponse } from "next/server";
import { getProfile, getSessionUser } from "@/lib/auth";
import { downloadHeadshotImageFromUrl } from "@/lib/investigator-headshots-ingest";
import {
  INVESTIGATOR_HEADSHOTS_BUCKET,
  investigatorHeadshotObjectPath,
} from "@/lib/investigator-headshots";
import { createClient } from "@/lib/supabase/server";

const MAX_SLUGS = 40;

type IngestResult = { slug: string; ok: boolean; skipped?: boolean; error?: string };

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!profile.community_id) {
    return NextResponse.json(
      { error: "No workspace on your profile. Assign yourself to a tenant from Admin → Workspaces." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = (body as { slugs?: unknown }).slugs;
  const slugs = Array.isArray(raw)
    ? [...new Set(raw.filter((s): s is string => typeof s === "string").map((s) => s.trim()).filter(Boolean))]
    : [];

  if (slugs.length === 0) {
    return NextResponse.json({ ok: true, results: [] as IngestResult[] });
  }
  if (slugs.length > MAX_SLUGS) {
    return NextResponse.json({ error: `At most ${MAX_SLUGS} slugs per request` }, { status: 400 });
  }

  const supabase = await createClient();
  const communityId = profile.community_id;

  const { data: entities, error } = await supabase
    .from("tracked_entities")
    .select("id, slug, headshot_url")
    .eq("community_id", communityId)
    .in("slug", slugs);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  const bySlug = new Map((entities ?? []).map((e) => [e.slug, e]));
  const results: IngestResult[] = [];

  for (const slug of slugs) {
    const ent = bySlug.get(slug);
    if (!ent) {
      results.push({ slug, ok: false, error: "No matching person in your community" });
      continue;
    }

    const url = ent.headshot_url?.trim() ?? "";
    if (!url || !/^https?:\/\//i.test(url)) {
      results.push({ slug, ok: true, skipped: true });
      continue;
    }

    try {
      const { buffer, contentType } = await downloadHeadshotImageFromUrl(url);
      const path = investigatorHeadshotObjectPath(communityId, ent.id);
      const { error: upErr } = await supabase.storage.from(INVESTIGATOR_HEADSHOTS_BUCKET).upload(path, buffer, {
        upsert: true,
        contentType,
      });
      if (upErr) {
        throw new Error(upErr.message);
      }
      const { error: dbErr } = await supabase
        .from("tracked_entities")
        .update({ headshot_storage_path: path, headshot_url: null })
        .eq("id", ent.id);
      if (dbErr) {
        throw new Error(dbErr.message);
      }
      results.push({ slug, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Download or upload failed";
      results.push({ slug, ok: false, error: msg });
    }
  }

  return NextResponse.json({ ok: true, results });
}
