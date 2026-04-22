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
  const { profile } = await requireAdmin();
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
      `name.ilike.%${q}%,first_name.ilike.%${q}%,middle_initial.ilike.%${q}%,last_name.ilike.%${q}%,slug.ilike.%${q}%,institution.ilike.%${q}%,nih_profile_id.ilike.%${q}%`,
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
          <h1 className="text-3xl font-semibold tracking-tight">People</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted-foreground)]">
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
            <label className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--muted-foreground)]">
              Search
            </label>
            <Input
              name="q"
              defaultValue={q}
              placeholder="Name, institution, slug, NIH profile ID…"
              className="mt-1"
            />
          </div>
          <div className="flex items-center gap-2 pb-2 text-[color:var(--muted-foreground)]">
            <input
              id="show_all"
              type="checkbox"
              name="show_all"
              value="1"
              defaultChecked={showAll}
              className="rounded border-[color:var(--border)]"
            />
            <label htmlFor="show_all" className="text-sm">
              Include inactive
            </label>
          </div>
          <button type="submit" className="rounded-xl bg-[color:var(--accent)] px-4 py-2.5 text-sm font-medium text-[color:var(--accent-foreground)] shadow-[0_14px_30px_-18px_rgba(141,86,64,0.65)] transition-all hover:-translate-y-px">
            Apply
          </button>
        </form>
      </Card>

      <BulkUploadEntities communityId={profile.community_id} />

      <WatchlistEntitiesTable
        rows={(entities ?? []).map((e) => ({
          id: e.id,
          name: e.name,
          first_name: e.first_name,
          middle_initial: e.middle_initial,
          last_name: e.last_name,
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
