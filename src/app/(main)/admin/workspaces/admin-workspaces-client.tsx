"use client";

import { useActionState, useMemo } from "react";
import {
  adminAssignProfileCommunityAction,
  adminCreateCommunityAction,
  adminCreateUserAction,
  type AdminWorkspaceActionResult,
} from "@/app/actions/admin-workspaces-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardTitle } from "@/components/ui/card";

export type AdminWorkspaceCommunity = {
  id: string;
  slug: string;
  name: string;
  created_at: string;
};

export type AdminWorkspaceProfileRow = {
  id: string;
  full_name: string | null;
  role: string;
  community_id: string | null;
  login_username: string | null;
  email: string | null;
};

function emptyResult(): AdminWorkspaceActionResult {
  return { ok: true, message: "" };
}

export function AdminWorkspacesClient({
  communities,
  profiles,
}: {
  communities: AdminWorkspaceCommunity[];
  profiles: AdminWorkspaceProfileRow[];
}) {
  const [createState, createAction, createPending] = useActionState(adminCreateCommunityAction, emptyResult());
  const [assignState, assignAction, assignPending] = useActionState(
    adminAssignProfileCommunityAction,
    emptyResult(),
  );
  const [createUserState, createUserAction, createUserPending] = useActionState(
    adminCreateUserAction,
    emptyResult(),
  );

  const communityById = useMemo(() => new Map(communities.map((c) => [c.id, c])), [communities]);

  return (
    <div className="space-y-8">
      <Card className="p-5 sm:p-6">
        <CardTitle>Create workspace</CardTitle>
        <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
          Adds a row to <code className="rounded bg-[color:var(--muted)]/50 px-1">communities</code>. New
          signups can use user metadata{" "}
          <code className="rounded bg-[color:var(--muted)]/50 px-1">community_slug</code> matching this slug.
        </p>
        <form action={createAction} className="mt-4 grid max-w-xl gap-4 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <Label htmlFor="ws-slug">Slug (URL-safe)</Label>
            <Input
              id="ws-slug"
              name="slug"
              required
              autoComplete="off"
              placeholder="e.g. diabetes-center"
              className="mt-1 font-mono text-sm"
            />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="ws-name">Display name</Label>
            <Input id="ws-name" name="name" required placeholder="Diabetes Center" className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={createPending}>
              {createPending ? "Creating…" : "Create workspace"}
            </Button>
            {createState.message ? (
              <p
                className={`mt-2 text-sm ${createState.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}
                role="status"
              >
                {createState.message}
              </p>
            ) : null}
          </div>
        </form>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardTitle>Create user</CardTitle>
        <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
          Registers a Supabase Auth account and a <code className="rounded bg-[color:var(--muted)]/50 px-1">profiles</code> row
          in the chosen workspace (via signup trigger +{" "}
          <code className="rounded bg-[color:var(--muted)]/50 px-1">community_slug</code> metadata). Requires{" "}
          <code className="rounded bg-[color:var(--muted)]/50 px-1">SUPABASE_SERVICE_ROLE_KEY</code> on the server. Share the
          initial password with the new user securely.
        </p>
        <form action={createUserAction} className="mt-4 grid max-w-3xl gap-4 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <Label htmlFor="nu-email">Email (sign-in)</Label>
            <Input
              id="nu-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="name@organization.org"
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="nu-full">Display name (optional)</Label>
            <Input id="nu-full" name="fullName" autoComplete="off" placeholder="Dr. Sam Lee" className="mt-1" />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="nu-community">Workspace</Label>
            <select
              id="nu-community"
              name="nuCommunityId"
              required
              className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
            >
              <option value="">Choose…</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.slug})
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="nu-role">Role</Label>
            <select
              id="nu-role"
              name="role"
              defaultValue="editor"
              className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
            >
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="nu-password">Initial password</Label>
            <Input
              id="nu-password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={10}
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="nu-password2">Confirm password</Label>
            <Input
              id="nu-password2"
              name="passwordConfirm"
              type="password"
              required
              autoComplete="new-password"
              minLength={10}
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" variant="secondary" disabled={createUserPending}>
              {createUserPending ? "Creating user…" : "Create user"}
            </Button>
            {createUserState.message ? (
              <p
                className={`mt-2 text-sm ${createUserState.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}
                role="status"
              >
                {createUserState.message}
              </p>
            ) : null}
          </div>
        </form>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardTitle>Assign user to workspace</CardTitle>
        <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
          Moves an existing profile to another workspace (updates{" "}
          <code className="rounded bg-[color:var(--muted)]/50 px-1">community_id</code>). Uses your admin session.
        </p>
        <form action={assignAction} className="mt-4 grid max-w-3xl gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="assign-profile">User</Label>
            <select
              id="assign-profile"
              name="profileId"
              required
              className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
            >
              <option value="">Choose…</option>
              {profiles.map((p) => {
                const label =
                  [p.full_name?.trim() || null, p.email, p.login_username, p.id.slice(0, 8)]
                    .filter(Boolean)
                    .join(" · ") || p.id;
                return (
                  <option key={p.id} value={p.id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <Label htmlFor="assign-community">Workspace</Label>
            <select
              id="assign-community"
              name="communityId"
              required
              className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm"
            >
              <option value="">Choose…</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.slug})
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" variant="secondary" disabled={assignPending}>
              {assignPending ? "Saving…" : "Assign workspace"}
            </Button>
            {assignState.message ? (
              <p
                className={`mt-2 text-sm ${assignState.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}
                role="status"
              >
                {assignState.message}
              </p>
            ) : null}
          </div>
        </form>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardTitle>Existing workspaces</CardTitle>
        <ul className="mt-3 divide-y divide-[color:var(--border)]/60 text-sm">
          {communities.length === 0 ? (
            <li className="py-2 text-[color:var(--muted-foreground)]">No communities yet.</li>
          ) : (
            communities.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="font-medium text-[color:var(--foreground)]">{c.name}</span>
                <span className="font-mono text-xs text-[color:var(--muted-foreground)]">{c.slug}</span>
                <span className="w-full text-xs text-[color:var(--muted-foreground)] sm:w-auto">{c.id}</span>
              </li>
            ))
          )}
        </ul>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardTitle>Users (profiles)</CardTitle>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border)] text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
                <th className="py-2 pr-3 font-medium">Name / login</th>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 font-medium">Workspace</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => {
                const com = communityById.get(p.community_id ?? "");
                return (
                  <tr key={p.id} className="border-b border-[color:var(--border)]/50">
                    <td className="max-w-[14rem] py-2 pr-3 align-top">
                      <div className="truncate font-medium">{p.full_name || "—"}</div>
                      <div className="truncate font-mono text-xs text-[color:var(--muted-foreground)]">
                        {p.login_username || p.id.slice(0, 8) + "…"}
                      </div>
                    </td>
                    <td className="max-w-[12rem] truncate py-2 pr-3 align-top text-[color:var(--muted-foreground)]">
                      {p.email || "—"}
                    </td>
                    <td className="py-2 pr-3 align-top">{p.role}</td>
                    <td className="py-2 align-top text-[color:var(--muted-foreground)]">
                      {com ? `${com.name} (${com.slug})` : p.community_id ? p.community_id : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
