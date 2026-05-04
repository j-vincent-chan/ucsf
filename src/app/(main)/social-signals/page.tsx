import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { SocialSignalsWorkspace } from "@/components/social-signals/social-signals-workspace";
import { fetchSocialFeed } from "@/lib/social-signals/aggregate";
import type { SocialFeedTab } from "@/lib/social-signals/types";
import { parseWorkspaceSocialSettings, socialFeedIngestFromWorkspace } from "@/lib/workspace-social-settings";

export const metadata: Metadata = {
  title: "Social Signals",
};

export const dynamic = "force-dynamic";

type Search = Promise<{ tab?: string }>;

export default async function SocialSignalsPage({ searchParams }: { searchParams: Search }) {
  const { profile } = await requireProfile();
  const sp = await searchParams;
  const tabParam = sp.tab;
  const tab: SocialFeedTab =
    tabParam === "mentions"
      ? "mentions"
      : tabParam === "following"
        ? "following"
        : tabParam === "lists"
          ? "lists"
          : "lists";
  const social = parseWorkspaceSocialSettings(profile.community?.social_settings ?? null);
  const workspaceCfg = socialFeedIngestFromWorkspace(social);
  const { posts, sourceMeta, syncedAt, accounts } = await fetchSocialFeed(tab, workspaceCfg);

  return (
    <SocialSignalsWorkspace
      initialLiveTab={tab}
      livePosts={posts}
      sourceMeta={sourceMeta}
      syncedAt={syncedAt}
      accounts={accounts}
    />
  );
}
