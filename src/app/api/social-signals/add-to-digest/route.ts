import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { formatYearMonthLabel } from "@/lib/digest-month";
import {
  inferItemCategoryFromSocialPost,
  resolveInvestigatorsForSocialPost,
  type TrackedEntityForPostMatch,
} from "@/lib/social-signals/resolve-investigators-for-post";
import type { Database, ItemCategory } from "@/types/database";

export const dynamic = "force-dynamic";

const socialPostSchema = z
  .object({
    id: z.string().min(3),
    platform: z.enum(["x", "bluesky"]),
    authorName: z.string(),
    authorHandle: z.string(),
    authorAvatarUrl: z.string().optional(),
    text: z.string(),
    url: z.string().min(4),
    postedAt: z.string(),
    mediaUrls: z.array(z.string()).optional(),
    repostedBy: z
      .object({
        displayName: z.string(),
        handle: z.string(),
      })
      .optional(),
    conversationId: z.string().optional(),
    replyCount: z.number().optional(),
    repostCount: z.number().optional(),
    likeCount: z.number().optional(),
    viewCount: z.number().optional(),
    bskyRecordCid: z.string().optional(),
    viewerReposted: z.boolean().optional(),
    bskyViewerRepostUri: z.string().optional(),
    viewerLiked: z.boolean().optional(),
    bskyViewerLikeUri: z.string().optional(),
  })
  .passthrough();

const bodySchema = z.object({
  post: socialPostSchema,
});

function titleFromPost(text: string, platform: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return `Social post (${platform})`;
  return t.length <= 180 ? t : `${t.slice(0, 179)}…`;
}

function digestMonthFromPostedAt(postedAtIso: string): string {
  const d = new Date(postedAtIso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

async function linkInvestigatorsToSourceItem(
  supabase: SupabaseClient<Database>,
  sourceItemId: string,
  resolved: { primaryId: string | null; ids: string[] },
  options?: { setPrimary?: boolean; replaceExisting?: boolean },
): Promise<void> {
  const { primaryId, ids } = resolved;
  const uniqueIds = [...new Set(ids)];

  if (options?.setPrimary !== false && primaryId) {
    await supabase
      .from("source_items")
      .update({ tracked_entity_id: primaryId })
      .eq("id", sourceItemId);
  }

  if (options?.replaceExisting) {
    await supabase
      .from("source_item_tracked_entities")
      .delete()
      .eq("source_item_id", sourceItemId);
    const junctionIds = uniqueIds.filter((id) => id !== primaryId);
    if (junctionIds.length > 0) {
      await supabase.from("source_item_tracked_entities").insert(
        junctionIds.map((tracked_entity_id) => ({
          source_item_id: sourceItemId,
          tracked_entity_id,
        })),
      );
    }
    return;
  }

  if (!uniqueIds.length) return;

  const extraIds = uniqueIds.filter((id) => id !== primaryId);
  if (!extraIds.length) return;

  const { data: existing } = await supabase
    .from("source_item_tracked_entities")
    .select("tracked_entity_id")
    .eq("source_item_id", sourceItemId);

  const have = new Set((existing ?? []).map((r) => r.tracked_entity_id));
  if (primaryId) have.add(primaryId);

  const toInsert = extraIds.filter((id) => !have.has(id)).map((tracked_entity_id) => ({
    source_item_id: sourceItemId,
    tracked_entity_id,
  }));

  if (toInsert.length > 0) {
    await supabase.from("source_item_tracked_entities").insert(toInsert);
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const post = parsed.data.post;
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("community_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profErr || !profile?.community_id) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const communityId = profile.community_id;
  const digestMonth = digestMonthFromPostedAt(post.postedAt);
  if (!digestMonth) {
    return NextResponse.json({ error: "Invalid post date" }, { status: 400 });
  }

  const { data: entityRows } = await supabase
    .from("tracked_entities")
    .select(
      "id, name, first_name, last_name, x_handle, bluesky_handle, x_lab_handle, bluesky_lab_handle",
    )
    .eq("community_id", communityId)
    .eq("active", true);

  const entities = (entityRows ?? []) as TrackedEntityForPostMatch[];
  const investigators = resolveInvestigatorsForSocialPost(post, entities);
  const category = inferItemCategoryFromSocialPost(post);
  const replaceInvestigatorLinks = category === "award";

  let sourceDomain: string | null = null;
  try {
    sourceDomain = new URL(post.url).hostname;
  } catch {
    sourceDomain = null;
  }

  const { data: dupe } = await supabase
    .from("source_items")
    .select("id, status, tracked_entity_id, category")
    .eq("community_id", communityId)
    .eq("source_url", post.url)
    .maybeSingle();

  if (dupe?.id) {
    await linkInvestigatorsToSourceItem(supabase, dupe.id, investigators, {
      setPrimary: Boolean(investigators.primaryId),
      replaceExisting: replaceInvestigatorLinks,
    });

    await supabase
      .from("source_items")
      .update({
        status: "approved",
        ...(investigators.primaryId ? { tracked_entity_id: investigators.primaryId } : {}),
        ...(!dupe.category ? { category: category as ItemCategory } : {}),
      })
      .eq("id", dupe.id);

    return NextResponse.json({
      ok: true as const,
      duplicate: true as const,
      source_item_id: dupe.id,
      digestMonth,
      digestMonthLabel: formatYearMonthLabel(digestMonth),
      investigatorIds: investigators.ids,
    });
  }

  const summarySnippet = titleFromPost(post.text, post.platform);

  const { data: inserted, error: insErr } = await supabase
    .from("source_items")
    .insert({
      community_id: communityId,
      tracked_entity_id: investigators.primaryId,
      source_type: "manual",
      title: titleFromPost(post.text, post.platform),
      source_url: post.url,
      source_domain: sourceDomain,
      published_at: post.postedAt,
      raw_text: post.text,
      raw_summary: summarySnippet.length > 360 ? `${summarySnippet.slice(0, 359)}…` : summarySnippet,
      submitted_by: user.id,
      status: "approved",
      category,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    return NextResponse.json({ error: insErr?.message ?? "Could not add to digest" }, { status: 500 });
  }

  await linkInvestigatorsToSourceItem(supabase, inserted.id, investigators, {
    setPrimary: false,
    replaceExisting: replaceInvestigatorLinks,
  });

  return NextResponse.json({
    ok: true as const,
    duplicate: false as const,
    source_item_id: inserted.id,
    digestMonth,
    digestMonthLabel: formatYearMonthLabel(digestMonth),
    investigatorIds: investigators.ids,
  });
}
