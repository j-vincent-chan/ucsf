import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getSessionUser } from "@/lib/auth";
import { runDiscovery } from "@/lib/discovery/run-discovery";

export const maxDuration = 120;

const bodySchema = z
  .object({
    entityIds: z.array(z.string().uuid()).optional(),
    daysBack: z.number().int().min(14).max(730).optional(),
  })
  .strict();

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
