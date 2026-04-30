import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { ResearchDashboard } from "@/components/research-dashboard";
import { buildDashboardPayload, type RawEntity, type RawItem } from "@/lib/dashboard-aggregate";

export const dynamic = "force-dynamic";

const JUNCTION_LINK_CHUNK = 250;

export default async function DashboardPage() {
  const { profile } = await requireProfile();
  const communityId = profile.community_id;
  const supabase = await createClient();

  const [entitiesRes, itemsRes, recentRes] = await Promise.all([
    supabase
      .from("tracked_entities")
      .select("id, name, created_at, active, entity_type, member_status, institution")
      .eq("community_id", communityId),
    supabase
      .from("source_items")
      .select(
        "id, title, category, status, source_url, source_type, source_domain, raw_summary, published_at, found_at, created_at, tracked_entity_id",
      )
      .eq("community_id", communityId)
      .order("created_at", { ascending: false })
      .limit(15000),
    supabase
      .from("source_items")
      .select(
        `
        id,
        title,
        status,
        category,
        published_at,
        tracked_entities!tracked_entity_id ( name )
      `,
      )
      .eq("community_id", communityId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const err = entitiesRes.error ?? itemsRes.error;
  if (err) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-4 text-red-600">Failed to load analytics: {err.message}</p>
      </div>
    );
  }

  const entities = (entitiesRes.data ?? []) as RawEntity[];
  const rawItems = (itemsRes.data ?? []) as RawItem[];
  const itemIds = rawItems.map((r) => r.id);
  const linksByItem = new Map<string, string[]>();
  if (itemIds.length > 0) {
    for (let i = 0; i < itemIds.length; i += JUNCTION_LINK_CHUNK) {
      const chunk = itemIds.slice(i, i + JUNCTION_LINK_CHUNK);
      const { data: linkRows, error: linkErr } = await supabase
        .from("source_item_tracked_entities")
        .select("source_item_id, tracked_entity_id")
        .in("source_item_id", chunk);
      if (linkErr) {
        return (
          <div className="mx-auto max-w-3xl">
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="mt-4 text-red-600">Failed to load analytics: {linkErr.message}</p>
          </div>
        );
      }
      for (const row of linkRows ?? []) {
        const arr = linksByItem.get(row.source_item_id) ?? [];
        arr.push(row.tracked_entity_id);
        linksByItem.set(row.source_item_id, arr);
      }
    }
  }
  const items: RawItem[] = rawItems.map((r) => {
    const extra = linksByItem.get(r.id) ?? [];
    const set = new Set<string>();
    if (r.tracked_entity_id) set.add(r.tracked_entity_id);
    for (const e of extra) set.add(e);
    const tracked_entity_ids = [...set];
    return {
      ...r,
      tracked_entity_ids: tracked_entity_ids.length > 0 ? tracked_entity_ids : undefined,
    };
  });

  const payload = buildDashboardPayload(entities, items);

  const recentRows = recentRes.data ?? [];
  type RecentRow = (typeof recentRows)[number];
  const entityName = (r: RecentRow) => {
    const te = r.tracked_entities;
    const row =
      te && typeof te === "object"
        ? Array.isArray(te)
          ? te[0]
          : (te as { name?: string })
        : null;
    return row?.name ?? "—";
  };

  const recentItems = recentRows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    category: r.category,
    published_at: r.published_at,
    entityName: entityName(r),
  }));

  return <ResearchDashboard data={payload} recentItems={recentItems} />;
}
