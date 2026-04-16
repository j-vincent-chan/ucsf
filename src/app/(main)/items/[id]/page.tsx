import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { ItemDetail } from "./item-detail";
import type { SourceItem, Summary } from "@/types/database";

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
      tracked_entities ( id, name )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !item) notFound();

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
  const entity =
    te && typeof te === "object" && !Array.isArray(te)
      ? (te as { name?: string })
      : Array.isArray(te)
        ? (te[0] as { name?: string } | undefined)
        : null;

  return (
    <ItemDetail
      key={id}
      item={rest as unknown as SourceItem}
      entityName={entity?.name ?? null}
      summaries={(summaries ?? []) as Summary[]}
      duplicates={duplicates}
      duplicateOf={duplicateOf}
    />
  );
}
