import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { parseWorkspaceSocialSettings } from "@/lib/workspace-social-settings";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { SettingsForms } from "@/components/settings-forms";

export const metadata: Metadata = {
  title: "Settings",
};

type Search = Promise<{ x_oauth?: string; x_oauth_error?: string }>;

export default async function SettingsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { user, profile } = await requireProfile();
  const social = parseWorkspaceSocialSettings(profile.community?.social_settings ?? null);

  let xOAuthConnected = false;
  const admin = tryCreateAdminClient();
  if (admin) {
    const { data } = await admin.from("profiles").select("x_oauth").eq("id", profile.id).maybeSingle();
    xOAuthConnected = Boolean(data?.x_oauth);
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

  return (
    <SettingsForms
      email={user.email ?? ""}
      fullName={profile.full_name ?? ""}
      loginUsername={profile.login_username}
      role={profile.role}
      workspaceName={profile.community?.name ?? ""}
      workspaceSlug={profile.community?.slug ?? ""}
      social={social}
      xOAuthConnected={xOAuthConnected}
      oauthFlash={oauthFlash}
    />
  );
}
