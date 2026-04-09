import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { Card, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BulkUploadEntities } from "./bulk-upload-entities";
import { WatchlistEntitiesTable } from "./watchlist-entities-table";

type SearchParams = Promise<{ q?: string; show_all?: string }>;

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const showAll = sp.show_all === "1";

  const supabase = await createClient();
  let query = supabase
    .from("tracked_entities")
    .select("*")
    .order("name", { ascending: true });

  if (q) {
    query = query.or(
      `name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,slug.ilike.%${q}%,institution.ilike.%${q}%,nih_profile_id.ilike.%${q}%`,
    );
  }
  if (!showAll) {
    query = query.eq("active", true);
  }

  const { data: entities, error } = await query;

  if (error) {
    return <p className="text-red-600">Could not load investigators.</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Watchlist</h1>
          <p className="mt-1 text-sm text-neutral-500">
            A list of investigators being monitored across the research community for new and relevant
            signals.
          </p>
        </div>
        <ButtonLink href="/entities/new">Add to watchlist</ButtonLink>
      </div>

      <Card>
        <CardTitle>Search & filter</CardTitle>
        <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
          <div className="min-w-[200px] flex-1">
            <label className="text-xs font-medium text-neutral-500">Search</label>
            <Input
              name="q"
              defaultValue={q}
              placeholder="Name, institution, slug, NIH profile ID…"
              className="mt-1"
            />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <input
              id="show_all"
              type="checkbox"
              name="show_all"
              value="1"
              defaultChecked={showAll}
              className="rounded border-neutral-300"
            />
            <label htmlFor="show_all" className="text-sm">
              Include inactive
            </label>
          </div>
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Apply
          </button>
        </form>
      </Card>

      <BulkUploadEntities />

      <WatchlistEntitiesTable
        rows={(entities ?? []).map((e) => ({
          id: e.id,
          name: e.name,
          member_status: e.member_status,
          institution: e.institution,
          nih_profile_id: e.nih_profile_id,
          lab_website: e.lab_website,
          active: e.active,
        }))}
      />
    </div>
  );
}
