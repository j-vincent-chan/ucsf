import type { AggregatedFeed, SocialFeedTab, SocialPost, SourceMeta } from "./types";
import { fetchBlueskyFollowing, fetchBlueskyMentions } from "./bluesky";
import { fetchLinkedInPlaceholder } from "./linkedin";
import { fetchXListTimeline, fetchXMentionSearch } from "./x";

function sortPosts(posts: SocialPost[]): SocialPost[] {
  return [...posts].sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
}

export async function fetchSocialFeed(tab: SocialFeedTab): Promise<AggregatedFeed> {
  const bearer = process.env.X_BEARER_TOKEN?.trim();
  const listId = process.env.X_LIST_ID?.trim();
  const xHandle = process.env.X_COMMUNITY_HANDLE?.trim();

  const bskyId = process.env.BSKY_IDENTIFIER?.trim();
  const bskyPw = process.env.BSKY_APP_PASSWORD?.trim();
  const bskyMention =
    process.env.BSKY_MENTION_HANDLE?.trim() || process.env.BSKY_IDENTIFIER?.trim();

  const sourceMeta: SourceMeta = {
    x: {
      configured: Boolean(bearer && (tab === "following" ? listId : xHandle)),
      detail: undefined,
    },
    bluesky: {
      configured: Boolean(bskyId && bskyPw),
      detail: undefined,
    },
    linkedin: {
      configured: Boolean(
        process.env.LINKEDIN_ACCESS_TOKEN?.trim() && process.env.LINKEDIN_ORGANIZATION_URN?.trim(),
      ),
      detail: undefined,
    },
  };

  const tasks: Promise<void>[] = [];
  const collected: SocialPost[] = [];

  if (bearer && listId && tab === "following") {
    tasks.push(
      (async () => {
        const { posts, detail } = await fetchXListTimeline(bearer, listId);
        collected.push(...posts);
        if (detail) sourceMeta.x = { ...sourceMeta.x, detail };
      })(),
    );
  } else if (bearer && xHandle && tab === "mentions") {
    tasks.push(
      (async () => {
        const { posts, detail } = await fetchXMentionSearch(bearer, xHandle);
        collected.push(...posts);
        if (detail) sourceMeta.x = { ...sourceMeta.x, detail };
      })(),
    );
  } else if (bearer) {
    sourceMeta.x = {
      configured: false,
      detail:
        tab === "following"
          ? "X: set X_LIST_ID (Twitter List ID) for the Following tab."
          : "X: set X_COMMUNITY_HANDLE (without @) for the Mentions tab.",
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
    } else {
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
    }
  }

  tasks.push(
    (async () => {
      const { posts, detail } = await fetchLinkedInPlaceholder();
      collected.push(...posts);
      if (detail) sourceMeta.linkedin = { ...sourceMeta.linkedin, detail };
    })(),
  );

  await Promise.all(tasks);

  if (!process.env.X_BEARER_TOKEN?.trim()) {
    sourceMeta.x = {
      configured: false,
      detail: "Add X_BEARER_TOKEN (Twitter API v2 bearer token) to .env.local.",
    };
  }
  if (!bskyId || !bskyPw) {
    sourceMeta.bluesky = {
      configured: false,
      detail: "Add BSKY_IDENTIFIER and BSKY_APP_PASSWORD (Bluesky app password) to .env.local.",
    };
  }

  return {
    posts: sortPosts(collected),
    sourceMeta,
  };
}
