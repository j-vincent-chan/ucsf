import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile, getSessionUser } from "@/lib/auth";
import { runDiscovery } from "@/lib/discovery/run-discovery";

export const maxDuration = 120;

const bodySchema = z
  .object({
    entityIds: z.array(z.string().uuid()).optional(),
    daysBack: z.number().int().min(14).max(730).optional(),
  })
  .strict();

function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data: communities, error: commErr } = await supabase
    .from("communities")
    .select("id, slug, name")
    .order("slug", { ascending: true });
  if (commErr) {
    return NextResponse.json({ error: commErr.message }, { status: 500 });
  }
  const communitiesOut: {
    id: string;
    slug: string;
    name: string;
    result: Awaited<ReturnType<typeof runDiscovery>>;
  }[] = [];
  let inserted = 0;
  let skippedDuplicates = 0;
  const errors: { source: string; entityId: string; message: string }[] = [];
  const bySource: Record<string, number> = {};
  let facultyProcessed = 0;
  let labWebsiteFacultyWithUrl = 0;
  let labWebsiteCandidates = 0;
  let note = "";

  for (const c of communities ?? []) {
    const result = await runDiscovery(supabase, { communityId: c.id });
    communitiesOut.push({ id: c.id, slug: c.slug, name: c.name, result });
    inserted += result.inserted;
    skippedDuplicates += result.skippedDuplicates;
    errors.push(...result.errors);
    for (const [k, v] of Object.entries(result.bySource)) {
      bySource[k] = (bySource[k] ?? 0) + v;
    }
    facultyProcessed += result.facultyProcessed;
    labWebsiteFacultyWithUrl += result.labWebsiteFacultyWithUrl;
    labWebsiteCandidates += result.labWebsiteCandidates;
    note = result.note;
  }

  return NextResponse.json({
    inserted,
    skippedDuplicates,
    bySource,
    errors,
    facultyProcessed,
    labWebsiteFacultyWithUrl,
    labWebsiteCandidates,
    note,
    communities: communitiesOut,
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getProfile();
  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "editor")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const result = await runDiscovery(supabase, parsed.data);
  return NextResponse.json(result);
}
