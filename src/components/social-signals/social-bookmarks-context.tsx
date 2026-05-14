"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type { SocialPost } from "@/lib/social-signals/types";

export type SocialBookmarkRow = {
  post_id: string;
  post: SocialPost;
  created_at: string;
};

type SocialBookmarksContextValue = {
  items: SocialBookmarkRow[];
  loading: boolean;
  bookmarkedIds: Set<string>;
  isBookmarked: (postId: string) => boolean;
  refresh: () => Promise<void>;
  toggleBookmark: (post: SocialPost) => Promise<void>;
};

const SocialBookmarksContext = createContext<SocialBookmarksContextValue | null>(null);

export function SocialBookmarksProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SocialBookmarkRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/social-signals/bookmarks", { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        items?: SocialBookmarkRow[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        if (typeof data.error === "string") toast.error(data.error);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      toast.error("Could not load bookmarks");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/social-signals/bookmarks", { credentials: "include" });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          items?: SocialBookmarkRow[];
        };
        if (!cancelled && res.ok && data.ok && Array.isArray(data.items)) {
          setItems(data.items);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bookmarkedIds = useMemo(() => new Set(items.map((i) => i.post_id)), [items]);

  const isBookmarked = useCallback((postId: string) => bookmarkedIds.has(postId), [bookmarkedIds]);

  const toggleBookmark = useCallback(
    async (post: SocialPost) => {
      const saving = !bookmarkedIds.has(post.id);
      try {
        if (saving) {
          const res = await fetch("/api/social-signals/bookmarks", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ post }),
          });
          const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!res.ok || !data.ok) {
            toast.error(typeof data.error === "string" ? data.error : "Could not save bookmark");
            return;
          }
          toast.success("Saved to Bookmarks");
        } else {
          const res = await fetch(`/api/social-signals/bookmarks?postId=${encodeURIComponent(post.id)}`, {
            method: "DELETE",
            credentials: "include",
          });
          const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!res.ok || !data.ok) {
            toast.error(typeof data.error === "string" ? data.error : "Could not remove bookmark");
            return;
          }
          toast.message("Removed from Bookmarks");
        }
        await refresh();
      } catch {
        toast.error("Network error");
      }
    },
    [bookmarkedIds, refresh],
  );

  const value = useMemo<SocialBookmarksContextValue>(
    () => ({
      items,
      loading,
      bookmarkedIds,
      isBookmarked,
      refresh,
      toggleBookmark,
    }),
    [items, loading, bookmarkedIds, isBookmarked, refresh, toggleBookmark],
  );

  return <SocialBookmarksContext.Provider value={value}>{children}</SocialBookmarksContext.Provider>;
}

export function useSocialBookmarks(): SocialBookmarksContextValue {
  const ctx = useContext(SocialBookmarksContext);
  if (!ctx) {
    throw new Error("useSocialBookmarks must be used within SocialBookmarksProvider");
  }
  return ctx;
}

export function useSocialBookmarksOptional(): SocialBookmarksContextValue | null {
  return useContext(SocialBookmarksContext);
}
