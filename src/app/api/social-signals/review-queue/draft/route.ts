import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { PostStatus, PublishPlatform, WorkspaceSchedulerPost } from "@/lib/social-signals/workspace-types";

const bodySchema = z.object({
  source_item_id: z.string().uuid().optional(),
  text: z.string().min(1).max(4000),
  platforms: z.array(z.enum(["x", "bluesky"])).min(1).max(2),
  attachment: z.enum(["digest_visual", "source_link"]).optional(),
  image_url: z.string().url().nullable().optional(),
  source_url: z.string().url().nullable().optional(),
  /** When set (e.g. Scheduler “+ Add draft” on a day), post appears on the calendar for that slot. */
  scheduled_at: z.string().optional(),
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
  const communityId = profile?.community_id;
  if (profErr || !communityId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const wantsImage = body.attachment !== "source_link";
  const image_url = wantsImage ? (body.image_url ?? null) : null;
  const source_url = body.source_url ?? null;
  const scheduledAtIso = body.scheduled_at?.trim() ? body.scheduled_at.trim() : null;

  const rows = body.platforms.map((platform) => ({
    community_id: communityId,
    source_item_id: body.source_item_id ?? null,
    platform,
    status: "draft" as const,
    text: body.text,
    image_url,
    source_url,
    scheduled_at: scheduledAtIso,
  }));

  const { data: inserted, error: insErr } = await supabase
    .from("social_review_queue_posts")
    .insert(rows)
    .select("id, platform, status, text, image_url, source_url, created_at, scheduled_at, source_item_id");

  if (insErr) {
    return NextResponse.json({ error: insErr.message ?? "Could not create drafts" }, { status: 500 });
  }

  const sourceIds = [...new Set((inserted ?? []).map((r) => r.source_item_id).filter(Boolean))] as string[];
  const titleBySourceId = new Map<string, string>();
  if (sourceIds.length > 0) {
    const { data: sources } = await supabase.from("source_items").select("id, title").in("id", sourceIds);
    for (const s of sources ?? []) {
      titleBySourceId.set(s.id, s.title);
    }
  }

  const posts: WorkspaceSchedulerPost[] = (inserted ?? []).map((r) => ({
    id: r.id,
    platform: r.platform as PublishPlatform,
    status: r.status as PostStatus,
    text: r.text,
    image_url: r.image_url,
    source_url: r.source_url,
    created_at: r.created_at,
    scheduled_at: r.scheduled_at,
    sourceSignalTitle: (r.source_item_id && titleBySourceId.get(r.source_item_id)) || "New draft",
    investigatorsSummary: null,
  }));

  return NextResponse.json({ ok: true, created: posts.length, posts });
}
