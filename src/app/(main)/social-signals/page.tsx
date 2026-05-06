import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { SocialSignalsWorkspace } from "@/components/social-signals/social-signals-workspace";
import { fetchSocialFeed } from "@/lib/social-signals/aggregate";
import type { SocialFeedTab } from "@/lib/social-signals/types";
import { parseWorkspaceSocialSettings, socialFeedIngestFromWorkspace } from "@/lib/workspace-social-settings";
import type { ReviewQueueItem } from "@/lib/social-signals/workspace-types";
import { X_CHAR_LIMIT, BLUESKY_CHAR_LIMIT } from "@/lib/social-signals/workspace-types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Social Signals",
};

export const dynamic = "force-dynamic";

type Search = Promise<{ tab?: string }>;

export default async function SocialSignalsPage({ searchParams }: { searchParams: Search }) {
  const { profile } = await requireProfile();
  const supabase = await createClient();
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

  const { data: drafts } = await supabase
    .from("social_review_queue_posts")
    .select("id, source_item_id, platform, status, text, image_url, source_url, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const sourceIds = Array.from(new Set((drafts ?? []).map((d) => d.source_item_id).filter(Boolean))) as string[];
  const { data: sourceRows } = sourceIds.length
    ? await supabase.from("source_items").select("id, title, category").in("id", sourceIds)
    : { data: [] as { id: string; title: string; category: string | null }[] };
  const bySourceId = new Map((sourceRows ?? []).map((r) => [r.id, r]));

  const initialReviewQueue: ReviewQueueItem[] = (drafts ?? []).map((d) => {
    const src = d.source_item_id ? bySourceId.get(d.source_item_id) : undefined;
    const sourceSignalTitle = src?.title ?? "Signal";
    const characterLimit = d.platform === "x" ? X_CHAR_LIMIT : BLUESKY_CHAR_LIMIT;
    return {
      id: d.id,
      version: 1,
      assignedReviewer: undefined,
      dueDate: undefined,
      flags: [],
      comments: [],
      reviewStatus: d.status as any,
      post: {
        id: d.id,
        platform: d.platform as any,
        accountHandle: d.platform === "x" ? "@x" : "@bsky",
        sourceSignalType: "paper",
        sourceSignalTitle,
        status: d.status as any,
        text: d.text,
        imageUrl: d.image_url ?? null,
        linkPreview: d.source_url ? { title: sourceSignalTitle, url: d.source_url, description: "" } : undefined,
        hashtags: [],
        mentions: [],
        createdAt: d.created_at,
        characterLimit,
      },
    };
  });

  return (
    <SocialSignalsWorkspace
      initialLiveTab={tab}
      livePosts={posts}
      sourceMeta={sourceMeta}
      syncedAt={syncedAt}
      accounts={accounts}
      initialReviewQueue={initialReviewQueue.length ? initialReviewQueue : undefined}
    />
  );
}
