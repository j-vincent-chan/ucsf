"use client";

import { useActionState } from "react";
import type { ProfileRole } from "@/types/database";
import {
  changePasswordAction,
  updateDisplayNameAction,
  updateSocialSettingsAction,
  updateWorkspaceAction,
  type ActionResult,
} from "@/app/actions/settings-actions";
import type { WorkspaceSocialSettings } from "@/lib/workspace-social-settings";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function ActionMessage({ result }: { result: ActionResult | undefined }) {
  if (!result?.message) return null;
  return (
    <p
      className={`text-sm ${result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}
      role="status"
    >
      {result.message}
    </p>
  );
}

function SubmitButton({ label }: { label: string }) {
  return (
    <Button type="submit" variant="primary" className="mt-3">
      {label}
    </Button>
  );
}

export function SettingsForms({
  email,
  fullName,
  loginUsername,
  role,
  workspaceName,
  workspaceSlug,
  social,
}: {
  email: string;
  fullName: string;
  loginUsername: string | null;
  role: ProfileRole;
  workspaceName: string;
  workspaceSlug: string;
  social: WorkspaceSocialSettings;
}) {
  const [profileState, profileAction] = useActionState(updateDisplayNameAction, undefined as ActionResult | undefined);
  const [workspaceState, workspaceAction] = useActionState(updateWorkspaceAction, undefined as ActionResult | undefined);
  const [socialState, socialAction] = useActionState(updateSocialSettingsAction, undefined as ActionResult | undefined);
  const [passwordState, passwordAction] = useActionState(changePasswordAction, undefined as ActionResult | undefined);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--foreground)]">Profile &amp; settings</h1>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted-foreground)]">
          Update how you appear, your workspace name, social publishing handles, and your account password.
        </p>
      </header>

      <Card>
        <CardTitle>Your account</CardTitle>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-[color:var(--muted-foreground)]">Sign-in email</dt>
            <dd className="mt-0.5 font-medium text-[color:var(--foreground)]">{email || "—"}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--muted-foreground)]">Role</dt>
            <dd className="mt-0.5 capitalize text-[color:var(--foreground)]">{role}</dd>
          </div>
          {loginUsername ? (
            <div>
              <dt className="text-[color:var(--muted-foreground)]">App login username</dt>
              <dd className="mt-0.5 font-mono text-xs text-[color:var(--foreground)]">{loginUsername}</dd>
              <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                Used with password on the sign-in form when different from email. Changing this requires an administrator.
              </p>
            </div>
          ) : null}
        </dl>

        <form action={profileAction} className="mt-6 border-t border-[color:var(--border)]/60 pt-6">
          <Label htmlFor="fullName">Display name</Label>
          <Input
            id="fullName"
            name="fullName"
            defaultValue={fullName}
            className="mt-1.5 max-w-md"
            autoComplete="name"
          />
          <ActionMessage result={profileState} />
          <SubmitButton label="Save display name" />
        </form>
      </Card>

      <Card>
        <CardTitle>Workspace</CardTitle>
        <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
          This label appears in the sidebar and identifies your community workspace.
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-[color:var(--muted-foreground)]">Workspace URL key</dt>
            <dd className="font-mono text-xs text-[color:var(--foreground)]">{workspaceSlug}</dd>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">Fixed for routing; contact support to change.</p>
          </div>
        </dl>
        <form action={workspaceAction} className="mt-6 border-t border-[color:var(--border)]/60 pt-6">
          <Label htmlFor="workspaceName">Workspace name</Label>
          <Input
            id="workspaceName"
            name="workspaceName"
            defaultValue={workspaceName}
            className="mt-1.5 max-w-md"
          />
          <ActionMessage result={workspaceState} />
          <SubmitButton label="Save workspace name" />
        </form>
      </Card>

      <Card>
        <CardTitle>Social publishing</CardTitle>
        <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
          Connect Social Signals monitoring: investigator posts use an X/Twitter{" "}
          <span className="font-medium text-[color:var(--foreground)]">List</span> (Investigators & Others tabs); mentions of your
          program account use your <span className="font-medium text-[color:var(--foreground)]">X profile handle</span>{" "}
          (Mentions tab). Paste your API{" "}
          <span className="font-medium text-[color:var(--foreground)]">Bearer token only in deployment env</span>{" "}
          (<span className="font-mono text-xs">X_BEARER_TOKEN</span>) — never in this form.
        </p>
        <form action={socialAction} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="xHandle">Program X profile (mentions monitoring)</Label>
            <Input
              id="xHandle"
              name="xHandle"
              defaultValue={social.xHandle ?? ""}
              placeholder="@ImmunoX or https://x.com/yourprogram"
              className="mt-1.5"
              autoComplete="off"
            />
            <p className="mt-1.5 text-xs text-[color:var(--muted-foreground)]">
              Used for Mentions plus display name lookup. Optional if you rely on env{" "}
              <span className="font-mono">X_COMMUNITY_HANDLE</span> instead.
            </p>
          </div>
          <div>
            <Label htmlFor="xTwitterListId">Investigator X list ID (timeline monitoring)</Label>
            <Input
              id="xTwitterListId"
              name="xTwitterListId"
              defaultValue={social.xTwitterListId ?? ""}
              placeholder="Numeric list ID only"
              className="mt-1.5 font-mono text-sm"
              inputMode="numeric"
              autoComplete="off"
            />
            <p className="mt-1.5 text-xs text-[color:var(--muted-foreground)]">
              Create an X/Twitter List of investigator accounts → copy the numeric ID from the list URL{" "}
              <span className="opacity-85">(.../lists/<span className="font-mono">123…</span>)</span>.
              Overrides server <span className="font-mono">X_LIST_ID</span> when set.
            </p>
          </div>
          <div>
            <Label htmlFor="blueskyListAtUri">Bluesky list (Investigators tab)</Label>
            <Input
              id="blueskyListAtUri"
              name="blueskyListAtUri"
              defaultValue={social.blueskyListAtUri ?? ""}
              placeholder="at://did:plc:…/app.bsky.graph.list/…"
              className="mt-1.5 font-mono text-xs"
              autoComplete="off"
            />
            <p className="mt-1.5 text-xs text-[color:var(--muted-foreground)]">
              Open a list on bsky.app → “Copy link to list” and paste the <span className="font-mono">at://</span> URI. Used
              for Social Signals → <span className="font-medium">Investigators</span> alongside your X list. Override:{" "}
              <span className="font-mono">BSKY_LIST_AT_URI</span> in env.
            </p>
          </div>
          <div>
            <Label htmlFor="blueskyHandle">Bluesky handle</Label>
            <Input
              id="blueskyHandle"
              name="blueskyHandle"
              defaultValue={social.blueskyHandle ?? ""}
              placeholder="handle.bsky.social"
              className="mt-1.5"
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="instagramHandle">Instagram</Label>
            <Input
              id="instagramHandle"
              name="instagramHandle"
              defaultValue={social.instagramHandle ?? ""}
              placeholder="@yourlab"
              className="mt-1.5"
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
            <Input
              id="linkedinUrl"
              name="linkedinUrl"
              defaultValue={social.linkedinUrl ?? ""}
              placeholder="https://www.linkedin.com/company/…"
              className="mt-1.5"
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="socialNotes">Internal notes</Label>
            <Textarea
              id="socialNotes"
              name="socialNotes"
              defaultValue={social.notes ?? ""}
              placeholder="Tone, posting cadence, approvals…"
              className="mt-1.5 min-h-[88px]"
            />
          </div>
          <ActionMessage result={socialState} />
          <SubmitButton label="Save social fields" />
        </form>
      </Card>

      <Card>
        <CardTitle>Password</CardTitle>
        <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
          Confirms your current password, then updates Supabase Auth and the app login hash when you use password sign-in.
        </p>
        <form action={passwordAction} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              className="mt-1.5 max-w-md"
              autoComplete="current-password"
              required
            />
          </div>
          <div>
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              className="mt-1.5 max-w-md"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div>
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              className="mt-1.5 max-w-md"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <ActionMessage result={passwordState} />
          <SubmitButton label="Update password" />
        </form>
      </Card>
    </div>
  );
}
