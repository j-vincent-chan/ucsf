"use client";

import { useCallback, useState } from "react";
import type { SocialFeedTab, SocialPost } from "@/lib/social-signals/types";
import { PlatformBadge } from "./platform-badge";

export function LiveListeningFeed({
  initialTab,
  initialPosts,
}: {
  initialTab: SocialFeedTab;
  initialPosts: SocialPost[];
}) {
  const [tab, setTab] = useState<SocialFeedTab>(initialTab);
  const [posts, setPosts] = useState<SocialPost[]>(initialPosts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (next: SocialFeedTab) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/social-signals?tab=${next}`, { method: "GET" });
      const data = (await res.json()) as { posts?: SocialPost[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setPosts(data.posts ?? []);
      setTab(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  function tabBtn(active: boolean) {
    return active
      ? "rounded-lg bg-[color:var(--muted)] px-3 py-1.5 text-xs font-semibold text-[color:var(--foreground)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_80%,white)]"
      : "rounded-lg px-3 py-1.5 text-xs font-medium text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/50 hover:text-[color:var(--foreground)]";
  }

  return (
    <section className="rounded-2xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/88 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
            Live listening
          </p>
          <p className="mt-0.5 text-xs text-[color:var(--muted-foreground)]">
            Real posts from your configured X list or Bluesky home timeline (Following), or mentions (Mentions).
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void refresh(tab)}
          className="rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)]/95 px-3 py-1.5 text-xs font-semibold text-[color:var(--foreground)] disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Listening feed">
        <button type="button" role="tab" aria-selected={tab === "following"} className={tabBtn(tab === "following")} onClick={() => void refresh("following")}>
          Following
        </button>
        <button type="button" role="tab" aria-selected={tab === "mentions"} className={tabBtn(tab === "mentions")} onClick={() => void refresh("mentions")}>
          Mentions
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-200">{error}</p>
      ) : null}

      <ul className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
        {posts.length === 0 ? (
          <li className="rounded-xl border border-dashed border-[color:var(--border)]/70 px-4 py-8 text-center text-sm text-[color:var(--muted-foreground)]">
            No live posts for this tab. Check connections above or try Mentions / Following.
          </li>
        ) : (
          posts.map((p) => (
            <li key={p.id} className="rounded-xl border border-[color:var(--border)]/55 bg-[color:var(--background)]/90 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <PlatformBadge platform={p.platform} size="xs" />
                <span className="text-sm font-medium text-[color:var(--foreground)]">{p.authorName}</span>
                <span className="text-xs text-[color:var(--muted-foreground)]">{p.authorHandle}</span>
                <span className="text-xs text-[color:var(--muted-foreground)]">
                  · {new Date(p.postedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--foreground)]">{p.text}</p>
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs font-medium text-[color:var(--foreground)] underline underline-offset-4"
              >
                Open post
              </a>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
