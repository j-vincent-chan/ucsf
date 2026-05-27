"use client";

import { RenderingStatus } from "@/components/rendering-indicator";
import { LinkifiedText } from "@/components/social-signals/linkified-text";
import { PlatformBadge } from "@/components/social-signals/platform-badge";
import { PostEngagementBar } from "@/components/social-signals/post-engagement-bar";
import { useSocialBookmarks } from "@/components/social-signals/social-bookmarks-context";
import type { SocialPost } from "@/lib/social-signals/types";

function parsePost(raw: unknown): SocialPost | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const platform = o.platform === "x" || o.platform === "bluesky" ? o.platform : null;
  if (!id || !platform) return null;
  const authorName = typeof o.authorName === "string" ? o.authorName : "";
  const authorHandle = typeof o.authorHandle === "string" ? o.authorHandle : "";
  const text = typeof o.text === "string" ? o.text : "";
  const url = typeof o.url === "string" ? o.url : "";
  const postedAt = typeof o.postedAt === "string" ? o.postedAt : new Date().toISOString();
  return {
    ...o,
    id,
    platform,
    authorName,
    authorHandle,
    text,
    url,
    postedAt,
  } as SocialPost;
}

/** Saved posts tab — same chrome height feel as Feed `layout="full"`. */
export function SocialBookmarksPanel() {
  const { items, loading } = useSocialBookmarks();

  const cardClass = "p-5 rounded-2xl";
  const avatarClass = "h-14 w-14";
  const avatarFallbackText = "text-sm";
  const authorNameClass = "text-base";
  const metaClass = "text-sm";
  const bodyClass = "text-[15px] leading-relaxed sm:text-base";
  const rowGap = "gap-3.5";

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="shrink-0 border-b border-[color:var(--border)]/45 pb-4">
        <h2 className="text-lg font-semibold text-[color:var(--foreground)]">Bookmarks</h2>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          Posts you save from the live feed. Click the bookmark icon again to remove.
        </p>
      </div>

      {loading ? (
        <RenderingStatus variant="inline" label="Loading bookmarks…" description={null} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--border)]/80 bg-[color:var(--card)]/60 px-6 py-12 text-center">
          <p className="text-sm font-medium text-[color:var(--foreground)]">Nothing saved yet</p>
          <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
            Open <span className="font-semibold">Feed</span> and use the bookmark on a post to save it here.
          </p>
        </div>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {items.map((row) => {
            const p = parsePost(row.post);
            if (!p) return null;
            return (
              <li
                key={row.post_id}
                className={`relative z-0 border border-[color:var(--border)]/55 bg-[color:var(--background)]/90 hover:z-[4] ${cardClass}`}
              >
                <div className={`flex ${rowGap}`}>
                  <div className="relative shrink-0">
                    {p.authorAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.authorAvatarUrl}
                        alt=""
                        className={`${avatarClass} rounded-full border border-[color:var(--border)]/55 object-cover`}
                      />
                    ) : (
                      <div
                        className={`flex ${avatarClass} items-center justify-center rounded-full border border-[color:var(--border)]/55 bg-[color:var(--muted)]/35 font-semibold text-[color:var(--foreground)] ${avatarFallbackText}`}
                      >
                        {p.authorName.trim().charAt(0).toUpperCase() || "?"}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlatformBadge platform={p.platform} size="sm" />
                      <span className={`${authorNameClass} font-semibold text-[color:var(--foreground)]`}>
                        {p.authorName}
                      </span>
                      <span className={`${metaClass} text-[color:var(--muted-foreground)]`}>{p.authorHandle}</span>
                      <span className={`${metaClass} text-[color:var(--muted-foreground)]`}>
                        · {new Date(p.postedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    </div>
                    <p className={`mt-2.5 ${bodyClass}`}>
                      <LinkifiedText
                        text={p.text}
                        className="whitespace-pre-wrap text-[color:var(--foreground)]"
                      />
                    </p>
                    {p.mediaUrls && p.mediaUrls.length > 0 ? (
                      <div
                        className={`mt-3 grid gap-1.5 overflow-hidden rounded-xl border border-[color:var(--border)]/45 bg-black/5 ${
                          p.mediaUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"
                        }`}
                      >
                        {p.mediaUrls.slice(0, 4).map((src, i) => (
                          <div
                            key={`${p.id}-m-${i}`}
                            className="relative aspect-video min-h-[4.5rem] sm:min-h-[7rem]"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt="" className="h-full w-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <PostEngagementBar post={p} textSizeClass={metaClass} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
