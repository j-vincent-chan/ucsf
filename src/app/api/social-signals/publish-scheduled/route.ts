import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runPublishScheduledQueuePosts } from "@/lib/social-signals/publish-scheduled-queue";

export const maxDuration = 300;

function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** Cron: publish scheduled Social Signals queue posts to X / Bluesky when `scheduled_at` has passed. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Admin client unavailable";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  try {
    const result = await runPublishScheduledQueuePosts(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Publish scheduled failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
