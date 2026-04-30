import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { ItemsQueue } from "./items-queue";
import type { ItemCategory, ItemStatus, SourceType } from "@/types/database";
import { redirect } from "next/navigation";
import { rangeForPublishedPreset } from "@/lib/published-date-presets";
import { investigatorsFromSourceItemRow } from "@/lib/source-item-investigators";

/** Always load fresh roster + queue (faculty changes must show up immediately). */
export const dynamic = "force-dynamic";

export type ItemRow = {
  id: string;
  title: string;
  source_url: string | null;
  status: ItemStatus;
  category: ItemCategory | null;
  source_type: SourceType;
  published_at: string | null;
  found_at: string;
  duplicate_key: string | null;
  archive_reason: string | null;
  /** Primary investigator on the row (legacy); prefer `investigators` for display */
  tracked_entities: {
    id: string;
    name: string;
    first_name: string;
    last_name: string;
    lab_website: string | null;
  } | null;
  /** All investigators linked to this signal (primary + junction) */
  investigators: {
    id: string;
    name: string;
    first_name: string;
    last_name: string;
    lab_website: string | null;
  }[];
};

const statuses: ItemStatus[] = ["new", "reviewed", "approved", "archived"];
const categories: ItemCategory[] = [
  "paper",
  "award",
  "event",
  "media",
  "funding",
  "community_update",
  "other",
];
const sourceTypes: SourceType[] = [
  "pubmed",
  "web",
  "manual",
  "lab_website",
  "reporter",
];

/** Specific status, "all" = no filter (incl. archived), undefined = active queue (exclude archived). */
function parseStatus(
  v: string | undefined,
): ItemStatus | "all" | undefined {
  if (v === "all") return "all";
  return v && statuses.includes(v as ItemStatus) ? (v as ItemStatus) : undefined;
}
function parseCategory(v: string | undefined): ItemCategory | undefined {
  return v && categories.includes(v as ItemCategory)
    ? (v as ItemCategory)
    : undefined;
}
function parseSource(v: string | undefined): SourceType | undefined {
  return v && sourceTypes.includes(v as SourceType)
    ? (v as SourceType)
    : undefined;
}

type Params = Promise<{
  status?: string;
  category?: string;
  source_type?: string;
  entity?: string;
  from?: string;
  to?: string;
}>;

export default async function ItemsPage({ searchParams }: { searchParams: Params }) {
  const { profile } = await requireProfile();
  const sp = await searchParams;

  /** Default queue: status New + published this calendar month (same range as “This month” preset). */
  const statusRaw = sp.status?.trim() ?? "";
  const fromRaw = sp.from?.trim() ?? "";
  const toRaw = sp.to?.trim() ?? "";
  const needsDefaultFilters = statusRaw === "" && fromRaw === "" && toRaw === "";
  if (needsDefaultFilters) {
    const r = rangeForPublishedPreset("current_month");
    const p = new URLSearchParams();
    p.set("status", "new");
    p.set("from", r.from);
    p.set("to", r.to);
    if (sp.category?.trim()) p.set("category", sp.category.trim());
    if (sp.source_type?.trim()) p.set("source_type", sp.source_type.trim());
    if (sp.entity?.trim()) p.set("entity", sp.entity.trim());
    redirect(`/items?${p.toString()}`);
  }

  const status = parseStatus(sp.status);
  const category = parseCategory(sp.category);
  const sourceType = parseSource(sp.source_type);
  const entityId = sp.entity?.trim() || undefined;
  const from = sp.from?.trim() || undefined;
  const to = sp.to?.trim() || undefined;

  const supabase = await createClient();

  const communityId = profile.community_id;

  const [entitiesRes, itemsRes] = await Promise.all([
    supabase
      .from("tracked_entities")
      .select("id, name")
      .eq("community_id", communityId)
      .eq("active", true)
      .order("name", { ascending: true }),
    (async () => {
      let q = supabase
        .from("source_items")
        .select(
          `
        id,
        title,
        source_url,
        status,
        category,
        source_type,
        published_at,
        found_at,
        duplicate_key,
        archive_reason,
        tracked_entities!tracked_entity_id ( id, name, first_name, last_name, lab_website )
       `,
        )
        .eq("community_id", communityId)
        .order("found_at", { ascending: false })
        .limit(400);

      if (status === "all") {
        /* no status filter */
      } else if (status) {
        q = q.eq("status", status);
      } else {
        q = q.neq("status", "archived");
      }
      if (category) q = q.eq("category", category);
      if (sourceType) q = q.eq("source_type", sourceType);
      if (entityId) {
        const { data: linkRows } = await supabase
          .from("source_item_tracked_entities")
          .select("source_item_id")
          .eq("tracked_entity_id", entityId);
        const fromJunction = (linkRows ?? []).map((r) => r.source_item_id);
        const orParts = [`tracked_entity_id.eq.${entityId}`];
        if (fromJunction.length > 0) {
          orParts.push(`id.in.(${fromJunction.join(",")})`);
        }
        q = q.or(orParts.join(","));
      }
      if (from) q = q.gte("published_at", `${from}T00:00:00.000Z`);
      if (to) q = q.lte("published_at", `${to}T23:59:59.999Z`);

      const base = await q;
      if (base.error) return base;

      const rows = base.data ?? [];
      const itemIds = rows.map((r) => r.id);
      const junctionByItem = new Map<string, unknown[]>();

      if (itemIds.length > 0) {
        const { data: junctionRows, error: jErr } = await supabase
          .from("source_item_tracked_entities")
          .select(
            `
            source_item_id,
            tracked_entity_id,
            tracked_entities!tracked_entity_id ( id, name, first_name, last_name, lab_website )
          `,
          )
          .in("source_item_id", itemIds);

        if (jErr) {
          return { data: null, error: jErr };
        }

        for (const row of junctionRows ?? []) {
          const sid = row.source_item_id;
          const arr = junctionByItem.get(sid) ?? [];
          arr.push(row);
          junctionByItem.set(sid, arr);
        }
      }

      const merged = rows.map((r) => ({
        ...r,
        source_item_tracked_entities: junctionByItem.get(r.id) ?? [],
      }));

      return { data: merged, error: null };
    })(),
  ]);

  const entities = entitiesRes.data ?? [];
  const entityIds = new Set(entities.map((e) => e.id));

  if (entityId && !entityIds.has(entityId)) {
    const p = new URLSearchParams();
    if (sp.status) p.set("status", sp.status);
    if (sp.category) p.set("category", sp.category);
    if (sp.source_type) p.set("source_type", sp.source_type);
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    redirect(p.size ? `/items?${p}` : "/items");
  }

  const rawItems = itemsRes.data;
  const itemsErr = itemsRes.error;

  const items: ItemRow[] = (rawItems ?? []).map((r) => {
    const te = r.tracked_entities;
    const ent =
      te && typeof te === "object"
        ? Array.isArray(te)
          ? te[0]
          : (te as {
              id: string;
              name: string;
              first_name: string;
              last_name: string;
              lab_website: string | null;
            })
        : null;
    const junction = (r as { source_item_tracked_entities?: unknown })
      .source_item_tracked_entities;
    const investigators = investigatorsFromSourceItemRow(te, junction);
    return {
      id: r.id,
      title: r.title,
      source_url: r.source_url ?? null,
      status: r.status,
      category: r.category,
      source_type: r.source_type,
      published_at: r.published_at,
      found_at: r.found_at,
      duplicate_key: r.duplicate_key,
      archive_reason: r.archive_reason ?? null,
      tracked_entities: ent
        ? {
            id: ent.id,
            name: ent.name,
            first_name: ent.first_name ?? "",
            last_name: ent.last_name ?? "",
            lab_website: ent.lab_website ?? null,
          }
        : null,
      investigators,
    };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Signals</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--muted-foreground)]">
          The approval center for newly surfaced signals, where items are reviewed for relevance,
          identity accuracy, and inclusion before entering the broader record.
        </p>
      </div>
      {itemsErr ? (
        <p className="text-red-600">Failed to load items: {itemsErr.message}</p>
      ) : (
        <ItemsQueue
          key={[
            sp.status ?? "",
            sp.category ?? "",
            sp.source_type ?? "",
            sp.entity ?? "",
            sp.from ?? "",
            sp.to ?? "",
          ].join("|")}
          initialItems={items}
          entities={entities}
          canRunDiscovery={
            profile.role === "admin" || profile.role === "editor"
          }
          canMergeDuplicates={profile.role === "admin"}
          initialFilters={{
            status: sp.status ?? "",
            category: sp.category ?? "",
            source_type: sp.source_type ?? "",
            entity: sp.entity ?? "",
            from: sp.from ?? "",
            to: sp.to ?? "",
          }}
        />
      )}
    </div>
  );
}
