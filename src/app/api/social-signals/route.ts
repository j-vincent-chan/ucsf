import { NextResponse } from "next/server";
import { getProfile, getSessionUser } from "@/lib/auth";
import { fetchSocialFeed } from "@/lib/social-signals/aggregate";
import type { SocialFeedTab } from "@/lib/social-signals/types";
import { parseWorkspaceSocialSettings, socialFeedWorkspaceConfigFromSettings } from "@/lib/workspace-social-settings";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const tabParam = url.searchParams.get("tab");
  const tab: SocialFeedTab =
    tabParam === "mentions"
      ? "mentions"
      : tabParam === "following"
        ? "following"
        : tabParam === "lists"
          ? "lists"
          : "lists";

  try {
    const profile = await getProfile();
    const social = parseWorkspaceSocialSettings(profile?.community?.social_settings ?? null);
    const workspaceCfg = socialFeedWorkspaceConfigFromSettings(social);

    const data = await fetchSocialFeed(tab, workspaceCfg);
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load social feed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
