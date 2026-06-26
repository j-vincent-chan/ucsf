import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import {
  parseWorkspaceSocialSettings,
  stripWorkspaceSocialSecretsForClient,
} from "@/lib/workspace-social-settings";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { SettingsForms } from "@/components/settings-forms";
import { xOAuthSetupDiagnostics } from "@/lib/x-oauth";
import { ensureFreshUserAccessToken } from "@/lib/x-post";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "Settings",
};

type Search = Promise<{ x_oauth?: string; x_oauth_error?: string }>;

export default async function SettingsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { user, profile } = await requireProfile();
  const platformAdmin = profile.role === "admin" && !profile.community_id;
  const fullSocial = parseWorkspaceSocialSettings(profile.community?.social_settings ?? null);
  const social = stripWorkspaceSocialSecretsForClient(fullSocial);
  const socialSecretsPresent = {
    xBearerToken: Boolean(fullSocial.xBearerToken?.trim()),
    blueskyAppPassword: Boolean(fullSocial.blueskyAppPassword?.trim()),
  };

  let xOAuthConnected = false;
  let xOAuthRefreshFailed = false;
  const admin = tryCreateAdminClient();
  if (admin) {
    const { data } = await admin.from("profiles").select("x_oauth").eq("id", profile.id).maybeSingle();
    xOAuthConnected = Boolean(data?.x_oauth);
    if (data?.x_oauth) {
      try {
        await ensureFreshUserAccessToken(admin, profile.id, data.x_oauth);
      } catch {
        xOAuthRefreshFailed = true;
      }
    }
  }

  let oauthFlash: { ok: boolean; message: string } | undefined;
  if (sp.x_oauth === "connected") {
    oauthFlash = {
      ok: true,
      message: "X account connected. Posting from digest cards can use these tokens once that flow is enabled.",
    };
  }
  const oauthErr = sp.x_oauth_error;
  if (typeof oauthErr === "string" && oauthErr.length > 0) {
    oauthFlash = { ok: false, message: decodeURIComponent(oauthErr) };
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const requestOrigin = host ? `${proto}://${host}` : undefined;
  const xOAuthDiagnostics = xOAuthSetupDiagnostics(requestOrigin);

  return (
    <SettingsForms
      email={user.email ?? ""}
      fullName={profile.full_name ?? ""}
      loginUsername={profile.login_username}
      role={profile.role}
      platformAdmin={platformAdmin}
      workspaceName={profile.community?.name ?? ""}
      workspaceSlug={profile.community?.slug ?? ""}
      social={social}
      socialSecretsPresent={socialSecretsPresent}
      xOAuthConnected={xOAuthConnected}
      xOAuthRefreshFailed={xOAuthRefreshFailed}
      oauthFlash={oauthFlash}
      xOAuthDiagnostics={xOAuthDiagnostics}
    />
  );
}
