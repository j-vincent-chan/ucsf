import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { ItemDetail } from "./item-detail";
import type { SourceItem, Summary } from "@/types/database";
import { investigatorsFromSourceItemRow } from "@/lib/source-item-investigators";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireProfile();
  const { id } = await params;
  const supabase = await createClient();

  const { data: item, error } = await supabase
    .from("source_items")
    .select(
      `
      *,
      tracked_entities!tracked_entity_id ( id, name, first_name, last_name, lab_website )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !item) notFound();

  const { data: junctionRows, error: jErr } = await supabase
    .from("source_item_tracked_entities")
    .select(
      `
      tracked_entity_id,
      tracked_entities!tracked_entity_id ( id, name, first_name, last_name, lab_website )
    `,
    )
    .eq("source_item_id", id);

  if (jErr) notFound();

  const { data: summaries } = await supabase
    .from("summaries")
    .select("*")
    .eq("source_item_id", id)
    .order("created_at", { ascending: false });

  let duplicates: Pick<SourceItem, "id" | "title" | "status" | "duplicate_key">[] =
    [];
  if (item.duplicate_key) {
    const { data: dups } = await supabase
      .from("source_items")
      .select("id, title, status, duplicate_key")
      .eq("duplicate_key", item.duplicate_key)
      .neq("id", id);
    duplicates = dups ?? [];
  }

  let duplicateOf: Pick<SourceItem, "id" | "title"> | null = null;
  if (item.duplicate_of) {
    const { data: orig } = await supabase
      .from("source_items")
      .select("id, title")
      .eq("id", item.duplicate_of)
      .maybeSingle();
    duplicateOf = orig;
  }

  const raw = item as Record<string, unknown>;
  const { tracked_entities: te, ...rest } = raw;
  const investigators = investigatorsFromSourceItemRow(te, junctionRows ?? []);

  return (
    <ItemDetail
      key={id}
      item={rest as unknown as SourceItem}
      investigators={investigators}
      summaries={(summaries ?? []) as Summary[]}
      duplicates={duplicates}
      duplicateOf={duplicateOf}
    />
  );
}
