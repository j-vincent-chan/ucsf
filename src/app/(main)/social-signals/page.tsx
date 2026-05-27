import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { SocialSignalsWorkspace } from "@/components/social-signals/social-signals-workspace";
import { fetchSocialFeed } from "@/lib/social-signals/aggregate";
import type { SocialFeedTab } from "@/lib/social-signals/types";
import { parseWorkspaceSocialSettings, socialFeedWorkspaceConfigFromSettings } from "@/lib/workspace-social-settings";
import type { PostStatus, PublishPlatform, WorkspaceSchedulerPost } from "@/lib/social-signals/workspace-types";
import { investigatorsFromSourceItemRow } from "@/lib/source-item-investigators";
import { createClient } from "@/lib/supabase/server";
import { fetchInvestigatorSocialDirectoryForCommunity } from "@/lib/social-signals/fetch-investigator-social-directory";
import { selectReviewQueuePosts } from "@/lib/social-signals/review-queue-db";

const JUNCTION_CHUNK = 120;

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
  const workspaceCfg = socialFeedWorkspaceConfigFromSettings(social);
  const investigatorDirectory = profile.community_id
    ? await fetchInvestigatorSocialDirectoryForCommunity(profile.community_id)
    : undefined;
  const { posts, sourceMeta, syncedAt, accounts } = await fetchSocialFeed(tab, workspaceCfg, {
    investigatorDirectory,
  });

  type ReviewQueueRow = {
    id: string;
    source_item_id: string | null;
    platform: string;
    status: string;
    text: string;
    image_url: string | null;
    source_url: string | null;
    created_at: string;
    updated_at: string;
    scheduled_at: string | null;
    published_at?: string | null;
    publish_error?: string | null;
  };

  const { data: drafts, error: draftsErr } = await selectReviewQueuePosts<ReviewQueueRow[]>((select) =>
    supabase
      .from("social_review_queue_posts")
      .select(select)
      .order("created_at", { ascending: false })
      .limit(200),
    { sourceItemId: true },
  );
  if (draftsErr) {
    console.error("[social-signals] review queue load failed:", draftsErr.message);
  }

  const sourceIds = Array.from(new Set((drafts ?? []).map((d) => d.source_item_id).filter(Boolean))) as string[];

  type SourceRow = {
    id: string;
    title: string;
    category: string | null;
    tracked_entity_id: string | null;
    tracked_entities: unknown;
  };

  const { data: sourceRows } = sourceIds.length
    ? await supabase
        .from("source_items")
        .select(
          `
          id,
          title,
          category,
          tracked_entity_id,
          tracked_entities!tracked_entity_id ( id, name, first_name, last_name, lab_website )
        `,
        )
        .in("id", sourceIds)
    : { data: [] as SourceRow[] };

  type JunctionRow = {
    source_item_id: string;
    tracked_entity_id: string;
    tracked_entities: unknown;
  };

  const junctionAccum: JunctionRow[] = [];
  for (let i = 0; i < sourceIds.length; i += JUNCTION_CHUNK) {
    const chunk = sourceIds.slice(i, i + JUNCTION_CHUNK);
    const { data: jRows } = await supabase
      .from("source_item_tracked_entities")
      .select(
        `
        source_item_id,
        tracked_entity_id,
        tracked_entities!tracked_entity_id ( id, name, first_name, last_name, lab_website )
      `,
      )
      .in("source_item_id", chunk);
    if (jRows?.length) junctionAccum.push(...(jRows as JunctionRow[]));
  }

  const junctionBySourceId = new Map<string, JunctionRow[]>();
  for (const row of junctionAccum) {
    const arr = junctionBySourceId.get(row.source_item_id) ?? [];
    arr.push(row);
    junctionBySourceId.set(row.source_item_id, arr);
  }

  const investigatorsSummaryForSource = (sourceItemId: string | null): string | null => {
    if (!sourceItemId) return null;
    const src = (sourceRows ?? []).find((s) => s.id === sourceItemId);
    if (!src) return null;
    const chips = investigatorsFromSourceItemRow(src.tracked_entities, junctionBySourceId.get(sourceItemId) ?? []);
    if (!chips.length) return null;
    return chips.map((c) => c.name).join(" · ");
  };

  const bySourceId = new Map((sourceRows ?? []).map((r) => [r.id, r]));

  const initialSchedulerPosts: WorkspaceSchedulerPost[] = (drafts ?? []).map((d) => {
    const src = d.source_item_id ? bySourceId.get(d.source_item_id) : undefined;
    return {
      id: d.id,
      platform: d.platform as PublishPlatform,
      status: d.status as PostStatus,
      text: d.text,
      image_url: d.image_url ?? null,
      source_url: d.source_url ?? null,
      created_at: d.created_at,
      scheduled_at: d.scheduled_at ?? null,
      published_at: (d as { published_at?: string | null }).published_at ?? null,
      publish_error: (d as { publish_error?: string | null }).publish_error ?? null,
      sourceSignalTitle: src?.title ?? "Signal",
      investigatorsSummary: investigatorsSummaryForSource(d.source_item_id),
    };
  });

  return (
    <SocialSignalsWorkspace
      liveFeedWorkspaceKey={profile.community_id ?? "none"}
      initialLiveTab={tab}
      livePosts={posts}
      sourceMeta={sourceMeta}
      syncedAt={syncedAt}
      accounts={accounts}
      initialSchedulerPosts={initialSchedulerPosts}
      investigatorDirectory={investigatorDirectory}
    />
  );
}
