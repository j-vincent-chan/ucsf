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

/** Workspace social ingest targets (Bearer / Bluesky app password stay in env only). */
export type SocialFeedWorkspaceConfig = {
  communityHandle?: string;
  listId?: string;
  blueskyListAtUri?: string;
};

function sortPosts(posts: SocialPost[]): SocialPost[] {
  return [...posts].sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
}

export async function fetchSocialFeed(
  tab: SocialFeedTab,
  workspaceCfg?: SocialFeedWorkspaceConfig | null,
): Promise<AggregatedFeed> {
  const bearer = process.env.X_BEARER_TOKEN?.trim();
  const listIdWs = workspaceCfg?.listId?.trim();
  const handleWs = workspaceCfg?.communityHandle?.trim();
  const listId = listIdWs || process.env.X_LIST_ID?.trim();
  const envHandleRaw = process.env.X_COMMUNITY_HANDLE?.trim()?.replace(/^@+/, "") ?? "";
  const xCommunityHandle = (handleWs || envHandleRaw).replace(/^@+/, "") || undefined;

  const bskyId = process.env.BSKY_IDENTIFIER?.trim();
  const bskyPw = process.env.BSKY_APP_PASSWORD?.trim();
  const bskyMention =
    process.env.BSKY_MENTION_HANDLE?.trim() || process.env.BSKY_IDENTIFIER?.trim();
  const bskyListUri =
    workspaceCfg?.blueskyListAtUri?.trim() || process.env.BSKY_LIST_AT_URI?.trim();

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
          ? "X Mentions: save your program X handle under Settings → Social publishing, or set X_COMMUNITY_HANDLE in server env."
          : "X list: add the numeric List ID under Settings → Social publishing (investigator list), or set X_LIST_ID in server env.",
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
          "Bluesky Investigators tab: add an `at://…/app.bsky.graph.list/…` URI under Settings → Social publishing, or set BSKY_LIST_AT_URI in env.",
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

  if (!process.env.X_BEARER_TOKEN?.trim()) {
    sourceMeta.x = {
      configured: false,
      detail:
        "Server needs X_BEARER_TOKEN (Twitter API v2 bearer). On Vercel, add it under Project → Settings → Environment Variables. List ID / handle: workspace Settings or X_LIST_ID / X_COMMUNITY_HANDLE.",
    };
  }
  if (!bskyId || !bskyPw) {
    sourceMeta.bluesky = {
      configured: false,
      detail:
        "Add BSKY_IDENTIFIER and BSKY_APP_PASSWORD (Bluesky app password) to server env — for Vercel: Project → Settings → Environment Variables (Production).",
    };
  }

  return {
    posts: sortPosts(dedupeSocialPostsById(collected)),
    sourceMeta,
    syncedAt,
    accounts,
  };
}
