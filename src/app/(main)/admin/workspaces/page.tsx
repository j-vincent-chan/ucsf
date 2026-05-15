import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import {
  AdminWorkspacesClient,
  type AdminWorkspaceCommunity,
  type AdminWorkspaceProfileRow,
} from "./admin-workspaces-client";

async function loadAdminWorkspaceData(): Promise<{
  communities: AdminWorkspaceCommunity[];
  profiles: AdminWorkspaceProfileRow[];
  serviceRoleConfigured: boolean;
  loadError: string | null;
}> {
  const supabase = await createClient();

  const [{ data: commRows, error: cErr }, { data: profRows, error: pErr }] = await Promise.all([
    supabase.from("communities").select("id, slug, name, created_at").order("slug", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name, role, community_id, login_username")
      .order("created_at", { ascending: false }),
  ]);

  if (cErr || pErr) {
    const msg = [cErr?.message, pErr?.message].filter(Boolean).join(" · ");
    return { communities: [], profiles: [], serviceRoleConfigured: false, loadError: msg || "Query failed." };
  }

  const emailById = new Map<string, string>();
  const svc = tryCreateAdminClient();
  if (svc) {
    for (let page = 1; page <= 10; page += 1) {
      const { data: list, error: listErr } = await svc.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (listErr) break;
      const users = list?.users ?? [];
      for (const u of users) {
        if (u.email) emailById.set(u.id, u.email);
      }
      if (users.length < 200) break;
    }
  }

  const communities = (commRows ?? []) as AdminWorkspaceCommunity[];
  const profiles: AdminWorkspaceProfileRow[] = (profRows ?? []).map((r) => ({
    id: r.id,
    full_name: r.full_name,
    role: r.role,
    community_id: r.community_id,
    login_username: r.login_username,
    email: emailById.get(r.id) ?? null,
  }));

  return {
    communities,
    profiles,
    serviceRoleConfigured: Boolean(svc),
    loadError: null,
  };
}

export default async function AdminWorkspacesPage() {
  await requirePlatformAdmin();

  const { communities, profiles, serviceRoleConfigured, loadError } = await loadAdminWorkspaceData();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          <Link href="/admin/workspaces" className="underline">
            ← Workspaces
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Workspaces (admin)</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--muted-foreground)]">
          Create tenants in <code className="rounded bg-[color:var(--muted)]/45 px-1">communities</code> and assign users
          to them. This page is only for <span className="font-medium text-[color:var(--foreground)]">platform</span>{" "}
          administrators (admin accounts with <strong>no</strong> workspace). Tenant admins use People, Signals, and
          Digests inside their community — not this screen. Slug: lowercase letters, digits, and hyphens only (example:{" "}
          <span className="font-mono">diabetes-center</span>) — do not paste the literal “e.g.” from placeholders.
        </p>
      </div>

      {!serviceRoleConfigured ? (
        <div
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          <strong className="font-semibold">Optional:</strong> set{" "}
          <code className="rounded bg-black/10 px-1 dark:bg-white/10">SUPABASE_SERVICE_ROLE_KEY</code> to enrich the
          user table with Auth emails. Create workspace and assign users work with your normal session after the admin
          RLS migration is applied.
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          <strong className="font-semibold">Could not load data:</strong> {loadError}
          {loadError.includes("row-level security") ? (
            <span className="mt-1 block">
              Run the latest Supabase migrations (especially{" "}
              <code className="rounded bg-black/10 px-1 dark:bg-white/10">20260514150000_admin_communities_profiles_rls</code>
              ).
            </span>
          ) : null}
        </div>
      ) : null}

      <AdminWorkspacesClient communities={communities} profiles={profiles} />
    </div>
  );
}
