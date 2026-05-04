import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { parseWorkspaceSocialSettings } from "@/lib/workspace-social-settings";
import { SettingsForms } from "@/components/settings-forms";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const { user, profile } = await requireProfile();
  const social = parseWorkspaceSocialSettings(profile.community?.social_settings ?? null);

  return (
    <SettingsForms
      email={user.email ?? ""}
      fullName={profile.full_name ?? ""}
      loginUsername={profile.login_username}
      role={profile.role}
      workspaceName={profile.community?.name ?? ""}
      workspaceSlug={profile.community?.slug ?? ""}
      social={social}
    />
  );
}
