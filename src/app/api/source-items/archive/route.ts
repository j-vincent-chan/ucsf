import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  isArchiveReasonConstraintError,
  isValidArchiveReason,
  legacySafeArchiveReason,
} from "@/lib/archive-reasons";
import type { ItemArchiveReason } from "@/types/database";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  source_item_id: z.string().uuid(),
  archive_reason: z.string().optional(),
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
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("community_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile?.community_id) {
    return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  }

  if (profile.role !== "admin" && profile.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { source_item_id, archive_reason: archiveReasonRaw } = parsed.data;
  const communityId = profile.community_id;

  const rawReason = archiveReasonRaw?.trim() ?? "other";
  let reason: ItemArchiveReason = isValidArchiveReason(rawReason) ? rawReason : "other";

  async function tryArchive(ar: ItemArchiveReason) {
    return supabase
      .from("source_items")
      .update({ status: "archived", archive_reason: ar })
      .eq("id", source_item_id)
      .eq("community_id", communityId)
      .select("id")
      .maybeSingle();
  }

  let { data, error } = await tryArchive(reason);
  let usedFallback = false;

  if (error && isArchiveReasonConstraintError(error)) {
    usedFallback = true;
    reason = legacySafeArchiveReason(reason);
    const retry = await tryArchive(reason);
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    const msg = error.message ?? "Archive failed";
    if (msg.includes("archive_reason")) {
      return NextResponse.json(
        {
          error:
            "Database archive_reason constraint is outdated. Apply pending Supabase migrations (archive_reason codes), then try again.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "Signal not found or not in your workspace" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, id: data.id, usedFallback });
}
