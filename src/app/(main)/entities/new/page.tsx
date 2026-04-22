import { requireAdmin } from "@/lib/auth";
import { Card, CardTitle } from "@/components/ui/card";
import { EntityForm } from "../entity-form";

export default async function NewEntityPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">People</h1>
        <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
          Add someone to the watchlist for the digest
        </p>
      </div>
      <Card>
        <CardTitle>Details</CardTitle>
        <div className="mt-4">
          <EntityForm />
        </div>
      </Card>
    </div>
  );
}
