import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { MonthlyDigestView, type DigestItemPayload } from "@/components/monthly-digest";
import {
  formatMonthHeading,
  monthRangeUtc,
  parseYearMonth,
  currentYearMonth,
} from "@/lib/digest-month";
import type { Summary } from "@/types/database";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const ITEM_SELECT = `
  id,
  title,
  published_at,
  found_at,
  category,
  source_type,
  source_url,
  tracked_entities!tracked_entity_id ( name, first_name, last_name ),
  summaries ( * )
`;

function investigatorFromRow(te: unknown): DigestItemPayload["investigator"] {
  if (!te) return null;
  if (Array.isArray(te)) {
    const first = te[0] as { name?: string; first_name?: string; last_name?: string } | undefined;
    if (!first?.name) return null;
    return {
      name: first.name,
      first_name: first.first_name ?? "",
      last_name: first.last_name ?? "",
    };
  }
  if (typeof te === "object" && te !== null && "name" in te) {
    const row = te as { name?: string | null; first_name?: string; last_name?: string };
    if (!row.name) return null;
    return { name: row.name, first_name: row.first_name ?? "", last_name: row.last_name ?? "" };
  }
  return null;
}

function mapRow(r: {
  id: string;
  title: string;
  published_at: string | null;
  found_at: string;
  category: DigestItemPayload["category"];
  source_type: DigestItemPayload["source_type"];
  source_url: string | null;
  tracked_entities: unknown;
  summaries: unknown;
}): DigestItemPayload {
  const rawSummaries = r.summaries;
  const summaries = (Array.isArray(rawSummaries) ? rawSummaries : []) as Summary[];
  summaries.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return {
    id: r.id,
    title: r.title,
    published_at: r.published_at,
    found_at: r.found_at,
    category: r.category,
    source_type: r.source_type,
    source_url: r.source_url,
    investigator: investigatorFromRow(r.tracked_entities),
    summaries,
  };
}

export default async function DigestMonthPage({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  await requireProfile();
  const { month: monthParam } = await params;
  const parsed = parseYearMonth(monthParam);
  if (!parsed) {
    redirect(`/digest/${currentYearMonth()}`);
  }
  const { year, month } = parsed;
  const { startISO, endISO } = monthRangeUtc(year, month);

  const supabase = await createClient();

  const [pubRes, foundRes] = await Promise.all([
    supabase
      .from("source_items")
      .select(ITEM_SELECT)
      .eq("status", "approved")
      .gte("published_at", startISO)
      .lte("published_at", endISO),
    supabase
      .from("source_items")
      .select(ITEM_SELECT)
      .eq("status", "approved")
      .is("published_at", null)
      .gte("found_at", startISO)
      .lte("found_at", endISO),
  ]);

  const byPub = pubRes.data ?? [];
  const byFound = foundRes.data ?? [];
  const seen = new Set<string>();
  const merged: DigestItemPayload[] = [];

  for (const r of byPub) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    merged.push(mapRow(r as Parameters<typeof mapRow>[0]));
  }
  for (const r of byFound) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    merged.push(mapRow(r as Parameters<typeof mapRow>[0]));
  }

  merged.sort((a, b) => {
    const ta = new Date(a.published_at ?? a.found_at).getTime();
    const tb = new Date(b.published_at ?? b.found_at).getTime();
    return tb - ta;
  });

  const heading = formatMonthHeading(year, month);
  const loadErr = pubRes.error ?? foundRes.error;

  if (loadErr) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold">Monthly digest</h1>
        <p className="mt-4 text-red-600">Failed to load digest: {loadErr.message}</p>
      </div>
    );
  }

  return <MonthlyDigestView monthLabel={heading} items={merged} />;
}
