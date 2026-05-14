import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const MAX_BATCH = 500;

/** Normalize optional wrapping quotes / spaces / 32-char hex without hyphens. */
function normalizeUuidInput(raw: string): string {
  let s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  const compact = s.replace(/-/g, "");
  if (/^[0-9a-f]{32}$/i.test(compact)) {
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`.toLowerCase();
  }
  return s;
}

/** Postgres `uuid` text form — avoid Zod’s strict RFC checks (reject valid DB ids with uncommon version/variant). */
const uuidText = z
  .string()
  .transform(normalizeUuidInput)
  .pipe(
    z.string().regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      "Invalid id format",
    ),
  );

/** Some proxies / serializers coerce booleans; accept common variants before z.boolean(). */
function normalizeComplete(val: unknown): unknown {
  if (val === true || val === "true" || val === 1 || val === "1") return true;
  if (val === false || val === "false" || val === 0 || val === "0") return false;
  return val;
}

function formatZodIssues(err: z.ZodError): string {
  return err.issues
    .map((i) => {
      const path = i.path.length ? `${i.path.join(".")}: ` : "";
      return `${path}${i.message}`;
    })
    .join(" · ");
}

const bodySchema = z
  .object({
    source_item_id: uuidText.optional(),
    source_item_ids: z.array(uuidText).min(1).max(MAX_BATCH).optional(),
    complete: z.preprocess(normalizeComplete, z.boolean()),
  })
  .superRefine((val, ctx) => {
    const hasSingle = val.source_item_id != null;
    const hasBatch = val.source_item_ids != null && val.source_item_ids.length > 0;
    if (hasSingle === hasBatch) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of source_item_id or source_item_ids",
        path: [],
      });
    }
  });

export const dynamic = "force-dynamic";

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
      {
        error: formatZodIssues(parsed.error),
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("community_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile?.community_id) {
    return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  }

  const communityId = profile.community_id;

  if (parsed.data.source_item_id != null) {
    const sourceItemId = parsed.data.source_item_id;
    const complete = parsed.data.complete;

    const { data: row, error: rowErr } = await supabase
      .from("source_items")
      .select("id, community_id")
      .eq("id", sourceItemId)
      .maybeSingle();

    if (rowErr || !row) {
      return NextResponse.json({ error: "Source item not found" }, { status: 404 });
    }
    if (row.community_id !== communityId) {
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

    return NextResponse.json({ ok: true as const, updated: 1 });
  }

  const batchIds = parsed.data.source_item_ids;
  if (!batchIds?.length) {
    return NextResponse.json({ error: "source_item_ids required" }, { status: 400 });
  }
  const uniqueIds = [...new Set(batchIds)];
  const complete = parsed.data.complete;

  const { data: rows, error: rowsErr } = await supabase
    .from("source_items")
    .select("id, community_id")
    .in("id", uniqueIds);

  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  }

  const found = new Set((rows ?? []).map((r) => r.id));
  if (found.size !== uniqueIds.length) {
    return NextResponse.json(
      { error: "One or more source items were not found" },
      { status: 404 },
    );
  }

  for (const r of rows ?? []) {
    if (r.community_id !== communityId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { error: updateErr } = await supabase
    .from("source_items")
    .update({
      digest_marked_complete_at: complete ? new Date().toISOString() : null,
    })
    .in("id", uniqueIds);

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

  return NextResponse.json({ ok: true as const, updated: uniqueIds.length });
}
