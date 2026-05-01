import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { SocialSignalsWorkspace } from "@/components/social-signals/social-signals-workspace";
import { fetchSocialFeed } from "@/lib/social-signals/aggregate";
import type { SocialFeedTab } from "@/lib/social-signals/types";

export const metadata: Metadata = {
  title: "Social Signals",
};

export const dynamic = "force-dynamic";

type Search = Promise<{ tab?: string }>;

export default async function SocialSignalsPage({ searchParams }: { searchParams: Search }) {
  await requireProfile();
  const sp = await searchParams;
  const tab: SocialFeedTab = sp.tab === "mentions" ? "mentions" : "following";
  const { posts, sourceMeta, syncedAt, accounts } = await fetchSocialFeed(tab);

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
