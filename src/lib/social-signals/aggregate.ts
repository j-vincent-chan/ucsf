import type { SocialFeedWorkspaceConfig } from "@/lib/workspace-social-settings";
import type { AggregatedFeed, SocialFeedTab, SocialPost, SourceMeta } from "./types";
import { dedupeSocialPostsById } from "./dedupe-posts";
import {
  fetchBlueskyFollowing,
  fetchBlueskyListFeed,
  fetchBlueskyMentions,
  fetchBlueskyProfileSummary,
} from "./bluesky";
import { fetchXListTimeline, fetchXMentionSearch, fetchXTweetsByIds, fetchXUserByUsername } from "./x";
import { missingXThreadRootTweetIds } from "./group-feed-rows";

export type { SocialFeedWorkspaceConfig } from "@/lib/workspace-social-settings";

function sortPosts(posts: SocialPost[]): SocialPost[] {
  return [...posts].sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
}

export async function fetchSocialFeed(
  tab: SocialFeedTab,
  workspaceCfg?: SocialFeedWorkspaceConfig | null,
): Promise<AggregatedFeed> {
  const bearer = workspaceCfg?.xBearerToken?.trim();
  const listId = workspaceCfg?.listId?.trim();
  const xCommunityHandle =
    workspaceCfg?.communityHandle?.trim().replace(/^@+/, "") || undefined;

  const bskyId = workspaceCfg?.blueskyIdentifier?.trim();
  const bskyPw = workspaceCfg?.blueskyAppPassword?.trim();
  const bskyMention = workspaceCfg?.blueskyIdentifier?.trim();
  const bskyListUri = workspaceCfg?.blueskyListAtUri?.trim();

  const xConfiguredForTab = Boolean(
    bearer &&
      ((tab === "mentions" && xCommunityHandle) ||
        ((tab === "following" || tab === "lists") && listId)),
  );
  const bskyConfiguredForTab = Boolean(
    bskyId &&
      bskyPw &&
      (tab === "following" ||
        (tab === "mentions" && Boolean(bskyMention?.trim())) ||
        (tab === "lists" && Boolean(bskyListUri?.trim()))),
  );

  const sourceMeta: SourceMeta = {
    x: {
      configured: xConfiguredForTab,
      detail: undefined,
    },
    bluesky: {
      configured: bskyConfiguredForTab,
      detail: undefined,
    },
  };

  const tasks: Promise<void>[] = [];
  const collected: SocialPost[] = [];

  let xName: string | undefined;
  let xAvatarUrl: string | undefined;
  let xDisplayResolved = xCommunityHandle ? `@${xCommunityHandle}` : undefined;

  let blueskyName: string | undefined;
  let blueskyAvatarUrl: string | undefined;
  let blueskyDisplayResolved = bskyId?.trim() || undefined;

  if (bearer && xCommunityHandle) {
    tasks.push(
      (async () => {
        const u = await fetchXUserByUsername(bearer, xCommunityHandle);
        if (u) {
          xName = u.name;
          xAvatarUrl = u.profileImageUrl ?? undefined;
          xDisplayResolved = `@${u.username}`;
        }
      })(),
    );
  }

  if (bskyId && bskyPw) {
    tasks.push(
      (async () => {
        const p = await fetchBlueskyProfileSummary(bskyId, bskyPw);
        if (p) {
          blueskyName = p.displayName;
          blueskyAvatarUrl = p.avatarUrl;
          blueskyDisplayResolved = p.handle;
        }
      })(),
    );
  }

  if (bearer && listId && (tab === "following" || tab === "lists")) {
    tasks.push(
      (async () => {
        const { posts, detail } = await fetchXListTimeline(bearer, listId);
        collected.push(...posts);
        if (detail) sourceMeta.x = { ...sourceMeta.x, detail };
      })(),
    );
  } else if (bearer && xCommunityHandle && tab === "mentions") {
    tasks.push(
      (async () => {
        const { posts, detail } = await fetchXMentionSearch(bearer, xCommunityHandle);
        collected.push(...posts);
        if (detail) sourceMeta.x = { ...sourceMeta.x, detail };
      })(),
    );
  } else if (bearer) {
    sourceMeta.x = {
      configured: false,
      detail:
        tab === "mentions"
          ? "X Mentions: save your program X handle under Settings → Social publishing."
          : "X list: add the numeric List ID under Settings → Social publishing (investigator list).",
    };
  }

  if (bskyId && bskyPw) {
    if (tab === "following") {
      tasks.push(
        (async () => {
          const { posts, detail } = await fetchBlueskyFollowing(bskyId, bskyPw);
          collected.push(...posts);
          if (detail) sourceMeta.bluesky = { ...sourceMeta.bluesky, detail };
        })(),
      );
    } else if (tab === "mentions") {
      tasks.push(
        (async () => {
          const { posts, detail } = await fetchBlueskyMentions(
            bskyId,
            bskyPw,
            bskyMention ?? "",
          );
          collected.push(...posts);
          if (detail) sourceMeta.bluesky = { ...sourceMeta.bluesky, detail };
        })(),
      );
    } else if (tab === "lists" && bskyListUri) {
      tasks.push(
        (async () => {
          const { posts, detail } = await fetchBlueskyListFeed(bskyId, bskyPw, bskyListUri);
          collected.push(...posts);
          if (detail) sourceMeta.bluesky = { ...sourceMeta.bluesky, detail };
        })(),
      );
    } else if (tab === "lists") {
      sourceMeta.bluesky = {
        configured: false,
        detail:
          "Bluesky Investigators tab: add an `at://…/app.bsky.graph.list/…` URI under Settings → Social publishing.",
      };
    }
  }

  await Promise.all(tasks);

  /** Mention/list APIs often omit the thread root; fetch by id so grouped threads show root → replies. */
  if (bearer) {
    const missingRoots = missingXThreadRootTweetIds(collected);
    if (missingRoots.length > 0) {
      const { posts: roots, detail } = await fetchXTweetsByIds(bearer, missingRoots);
      collected.push(...roots);
      if (detail) sourceMeta.x = { ...sourceMeta.x, detail };
    }
  }

  const syncedAt = new Date().toISOString();
  const accounts = {
    xDisplay: xDisplayResolved,
    xName,
    xAvatarUrl,
    blueskyDisplay: blueskyDisplayResolved,
    blueskyName,
    blueskyAvatarUrl,
  };

  if (!bearer) {
    sourceMeta.x = {
      configured: false,
      detail:
        "X API: save this workspace’s Bearer token under Settings → Social publishing. List ID and program handle are configured on the same page.",
    };
  }
  if (!bskyId || !bskyPw) {
    sourceMeta.bluesky = {
      configured: false,
      detail:
        "Bluesky: save your workspace Bluesky handle and app password under Settings → Social publishing.",
    };
  }

  return {
    posts: sortPosts(dedupeSocialPostsById(collected)),
    sourceMeta,
    syncedAt,
    accounts,
  };
}

/** X + Bluesky profile avatars only (no timelines) — digest cards, composer, etc. */
export async function fetchWorkspaceConnectedAccountAvatars(
  workspaceCfg?: SocialFeedWorkspaceConfig | null,
): Promise<{ xAvatarUrl?: string; blueskyAvatarUrl?: string }> {
  const bearer = workspaceCfg?.xBearerToken?.trim();
  const xCommunityHandle =
    workspaceCfg?.communityHandle?.trim().replace(/^@+/, "") || undefined;

  const bskyId = workspaceCfg?.blueskyIdentifier?.trim();
  const bskyPw = workspaceCfg?.blueskyAppPassword?.trim();

  let xAvatarUrl: string | undefined;
  let blueskyAvatarUrl: string | undefined;

  const tasks: Promise<void>[] = [];

  if (bearer && xCommunityHandle) {
    tasks.push(
      (async () => {
        const u = await fetchXUserByUsername(bearer, xCommunityHandle);
        if (u?.profileImageUrl) {
          xAvatarUrl = u.profileImageUrl;
        }
      })(),
    );
  }

  if (bskyId && bskyPw) {
    tasks.push(
      (async () => {
        const p = await fetchBlueskyProfileSummary(bskyId, bskyPw);
        if (p?.avatarUrl) {
          blueskyAvatarUrl = p.avatarUrl;
        }
      })(),
    );
  }

  await Promise.all(tasks);
  return { xAvatarUrl, blueskyAvatarUrl };
}
