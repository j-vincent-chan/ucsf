import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireWatchlistEditor } from "@/lib/auth";
import { Card, CardTitle } from "@/components/ui/card";
import { EntityForm } from "../../entity-form";

export default async function EditEntityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireWatchlistEditor();
  const { id } = await params;
  const supabase = await createClient();
  const { data: entity, error } = await supabase
    .from("tracked_entities")
    .select("*")
    .eq("id", id)
    .eq("community_id", profile.community_id)
    .maybeSingle();

  if (error || !entity) notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">People</h1>
        <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
          Edit · {entity.name}
        </p>
      </div>
      <Card>
        <CardTitle>Details</CardTitle>
        <div className="mt-4">
          <EntityForm initial={entity} communityId={entity.community_id} />
        </div>
      </Card>
    </div>
  );
}
