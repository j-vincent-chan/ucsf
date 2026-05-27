import { NextResponse } from "next/server";
import { getProfile, getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { runPublishScheduledQueuePosts } from "@/lib/social-signals/publish-scheduled-queue";

export const maxDuration = 120;

/** Publish due scheduled posts for the signed-in user's workspace (Scheduler auto-flush + Post now). */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getProfile();
  if (!profile?.community_id) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  if (profile.role !== "admin" && profile.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Admin client unavailable";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  try {
    const result = await runPublishScheduledQueuePosts(admin, {
      communityId: profile.community_id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Publish failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
