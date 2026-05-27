import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { fetchLinkPreviewMeta } from "@/lib/fetch-link-preview-meta";
import {
  resolvePublishSourceUrlForItem,
  resolvePublishVisualForSourceItem,
  type ResolvedPublishVisual,
} from "@/lib/publish-source-visual";
import { publishBlueskyText } from "@/lib/social-signals/bluesky";
import {
  parseWorkspaceSocialSettings,
  workspaceBlueskyAppCredentials,
} from "@/lib/workspace-social-settings";
import { xOAuthCredentialsConfigured } from "@/lib/x-oauth";
import {
  createTweet,
  ensureFreshUserAccessToken,
  tweetTextWithSourceLink,
  uploadTwitterMedia,
} from "@/lib/x-post";
import { substituteBlueskyHandlesForX } from "@/lib/x-mention-substitute";
import { updateReviewQueuePost } from "@/lib/social-signals/review-queue-db";

type QueueRow = {
  id: string;
  community_id: string;
  source_item_id: string | null;
  platform: string;
  text: string;
  image_url: string | null;
  source_url: string | null;
  scheduled_at: string | null;
};

export type PublishScheduledResult = {
  processed: number;
  published: number;
  failed: number;
  errors: { id: string; platform: string; message: string }[];
};

const MAX_PER_RUN = 40;

async function fetchImageFromUrl(url: string): Promise<ResolvedPublishVisual | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0]?.trim() ?? "image/jpeg";
    if (!mime.startsWith("image/")) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 1 || buffer.length > 5 * 1024 * 1024) return null;
    return { buffer, mime };
  } catch {
    return null;
  }
}

async function proxyUserIdForCommunity(
  admin: SupabaseClient<Database>,
  communityId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("community_id", communityId)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function xPublisherForCommunity(
  admin: SupabaseClient<Database>,
  communityId: string,
): Promise<{ userId: string; accessToken: string } | null> {
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, role, x_oauth")
    .eq("community_id", communityId)
    .not("x_oauth", "is", null)
    .order("role", { ascending: true });

  const sorted = [...(profiles ?? [])].sort((a, b) => {
    if (a.role === "admin" && b.role !== "admin") return -1;
    if (b.role === "admin" && a.role !== "admin") return 1;
    return 0;
  });

  for (const p of sorted) {
    try {
      const bundle = await ensureFreshUserAccessToken(admin, p.id, p.x_oauth as Json);
      return { userId: p.id, accessToken: bundle.access_token };
    } catch {
      continue;
    }
  }
  return null;
}

async function resolveVisualForQueueRow(
  admin: SupabaseClient<Database>,
  proxyUserId: string | null,
  row: QueueRow,
): Promise<ResolvedPublishVisual | null> {
  if (proxyUserId && row.source_item_id) {
    const fromItem = await resolvePublishVisualForSourceItem(admin, proxyUserId, row.source_item_id);
    if (fromItem) return fromItem;
  }
  if (row.image_url?.trim()) {
    return fetchImageFromUrl(row.image_url.trim());
  }
  return null;
}

async function resolveArticleUrlForQueueRow(
  admin: SupabaseClient<Database>,
  proxyUserId: string | null,
  row: QueueRow,
): Promise<string | null> {
  const direct = row.source_url?.trim();
  if (direct) {
    try {
      const parsed = new URL(direct);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return direct;
    } catch {
      /* fall through */
    }
  }
  if (proxyUserId && row.source_item_id) {
    return resolvePublishSourceUrlForItem(admin, proxyUserId, row.source_item_id);
  }
  return null;
}

async function publishRowToX(
  admin: SupabaseClient<Database>,
  row: QueueRow,
  accessToken: string,
  proxyUserId: string | null,
): Promise<void> {
  let tweetText = row.text.trim();
  if (!tweetText) throw new Error("Empty post text");

  const visual = await resolveVisualForQueueRow(admin, proxyUserId, row);
  let mediaIds: string[] | undefined;
  if (visual && visual.buffer.length <= 5 * 1024 * 1024) {
    try {
      const id = await uploadTwitterMedia(accessToken, visual.buffer, visual.mime);
      mediaIds = [id];
    } catch {
      /* text-only fallback */
    }
  }

  const articleUrl = await resolveArticleUrlForQueueRow(admin, proxyUserId, row);
  if (articleUrl) {
    tweetText = tweetTextWithSourceLink(tweetText, articleUrl).text;
  }

  const { data: handlePairs } = await admin
    .from("tracked_entities")
    .select("x_handle, bluesky_handle")
    .eq("community_id", row.community_id)
    .not("x_handle", "is", null)
    .not("bluesky_handle", "is", null);
  if (handlePairs?.length) {
    tweetText = substituteBlueskyHandlesForX(tweetText, handlePairs);
  }

  try {
    await createTweet(accessToken, tweetText, { mediaIds });
  } catch (e) {
    if (mediaIds?.length) {
      await createTweet(accessToken, tweetText, {});
      return;
    }
    throw e;
  }
}

async function publishRowToBluesky(
  admin: SupabaseClient<Database>,
  row: QueueRow,
  blueskyCredentials: { identifier: string; appPassword: string },
  proxyUserId: string | null,
): Promise<void> {
  const text = row.text.trim();
  if (!text) throw new Error("Empty post text");

  const articleUrl = await resolveArticleUrlForQueueRow(admin, proxyUserId, row);
  const visual = await resolveVisualForQueueRow(admin, proxyUserId, row);

  const sourceOnlyLink =
    !visual && articleUrl && !row.image_url?.trim() && !row.source_item_id;

  if (sourceOnlyLink && articleUrl) {
    const meta = await fetchLinkPreviewMeta(articleUrl);
    await publishBlueskyText(text, {
      linkPreview: { uri: articleUrl, title: meta.title, description: meta.description },
      blueskyCredentials,
    });
    return;
  }

  await publishBlueskyText(text, {
    ...(visual ? { image: visual } : {}),
    ...(articleUrl ? { articleUrl } : {}),
    blueskyCredentials,
  });
}

/**
 * Publishes due `social_review_queue_posts` (status `scheduled`, `scheduled_at` <= now).
 * Intended for Vercel cron / manual ops with service role.
 */
export async function runPublishScheduledQueuePosts(
  admin: SupabaseClient<Database>,
  opts?: { communityId?: string },
): Promise<PublishScheduledResult> {
  const nowIso = new Date().toISOString();
  let q = admin
    .from("social_review_queue_posts")
    .select("id, community_id, source_item_id, platform, text, image_url, source_url, scheduled_at")
    .eq("status", "scheduled")
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(MAX_PER_RUN);
  if (opts?.communityId) {
    q = q.eq("community_id", opts.communityId);
  }
  const { data: due, error } = await q;

  if (error) {
    throw new Error(error.message ?? "Could not load scheduled posts");
  }

  const rows = (due ?? []) as QueueRow[];
  const result: PublishScheduledResult = {
    processed: rows.length,
    published: 0,
    failed: 0,
    errors: [],
  };

  if (rows.length === 0) return result;

  const communityIds = [...new Set(rows.map((r) => r.community_id))];
  const { data: communities } = await admin
    .from("communities")
    .select("id, social_settings")
    .in("id", communityIds);

  const socialByCommunity = new Map<string, ReturnType<typeof parseWorkspaceSocialSettings>>();
  for (const c of communities ?? []) {
    socialByCommunity.set(c.id, parseWorkspaceSocialSettings(c.social_settings));
  }

  const proxyUserByCommunity = new Map<string, string | null>();
  const xPublisherByCommunity = new Map<string, { userId: string; accessToken: string } | null>();

  for (const cid of communityIds) {
    proxyUserByCommunity.set(cid, await proxyUserIdForCommunity(admin, cid));
    if (xOAuthCredentialsConfigured()) {
      xPublisherByCommunity.set(cid, await xPublisherForCommunity(admin, cid));
    } else {
      xPublisherByCommunity.set(cid, null);
    }
  }

  for (const row of rows) {
    try {
      if (row.platform === "bluesky") {
        const creds = workspaceBlueskyAppCredentials(socialByCommunity.get(row.community_id) ?? {});
        if (!creds) {
          throw new Error(
            "Bluesky is not configured for this workspace (Settings → Social publishing).",
          );
        }
        await publishRowToBluesky(
          admin,
          row,
          creds,
          proxyUserByCommunity.get(row.community_id) ?? null,
        );
      } else if (row.platform === "x") {
        const publisher = xPublisherByCommunity.get(row.community_id);
        if (!publisher) {
          throw new Error(
            "No connected X account in this workspace — connect X in Settings (admin or editor).",
          );
        }
        await publishRowToX(
          admin,
          row,
          publisher.accessToken,
          proxyUserByCommunity.get(row.community_id) ?? null,
        );
      } else {
        throw new Error(`Unsupported platform: ${row.platform}`);
      }

      const publishedAt = new Date().toISOString();
      const { error: updErr } = await updateReviewQueuePost(
        (patch) =>
          admin
            .from("social_review_queue_posts")
            .update(patch as never)
            .eq("id", row.id)
            .eq("status", "scheduled"),
        { status: "published", published_at: publishedAt, publish_error: null },
      );

      if (updErr) throw new Error(updErr.message ?? "Could not mark published");
      result.published++;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Publish failed";
      result.failed++;
      result.errors.push({ id: row.id, platform: row.platform, message });

      await updateReviewQueuePost(
        (patch) =>
          admin
            .from("social_review_queue_posts")
            .update(patch as never)
            .eq("id", row.id)
            .eq("status", "scheduled"),
        { status: "needs_review", publish_error: message.slice(0, 2000) },
      );
    }
  }

  return result;
}
