import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { ResearchDashboard } from "@/components/research-dashboard";
import { buildDashboardPayload, type RawEntity, type RawItem } from "@/lib/dashboard-aggregate";
import { formatPostgrestError } from "@/lib/format-postgrest-error";
import { fetchSocialSignalsDashboardSnapshot } from "@/lib/social-signals/dashboard-snapshot";
import { parseWorkspaceSocialSettings, socialFeedWorkspaceConfigFromSettings } from "@/lib/workspace-social-settings";

export const dynamic = "force-dynamic";

const JUNCTION_LINK_CHUNK = 250;

/** Stable key pagination — avoids missing rows; distinct from “recent imports only”. */
const DASH_ITEMS_PAGE = 1000;
/** Safety valve (raise if a tenant exceeds this). */
const DASH_ITEMS_HARD_CAP = 100_000;

const SOURCE_ITEM_FIELDS =
  "id, title, category, status, source_url, source_type, source_domain, raw_summary, published_at, found_at, created_at, tracked_entity_id";

async function fetchAllCommunitySourceItemsForDashboard(
  supabase: SupabaseClient<Database>,
  communityId: string,
): Promise<{ data: RawItem[]; error: { message: string } | null }> {
  const out: RawItem[] = [];
  for (let offset = 0; offset < DASH_ITEMS_HARD_CAP; offset += DASH_ITEMS_PAGE) {
    const { data, error } = await supabase
      .from("source_items")
      .select(SOURCE_ITEM_FIELDS)
      .eq("community_id", communityId)
      .order("id", { ascending: true })
      .range(offset, offset + DASH_ITEMS_PAGE - 1);
    if (error) {
      return { data: [], error: { message: formatPostgrestError(error) } };
    }
    const chunk = (data ?? []) as RawItem[];
    out.push(...chunk);
    if (chunk.length < DASH_ITEMS_PAGE) break;
  }
  return { data: out, error: null };
}

export default async function DashboardPage() {
  const { profile } = await requireProfile();
  if (profile.role === "admin" && !profile.community_id) {
    redirect("/admin/workspaces");
  }
  const communityId = profile.community_id;
  if (!communityId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-4 text-amber-800 dark:text-amber-200">
          Analytics require a community on your profile. Ask an administrator to assign you to a community, then
          refresh this page.
        </p>
      </div>
    );
  }
  const supabase = await createClient();

  const [entitiesRes, itemsPaged, recentRes, countRes, socialSnapshotResult] = await Promise.all([
    supabase
      .from("tracked_entities")
      .select("id, name, created_at, active, entity_type, member_status, institution")
      .eq("community_id", communityId),
    fetchAllCommunitySourceItemsForDashboard(supabase, communityId),
    supabase
      .from("source_items")
      .select("id, title, status, category, published_at, tracked_entity_id")
      .eq("community_id", communityId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("source_items")
      .select("id", { count: "exact", head: true })
      .eq("community_id", communityId),
    (async () => {
      try {
        const social = parseWorkspaceSocialSettings(profile.community?.social_settings ?? null);
        const workspaceCfg = socialFeedWorkspaceConfigFromSettings(social);
        const data = await fetchSocialSignalsDashboardSnapshot(workspaceCfg);
        return { ok: true as const, data };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("[dashboard] social snapshot failed:", e);
        return { ok: false as const, error: message };
      }
    })(),
  ]);

  const err = entitiesRes.error ?? itemsPaged.error ?? recentRes.error ?? countRes.error;
  if (err) {
    const failedQuery =
      entitiesRes.error != null
        ? "tracked_entities"
        : itemsPaged.error != null
          ? "source_items (paginated load)"
          : recentRes.error != null
            ? "source_items (recent)"
            : countRes.error != null
              ? "source_items (count)"
              : "unknown";
    console.error(`[dashboard] analytics query failed (${failedQuery}, raw error):`, err);
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-4 text-red-600 dark:text-red-400">
          Failed to load analytics ({failedQuery}): {formatPostgrestError(err)}
        </p>
      </div>
    );
  }

  const entities = (entitiesRes.data ?? []) as RawEntity[];
  const rawItems = itemsPaged.data;
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
        console.error("[dashboard] source_item_tracked_entities query failed (raw error):", linkErr);
        return (
          <div className="mx-auto max-w-3xl px-4 py-8">
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="mt-4 text-red-600 dark:text-red-400">
              Failed to load analytics (source_item_tracked_entities): {formatPostgrestError(linkErr)}
            </p>
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

  const expectedCount =
    typeof countRes.count === "number" && Number.isFinite(countRes.count)
      ? countRes.count
      : null;
  const payload = {
    ...buildDashboardPayload(entities, items),
    analyticsSourceItemsLoaded: items.length,
    analyticsSourceItemsExpected: expectedCount,
  };

  const recentRows = recentRes.data ?? [];
  const entityNameById = new Map(entities.map((e) => [e.id, e.name]));

  const recentItems = recentRows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    category: r.category,
    published_at: r.published_at,
    entityName:
      r.tracked_entity_id != null ? (entityNameById.get(r.tracked_entity_id) ?? "—") : "—",
  }));

  const socialSnapshot = socialSnapshotResult.ok ? socialSnapshotResult.data : null;
  const socialSnapshotError = socialSnapshotResult.ok ? null : socialSnapshotResult.error;

  return (
    <ResearchDashboard
      data={payload}
      recentItems={recentItems}
      socialSnapshot={socialSnapshot}
      socialSnapshotError={socialSnapshotError}
    />
  );
}
