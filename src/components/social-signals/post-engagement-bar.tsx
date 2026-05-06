"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { SocialPost } from "@/lib/social-signals/types";
import { BLUESKY_CHAR_LIMIT, X_CHAR_LIMIT } from "@/lib/social-signals/workspace-types";
import { GiphyReplyPicker } from "./giphy-reply-picker";

const REPLY_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
const REPLY_MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

const QUICK_EMOJIS = [
  "😀",
  "😂",
  "🥹",
  "😍",
  "🙏",
  "👍",
  "👏",
  "🔥",
  "✨",
  "❤️",
  "💯",
  "🎉",
  "🧵",
  "📎",
  "🧪",
  "📊",
  "💡",
  "🙌",
  "😮",
  "🤔",
  "😅",
  "✅",
  "⚠️",
  "🔗",
];

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`.replace(/\.0M$/, "M");
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`.replace(/\.0K$/, "K");
  return String(n);
}

function truncateOneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function IconReply({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
      />
    </svg>
  );
}

function IconRepost({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  );
}

function IconHeart({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
      />
    </svg>
  );
}

function IconChart({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  );
}

function IconBookmark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  );
}

function IconShare({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
    </svg>
  );
}

function IconClose({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function IconMedia({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="11" r="1.5" fill="currentColor" stroke="none" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L9 17" />
    </svg>
  );
}

function IconReplyAudience({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M5 12h14" />
    </svg>
  );
}

function IconPoll({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

function IconEmoji({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
    </svg>
  );
}

function IconSchedule({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path strokeLinecap="round" d="M3 10h18M8 3v4M16 3v4M12 14v3l2 1" />
    </svg>
  );
}

type EngageAction = "like" | "repost" | "reply";

const toolbarBtn =
  "rounded-full p-2 text-sky-600 transition-colors hover:bg-sky-500/15 disabled:pointer-events-none disabled:opacity-40 dark:text-sky-400";

export function PostEngagementBar({
  post,
  textSizeClass,
}: {
  post: SocialPost;
  /** Matches feed meta text size (e.g. `text-[13px]`). */
  textSizeClass: string;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyMedia, setReplyMedia] = useState<File | null>(null);
  const [replyGiphyGifUrl, setReplyGiphyGifUrl] = useState<string | null>(null);
  const [replyGiphyPreviewUrl, setReplyGiphyPreviewUrl] = useState<string | null>(null);
  const [giphyPickerOpen, setGiphyPickerOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [busy, setBusy] = useState<EngageAction | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiWrapRef = useRef<HTMLDivElement>(null);

  const replyLimit = post.platform === "x" ? X_CHAR_LIMIT : BLUESKY_CHAR_LIMIT;

  const mediaPreviewUrl = useMemo(() => (replyMedia ? URL.createObjectURL(replyMedia) : null), [replyMedia]);

  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    };
  }, [mediaPreviewUrl]);

  useEffect(() => {
    if (!replyOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (giphyPickerOpen) return;
        setReplyOpen(false);
        setEmojiOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replyOpen, giphyPickerOpen]);

  useEffect(() => {
    if (!emojiOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = emojiWrapRef.current;
      if (el && !el.contains(e.target as Node)) setEmojiOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [emojiOpen]);

  const resetReplyModal = useCallback(() => {
    setReplyDraft("");
    setReplyMedia(null);
    setReplyGiphyGifUrl(null);
    setReplyGiphyPreviewUrl(null);
    setGiphyPickerOpen(false);
    setEmojiOpen(false);
  }, []);

  const share = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ url: post.url });
        return;
      }
      await navigator.clipboard.writeText(post.url);
      toast.success("Link copied");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error("Could not share");
    }
  }, [post.url]);

  const insertEmoji = useCallback((emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setReplyDraft((d) => (d + emoji).slice(0, replyLimit));
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setReplyDraft((d) => {
      const next = d.slice(0, start) + emoji + d.slice(end);
      return next.slice(0, replyLimit);
    });
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
    setEmojiOpen(false);
  }, [replyLimit]);

  const pickReplyImage = useCallback(() => {
    const input = fileInputRef.current;
    if (!input) return;
    input.accept = REPLY_MEDIA_ACCEPT;
    input.click();
  }, []);

  const onReplyFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image or GIF file.");
      return;
    }
    if (file.size > REPLY_MEDIA_MAX_BYTES) {
      toast.error("File must be 5 MB or smaller.");
      return;
    }
    setReplyGiphyGifUrl(null);
    setReplyGiphyPreviewUrl(null);
    setReplyMedia(file);
  }, []);

  const engage = useCallback(
    async (action: EngageAction, text?: string, mediaFile?: File | null, giphyUrl?: string | null) => {
      setBusy(action);
      try {
        const giphy = giphyUrl?.trim() ?? "";
        const useMultipart = action === "reply" && (Boolean(mediaFile) || Boolean(giphy));

        const res = useMultipart
          ? await fetch("/api/social-signals/engage", {
              method: "POST",
              body: (() => {
                const fd = new FormData();
                fd.append("postId", post.id);
                fd.append("action", action);
                fd.append("text", text ?? "");
                if (post.bskyRecordCid) fd.append("bskyRecordCid", post.bskyRecordCid);
                if (mediaFile) fd.append("media", mediaFile);
                if (giphy) fd.append("giphyUrl", giphy);
                return fd;
              })(),
            })
          : await fetch("/api/social-signals/engage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                postId: post.id,
                action,
                ...(text !== undefined ? { text } : {}),
                ...(post.bskyRecordCid ? { bskyRecordCid: post.bskyRecordCid } : {}),
              }),
            });

        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          duplicate?: boolean;
          url?: string;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          toast.error(typeof data.error === "string" ? data.error : "Something went wrong");
          return;
        }
        if (action === "like") {
          toast.success(data.duplicate ? "Already liked" : "Liked");
        } else if (action === "repost") {
          toast.success(data.duplicate ? "Already reposted" : "Reposted");
        } else {
          toast.success("Reply posted", {
            description: data.url ? (
              <a href={data.url} target="_blank" rel="noopener noreferrer" className="underline">
                Open post
              </a>
            ) : undefined,
          });
          setReplyOpen(false);
          resetReplyModal();
        }
      } catch {
        toast.error("Network error");
      } finally {
        setBusy(null);
      }
    },
    [post.bskyRecordCid, post.id, resetReplyModal],
  );

  const rc = post.replyCount;
  const rpc = post.repostCount;
  const lc = post.likeCount;
  const vc = post.viewCount;

  const countSlot = (n: number | undefined) =>
    n !== undefined && Number.isFinite(n) ? (
      <span className="min-w-[1.25rem] tabular-nums">{formatCompact(n)}</span>
    ) : null;

  const btnClass =
    "inline-flex items-center gap-1.5 rounded-md py-1 text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)] disabled:pointer-events-none disabled:opacity-50";

  const attachmentPreviewSrc = replyGiphyPreviewUrl ?? mediaPreviewUrl;
  const canSubmitReply = Boolean(replyDraft.trim() || replyMedia || replyGiphyGifUrl);
  const originalSnippet = truncateOneLine(post.text, 140);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={onReplyFileChange}
      />

      <div
        className={`mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-2 text-[color:var(--muted-foreground)] ${textSizeClass}`}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 sm:gap-x-5">
          <button
            type="button"
            className={btnClass}
            title="Reply"
            disabled={busy !== null}
            onClick={() => {
              resetReplyModal();
              setReplyOpen(true);
            }}
          >
            <IconReply className="shrink-0 opacity-90" />
            {countSlot(rc)}
          </button>
          <button
            type="button"
            className={btnClass}
            title="Repost"
            disabled={busy !== null}
            onClick={() => void engage("repost")}
          >
            <IconRepost className={`shrink-0 opacity-90 ${busy === "repost" ? "animate-pulse" : ""}`} />
            {countSlot(rpc)}
          </button>
          <button
            type="button"
            className={btnClass}
            title="Like"
            disabled={busy !== null}
            onClick={() => void engage("like")}
          >
            <IconHeart className={`shrink-0 opacity-90 ${busy === "like" ? "animate-pulse" : ""}`} />
            {countSlot(lc)}
          </button>
          <span
            className="inline-flex items-center gap-1.5 py-1 text-[color:var(--muted-foreground)]"
            title="Views"
          >
            <IconChart className="shrink-0 opacity-90" aria-hidden />
            {countSlot(vc)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          <button
            type="button"
            className="rounded-md p-1 text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)]"
            title="Bookmarks live in the X or Bluesky app"
            aria-label="Save"
            onClick={() =>
              toast.message("Bookmarks are available when you open this post in X or Bluesky.", {
                duration: 3500,
              })
            }
          >
            <IconBookmark />
          </button>
          <button
            type="button"
            onClick={() => void share()}
            className="rounded-md p-1 text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)]"
            title="Share"
            aria-label="Share or copy link"
          >
            <IconShare />
          </button>
        </div>
      </div>

      {replyOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 backdrop-blur-[2px] sm:items-center"
          role="dialog"
          aria-modal
          aria-labelledby="reply-dialog-title"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close reply dialog"
            onClick={() => {
              setReplyOpen(false);
              resetReplyModal();
            }}
          />
          <div className="relative z-[1] w-full max-w-lg overflow-hidden rounded-2xl border border-[color:var(--border)]/80 bg-[color:var(--background)] shadow-[0_0_60px_-20px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between border-b border-[color:var(--border)]/60 px-3 py-2">
              <button
                type="button"
                className="rounded-full p-2 text-[color:var(--foreground)] hover:bg-[color:var(--muted)]/25"
                aria-label="Close"
                onClick={() => {
                  setReplyOpen(false);
                  resetReplyModal();
                }}
              >
                <IconClose />
              </button>
              <span id="reply-dialog-title" className="sr-only">
                Reply to post
              </span>
              <button
                type="button"
                className="text-sm font-medium text-sky-600 hover:underline dark:text-sky-400"
                onClick={() => toast.message("Draft replies aren’t saved in Signal yet.")}
              >
                Drafts
              </button>
            </div>

            <div className="px-4 pb-4 pt-3">
              <p className="text-[13px] text-sky-600 dark:text-sky-400">
                Replying to{" "}
                <span className="font-medium">{post.authorHandle || post.authorName}</span>
              </p>
              <p className="mt-1 border-l-2 border-[color:var(--border)] pl-3 text-[13px] text-[color:var(--muted-foreground)]">
                {originalSnippet || "…"}
              </p>

              <textarea
                ref={textareaRef}
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value.slice(0, replyLimit))}
                maxLength={replyLimit}
                rows={5}
                placeholder={post.platform === "x" ? "Post your reply" : "Write your reply…"}
                className="mt-3 w-full resize-y rounded-xl border-0 bg-transparent px-0 py-1 text-[15px] leading-relaxed text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-0"
              />

              {attachmentPreviewSrc ? (
                <div className="relative mt-2 overflow-hidden rounded-xl border border-[color:var(--border)]/80">
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob or GIPHY preview */}
                  <img src={attachmentPreviewSrc} alt="" className="max-h-48 w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-sky-500 shadow-sm ring-2 ring-[color:var(--background)] hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-500"
                    aria-label="Remove attachment"
                    onClick={() => {
                      setReplyMedia(null);
                      setReplyGiphyGifUrl(null);
                      setReplyGiphyPreviewUrl(null);
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path stroke="white" strokeWidth="2.25" strokeLinecap="round" d="M7 12h10" />
                    </svg>
                  </button>
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap items-end justify-between gap-3 border-t border-[color:var(--border)]/50 pt-3">
                <div className="flex flex-wrap items-center gap-0.5">
                  <button
                    type="button"
                    className={toolbarBtn}
                    title="Add photos or video"
                    aria-label="Add media"
                    disabled={busy !== null}
                    onClick={() => pickReplyImage()}
                  >
                    <IconMedia />
                  </button>
                  <button
                    type="button"
                    className={`${toolbarBtn} font-bold`}
                    title="Search GIPHY"
                    aria-label="Search GIPHY for a GIF"
                    disabled={busy !== null}
                    onClick={() => setGiphyPickerOpen(true)}
                  >
                    <span className="flex h-6 min-w-[2rem] items-center justify-center rounded border border-current px-1 text-[10px] leading-none">
                      GIF
                    </span>
                  </button>
                  <button
                    type="button"
                    className={toolbarBtn}
                    title="Who can reply"
                    aria-label="Reply audience"
                    disabled={busy !== null}
                    onClick={() =>
                      toast.message("Who can reply isn’t configurable from Signal yet — it follows X or Bluesky defaults.")
                    }
                  >
                    <IconReplyAudience />
                  </button>
                  <button
                    type="button"
                    className={toolbarBtn}
                    title="Poll"
                    aria-label="Add poll"
                    disabled={busy !== null}
                    onClick={() => toast.message("Polls aren’t supported in Signal replies yet.")}
                  >
                    <IconPoll />
                  </button>
                  <div className="relative" ref={emojiWrapRef}>
                    <button
                      type="button"
                      className={toolbarBtn}
                      title="Emoji"
                      aria-label="Emoji"
                      aria-expanded={emojiOpen}
                      disabled={busy !== null}
                      onClick={() => setEmojiOpen((o) => !o)}
                    >
                      <IconEmoji />
                    </button>
                    {emojiOpen ? (
                      <div
                        className="absolute bottom-full left-0 z-10 mb-2 w-[min(100vw-3rem,280px)] rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--card)] p-2 shadow-lg"
                        role="listbox"
                        aria-label="Quick emoji"
                      >
                        <div className="grid grid-cols-8 gap-1">
                          {QUICK_EMOJIS.map((em) => (
                            <button
                              key={em}
                              type="button"
                              className="flex h-9 items-center justify-center rounded-lg text-lg hover:bg-[color:var(--muted)]/30"
                              onClick={() => insertEmoji(em)}
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={toolbarBtn}
                    title="Schedule"
                    aria-label="Schedule post"
                    disabled={busy !== null}
                    onClick={() => toast.message("Scheduled replies aren’t available in Signal yet.")}
                  >
                    <IconSchedule />
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs tabular-nums text-[color:var(--muted-foreground)]">
                    {replyDraft.length}/{replyLimit}
                  </span>
                  <button
                    type="button"
                    className="rounded-full bg-[color:var(--foreground)] px-4 py-1.5 text-sm font-bold text-[color:var(--background)] disabled:opacity-40"
                    disabled={busy !== null || !canSubmitReply}
                    onClick={() => void engage("reply", replyDraft, replyMedia, replyGiphyGifUrl)}
                  >
                    {busy === "reply" ? "Posting…" : "Reply"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <GiphyReplyPicker
        open={giphyPickerOpen && replyOpen}
        onClose={() => setGiphyPickerOpen(false)}
        onPick={({ gifUrl, previewUrl }) => {
          setReplyMedia(null);
          setReplyGiphyGifUrl(gifUrl);
          setReplyGiphyPreviewUrl(previewUrl);
        }}
      />
    </>
  );
}
