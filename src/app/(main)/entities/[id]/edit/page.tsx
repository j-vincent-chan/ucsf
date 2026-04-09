import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { Card, CardTitle } from "@/components/ui/card";
import { EntityForm } from "../../entity-form";

export default async function EditEntityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const { data: entity, error } = await supabase
    .from("tracked_entities")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !entity) notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Edit watchlist entry</h1>
        <p className="mt-1 text-sm text-neutral-500">{entity.name}</p>
      </div>
      <Card>
        <CardTitle>Details</CardTitle>
        <div className="mt-4">
          <EntityForm initial={entity} />
        </div>
      </Card>
    </div>
  );
}
