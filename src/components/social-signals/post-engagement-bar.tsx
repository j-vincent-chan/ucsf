"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { SocialPost } from "@/lib/social-signals/types";
import { useSocialBookmarksOptional } from "@/components/social-signals/social-bookmarks-context";
import { BLUESKY_CHAR_LIMIT, X_CHAR_LIMIT } from "@/lib/social-signals/workspace-types";
import { GiphyReplyPicker } from "./giphy-reply-picker";
import { EmojiTabPicker } from "./emoji-tab-picker";
import { LinkifiedText } from "./linkified-text";
import { PlatformBadge } from "./platform-badge";

const REPLY_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
const REPLY_MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`.replace(/\.0M$/, "M");
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`.replace(/\.0K$/, "K");
  return String(n);
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

function IconHeart({ className = "", filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
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

function IconBookmark({ className = "", filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
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

function IconOpenExternal({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
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

type BurstKind = "like" | "repost";

function BurstParticles({ kind }: { kind: BurstKind }) {
  const dot =
    kind === "like"
      ? "bg-white shadow-[0_0_4px_rgba(244,63,94,0.85)]"
      : "bg-white shadow-[0_0_4px_rgba(16,185,129,0.85)]";
  return (
    <>
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={`engage-burst-particle pointer-events-none absolute left-1/2 top-1/2 h-[3px] w-[3px] rounded-full ${dot}`}
          style={{ "--a": `${i * 36}deg` } as React.CSSProperties}
        />
      ))}
    </>
  );
}

const toolbarBtn =
  "rounded-full p-2 text-sky-600 transition-colors hover:bg-sky-500/15 disabled:pointer-events-none disabled:opacity-40 dark:text-sky-400";

export function PostEngagementBar({
  post,
  textSizeClass,
  replyComposerAvatarUrl,
  dense = false,
}: {
  post: SocialPost;
  /** Matches feed meta text size (e.g. `text-[13px]`). */
  textSizeClass: string;
  /** Connected account avatar for the reply row (X or Bluesky), when known. */
  replyComposerAvatarUrl?: string;
  /** Smaller icons (~15%) for compact feed density; spacing unchanged. */
  dense?: boolean;
}) {
  const socialBookmarks = useSocialBookmarksOptional();
  const bookmarkedHere = Boolean(socialBookmarks?.isBookmarked(post.id));

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyMedia, setReplyMedia] = useState<File | null>(null);
  const [replyGifUrl, setReplyGifUrl] = useState<string | null>(null);
  const [replyGifPreviewUrl, setReplyGifPreviewUrl] = useState<string | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [busy, setBusy] = useState<EngageAction | null>(null);
  const [reposted, setReposted] = useState(() => Boolean(post.viewerReposted));
  /** Live Bluesky repost record URI (session + feed); used for fast undo. */
  const [bskyRepostUri, setBskyRepostUri] = useState<string | undefined>(() => post.bskyViewerRepostUri);
  const [liked, setLiked] = useState(() => Boolean(post.viewerLiked));
  const [bskyLikeUri, setBskyLikeUri] = useState<string | undefined>(() => post.bskyViewerLikeUri);
  const [burstKind, setBurstKind] = useState<BurstKind | null>(null);
  const [likePop, setLikePop] = useState(0);
  const [repostPop, setRepostPop] = useState(0);

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
        if (gifPickerOpen) return;
        setReplyOpen(false);
        setEmojiOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replyOpen, gifPickerOpen]);

  useEffect(() => {
    if (!emojiOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = emojiWrapRef.current;
      if (el && !el.contains(e.target as Node)) setEmojiOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [emojiOpen]);

  useEffect(() => {
    setReposted(Boolean(post.viewerReposted));
    setBskyRepostUri(post.bskyViewerRepostUri);
  }, [post.id, post.viewerReposted, post.bskyViewerRepostUri]);

  useEffect(() => {
    setLiked(Boolean(post.viewerLiked));
    setBskyLikeUri(post.bskyViewerLikeUri);
  }, [post.id, post.viewerLiked, post.bskyViewerLikeUri]);

  useEffect(() => {
    if (!burstKind) return;
    const t = window.setTimeout(() => setBurstKind(null), 480);
    return () => window.clearTimeout(t);
  }, [burstKind]);

  const fireEngageFx = useCallback((kind: BurstKind) => {
    setBurstKind(kind);
    if (kind === "like") setLikePop((n) => n + 1);
    else setRepostPop((n) => n + 1);
  }, []);

  const resetReplyModal = useCallback(() => {
    setReplyDraft("");
    setReplyMedia(null);
    setReplyGifUrl(null);
    setReplyGifPreviewUrl(null);
    setGifPickerOpen(false);
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
    setReplyGifUrl(null);
    setReplyGifPreviewUrl(null);
    setReplyMedia(file);
  }, []);

  const engage = useCallback(
    async (action: EngageAction, text?: string, mediaFile?: File | null, pickedGifUrl?: string | null) => {
      setBusy(action);
      try {
        const gif = pickedGifUrl?.trim() ?? "";
        const useMultipart = action === "reply" && (Boolean(mediaFile) || Boolean(gif));

        const res = useMultipart
          ? await fetch("/api/social-signals/engage", {
              method: "POST",
              credentials: "include",
              body: (() => {
                const fd = new FormData();
                fd.append("postId", post.id);
                fd.append("action", action);
                fd.append("text", text ?? "");
                if (post.bskyRecordCid) fd.append("bskyRecordCid", post.bskyRecordCid);
                if (mediaFile) fd.append("media", mediaFile);
                if (gif) fd.append("gifUrl", gif);
                return fd;
              })(),
            })
          : await fetch("/api/social-signals/engage", {
              method: "POST",
              credentials: "include",
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
        if (action === "reply") {
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

  const toggleRepost = useCallback(async () => {
    const undo = reposted;
    setBusy("repost");
    try {
      const body: Record<string, unknown> = {
        postId: post.id,
        action: "repost",
        undo,
        ...(post.bskyRecordCid ? { bskyRecordCid: post.bskyRecordCid } : {}),
      };
      const hintUri = bskyRepostUri ?? post.bskyViewerRepostUri;
      if (undo && hintUri?.startsWith("at://")) {
        body.bskyRepostUri = hintUri;
      }

      const res = await fetch("/api/social-signals/engage", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        duplicate?: boolean;
        reposted?: boolean;
        repostRecordUri?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Something went wrong");
        return;
      }

      if (undo) {
        setReposted(false);
        setBskyRepostUri(undefined);
        toast.success("Repost removed");
        return;
      }

      setReposted(true);
      if (typeof data.repostRecordUri === "string") {
        setBskyRepostUri(data.repostRecordUri);
      }
      if (data.duplicate) {
        toast.message("Already boosting this post");
      } else {
        toast.success("Reposted");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setBusy(null);
    }
  }, [
    bskyRepostUri,
    post.bskyRecordCid,
    post.bskyViewerRepostUri,
    post.id,
    reposted,
  ]);

  const toggleLike = useCallback(async () => {
    const undo = liked;
    setBusy("like");
    try {
      const body: Record<string, unknown> = {
        postId: post.id,
        action: "like",
        undo,
        ...(post.bskyRecordCid ? { bskyRecordCid: post.bskyRecordCid } : {}),
      };
      const hintUri = bskyLikeUri ?? post.bskyViewerLikeUri;
      if (undo && hintUri?.startsWith("at://")) {
        body.bskyLikeUri = hintUri;
      }

      const res = await fetch("/api/social-signals/engage", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        duplicate?: boolean;
        liked?: boolean;
        likeRecordUri?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Something went wrong");
        return;
      }
      if (undo) {
        setLiked(false);
        setBskyLikeUri(undefined);
        toast.success("Like removed");
        return;
      }
      setLiked(true);
      if (typeof data.likeRecordUri === "string") {
        setBskyLikeUri(data.likeRecordUri);
      }
      if (data.duplicate) {
        toast.message("Already liked");
      } else {
        toast.success("Liked");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setBusy(null);
    }
  }, [bskyLikeUri, liked, post.bskyRecordCid, post.bskyViewerLikeUri, post.id]);

  const rc = post.replyCount;
  const rpc = post.repostCount;
  const lc = post.likeCount;
  const vc = post.viewCount;

  const countSlot = (n: number | undefined) =>
    n !== undefined && Number.isFinite(n) ? (
      <span className="min-w-0 max-w-full truncate tabular-nums">{formatCompact(n)}</span>
    ) : null;

  const engageTooltipCn =
    "pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900/95 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg ring-1 ring-black/15 transition-opacity duration-150 group-hover:opacity-100 dark:bg-neutral-950/98 dark:ring-white/12";

  const engageHitCn =
    "group relative inline-flex items-center gap-0.5 rounded-full px-1 py-0.5 transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/35 sm:gap-1 sm:px-1.5 sm:py-1";

  const iconBoxCn = dense
    ? "relative flex h-5 w-5 shrink-0 items-center justify-center sm:h-6 sm:w-6"
    : "relative flex h-6 w-6 shrink-0 items-center justify-center sm:h-7 sm:w-7";
  const iconCn = dense ? "h-[13px] w-[13px] sm:h-[14px] sm:w-[14px]" : "h-[15px] w-[15px] sm:h-4 sm:w-4";

  const attachmentPreviewSrc = replyGifPreviewUrl ?? mediaPreviewUrl;
  const canSubmitReply = Boolean(replyDraft.trim() || replyMedia || replyGifUrl);
  const replyToLabel = (() => {
    const h = post.authorHandle?.trim() || post.authorName.trim();
    if (!h) return "@…";
    return h.startsWith("@") ? h : `@${h}`;
  })();

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
        className={`mt-3 flex w-full min-w-0 max-w-full items-center gap-1 text-[color:var(--muted-foreground)] sm:gap-2 ${textSizeClass}`}
      >
        <div className="grid min-w-0 flex-1 grid-cols-4 items-center gap-x-0">
          <div className="flex min-w-0 justify-center">
          <button
            type="button"
            className={`${engageHitCn} w-full max-w-full min-w-0 justify-center text-[color:var(--muted-foreground)] hover:bg-sky-500/14 hover:text-sky-500 dark:hover:text-sky-400`}
            aria-label="Reply"
            disabled={busy !== null}
            onClick={() => {
              resetReplyModal();
              setReplyOpen(true);
            }}
          >
            <span className="relative inline-flex min-w-0 max-w-full items-center gap-0.5 overflow-hidden sm:gap-1">
              <span className={iconBoxCn}>
                <IconReply className={`${iconCn} shrink-0 ${busy !== null ? "opacity-50" : ""}`} />
              </span>
              {countSlot(rc)}
            </span>
            <span className={engageTooltipCn} role="tooltip">
              Reply
            </span>
          </button>
          </div>
          <div className="flex min-w-0 justify-center">
          <button
            type="button"
            className={`${engageHitCn} w-full max-w-full min-w-0 justify-center ${
              reposted
                ? "text-emerald-600 hover:bg-emerald-500/18 dark:text-emerald-400"
                : "text-[color:var(--muted-foreground)] hover:bg-emerald-500/12 hover:text-emerald-600 dark:hover:text-emerald-400"
            }`}
            aria-label={reposted ? "Undo repost" : "Repost"}
            aria-pressed={reposted}
            disabled={busy !== null}
            onClick={() => {
              if (!reposted) fireEngageFx("repost");
              void toggleRepost();
            }}
          >
            <span className="relative inline-flex min-w-0 max-w-full items-center gap-0.5 overflow-hidden sm:gap-1">
              <span className={iconBoxCn}>
                {burstKind === "repost" ? <BurstParticles kind="repost" /> : null}
                <span
                  key={repostPop}
                  className={`inline-flex ${
                    busy === "repost" ? "animate-pulse" : repostPop > 0 ? "engage-icon-pop" : ""
                  }`}
                >
                  <IconRepost className={`${iconCn} shrink-0`} />
                </span>
              </span>
              <span
                className={
                  reposted ? "min-w-0 text-emerald-600 dark:text-emerald-400" : "min-w-0 text-[color:var(--muted-foreground)]"
                }
              >
                {countSlot(rpc)}
              </span>
            </span>
            <span className={engageTooltipCn} role="tooltip">
              {reposted ? "Undo repost" : "Repost"}
            </span>
          </button>
          </div>
          <div className="flex min-w-0 justify-center">
          <button
            type="button"
            className={`${engageHitCn} w-full max-w-full min-w-0 justify-center ${
              liked
                ? "text-rose-500 hover:bg-rose-500/18 dark:text-rose-400"
                : "text-[color:var(--muted-foreground)] hover:bg-rose-500/12 hover:text-rose-500 dark:hover:text-rose-400"
            }`}
            aria-label={liked ? "Unlike" : "Like"}
            aria-pressed={liked}
            disabled={busy !== null}
            onClick={() => {
              if (!liked) fireEngageFx("like");
              void toggleLike();
            }}
          >
            <span className="relative inline-flex min-w-0 max-w-full items-center gap-0.5 overflow-hidden sm:gap-1">
              <span className={iconBoxCn}>
                {burstKind === "like" ? <BurstParticles kind="like" /> : null}
                <span
                  key={likePop}
                  className={`inline-flex ${
                    busy === "like" ? "animate-pulse" : likePop > 0 ? "engage-icon-pop" : ""
                  }`}
                >
                  <IconHeart className={`${iconCn} shrink-0`} filled={liked} />
                </span>
              </span>
              <span className={`min-w-0 ${liked ? "text-rose-500 dark:text-rose-400" : ""}`}>{countSlot(lc)}</span>
            </span>
            <span className={engageTooltipCn} role="tooltip">
              {liked ? "Unlike" : "Like"}
            </span>
          </button>
          </div>
          <div className="flex min-w-0 justify-center">
          <span className="group relative inline-flex w-full max-w-full min-w-0 items-center justify-center gap-0.5 overflow-hidden rounded-full px-1 py-0.5 text-[color:var(--muted-foreground)] transition-colors duration-150 hover:bg-[color:var(--muted)]/22 hover:text-[color:var(--foreground)] sm:gap-1 sm:px-1.5 sm:py-1">
            <span className={iconBoxCn}>
              <IconChart className={`${iconCn} shrink-0`} aria-hidden />
            </span>
            <span className="min-w-0">{countSlot(vc)}</span>
            <span className={engageTooltipCn} role="tooltip">
              Views
            </span>
          </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0">
          <button
            type="button"
            className={`${engageHitCn} inline-flex max-w-none min-w-0 shrink-0 justify-center rounded-md py-px ${
              bookmarkedHere
                ? "text-violet-600 hover:bg-violet-500/16 dark:text-violet-400"
                : "text-[color:var(--muted-foreground)] hover:bg-violet-500/12 hover:text-violet-600 dark:hover:text-violet-400"
            }`}
            aria-label={bookmarkedHere ? "Remove bookmark" : "Save to Bookmarks"}
            aria-pressed={bookmarkedHere}
            onClick={() => {
              if (socialBookmarks) {
                void socialBookmarks.toggleBookmark(post);
              } else {
                toast.message("Bookmarks are unavailable here — open Social Signals.", { duration: 3500 });
              }
            }}
          >
            <span className={iconBoxCn}>
              <IconBookmark className={`${iconCn} shrink-0`} filled={bookmarkedHere} />
            </span>
            <span className={engageTooltipCn} role="tooltip">
              {bookmarkedHere ? "Remove from Bookmarks" : "Save to Bookmarks"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => void share()}
            className={`${engageHitCn} inline-flex max-w-none min-w-0 shrink-0 justify-center rounded-md py-px text-[color:var(--muted-foreground)] hover:bg-sky-500/12 hover:text-sky-600 dark:hover:text-sky-400`}
            aria-label="Share or copy link"
          >
            <span className={iconBoxCn}>
              <IconShare className={`${iconCn} shrink-0`} />
            </span>
            <span className={engageTooltipCn} role="tooltip">
              Share
            </span>
          </button>
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${engageHitCn} inline-flex max-w-none min-w-0 shrink-0 justify-center rounded-md py-px text-[color:var(--muted-foreground)] hover:bg-sky-500/12 hover:text-sky-600 dark:hover:text-sky-400`}
            aria-label={`Open post on ${post.platform === "x" ? "X" : "Bluesky"}`}
          >
            <span className={iconBoxCn}>
              <IconOpenExternal className={`${iconCn} shrink-0`} />
            </span>
            <span className={engageTooltipCn} role="tooltip">
              Open post
            </span>
          </a>
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
          <div className="relative z-[1] w-full max-w-xl rounded-2xl border border-[color:var(--border)]/80 bg-[color:var(--background)] shadow-[0_0_60px_-20px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between border-b border-[color:var(--border)]/50 px-4 py-3 sm:px-5">
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
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-sky-600 hover:bg-sky-500/10 dark:text-sky-400"
                onClick={() => toast.message("Draft replies aren’t saved in Signal yet.")}
              >
                Drafts
              </button>
            </div>

            <div className="px-4 pb-6 pt-5 sm:px-6 sm:pb-7 sm:pt-6">
              <div className="flex gap-3 sm:gap-5">
                <div className="flex w-11 shrink-0 flex-col items-center self-stretch sm:w-[3.25rem]">
                  <div className="relative z-[1] shrink-0">
                    {post.authorAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.authorAvatarUrl}
                        alt=""
                        className="h-11 w-11 rounded-full border border-[color:var(--border)]/50 object-cover sm:h-12 sm:w-12"
                      />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--border)]/50 bg-[color:var(--muted)]/35 text-sm font-semibold text-[color:var(--foreground)] sm:h-12 sm:w-12">
                        {post.authorName.trim().charAt(0).toUpperCase() || "?"}
                      </div>
                    )}
                  </div>
                  <div className="flex w-full flex-1 flex-col items-center py-3" aria-hidden>
                    <div className="mx-auto h-full min-h-[2.5rem] w-px flex-1 bg-[color:var(--border)]/80 dark:bg-neutral-600/90" />
                  </div>
                </div>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <section
                    aria-label="Original post"
                    className="rounded-2xl bg-[color:var(--card)]/55 px-3.5 py-3.5 ring-1 ring-[color:var(--border)]/35 sm:px-4 sm:py-4"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <PlatformBadge platform={post.platform} size="sm" />
                      <span className="text-[15px] font-bold leading-tight text-[color:var(--foreground)]">{post.authorName}</span>
                      <span className="text-[14px] font-medium leading-tight text-[color:var(--muted-foreground)]">{post.authorHandle}</span>
                      <span className="w-full text-[13px] leading-tight text-[color:var(--muted-foreground)] sm:w-auto sm:pl-1">
                        {new Date(post.postedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    </div>
                    <div className="mt-3 max-h-[min(38vh,17.5rem)] overflow-y-auto overscroll-contain pr-0.5">
                      <p className="text-[16px] leading-[1.6] sm:text-[17px] sm:leading-[1.55]">
                        <LinkifiedText
                          text={post.text || "…"}
                          className="whitespace-pre-wrap break-words text-[color:var(--foreground)]"
                        />
                      </p>
                    </div>
                  </section>

                  <div className="my-5 h-px w-full shrink-0 bg-[color:var(--border)]/50" aria-hidden />

                  <div className="flex items-center gap-2.5">
                    <div className="relative z-[1] shrink-0" aria-hidden>
                      {replyComposerAvatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={replyComposerAvatarUrl}
                          alt=""
                          className="h-9 w-9 rounded-full border border-[color:var(--border)]/50 object-cover ring-[3px] ring-[color:var(--background)] sm:h-10 sm:w-10"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)]/50 bg-[color:var(--muted)]/35 text-[9px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)] ring-[3px] ring-[color:var(--background)] sm:h-10 sm:w-10 sm:text-[10px]">
                          You
                        </div>
                      )}
                    </div>
                    <p className="min-w-0 flex-1 text-[13px] leading-snug text-[color:var(--muted-foreground)]">
                      Replying to <span className="font-semibold text-sky-600 dark:text-sky-400">{replyToLabel}</span>
                    </p>
                  </div>

                  <div className="mt-4 space-y-3">
                    <textarea
                      ref={textareaRef}
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value.slice(0, replyLimit))}
                      maxLength={replyLimit}
                      rows={5}
                      placeholder={post.platform === "x" ? "Post your reply" : "Write your reply…"}
                      className="min-h-[6.5rem] w-full resize-y rounded-xl border border-transparent bg-[color:var(--muted)]/14 px-3 py-3 text-[16px] leading-[1.55] text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)]/85 focus:border-[color:var(--border)]/60 focus:outline-none focus:ring-1 focus:ring-[color:var(--border)]/40 sm:text-[17px]"
                    />

                    {attachmentPreviewSrc ? (
                      <div className="relative overflow-hidden rounded-xl border border-[color:var(--border)]/80">
                        {/* eslint-disable-next-line @next/next/no-img-element -- blob or GIF picker preview */}
                        <img src={attachmentPreviewSrc} alt="" className="max-h-48 w-full object-cover" />
                        <button
                          type="button"
                          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-sky-500 shadow-sm ring-2 ring-[color:var(--background)] hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-500"
                          aria-label="Remove attachment"
                          onClick={() => {
                            setReplyMedia(null);
                            setReplyGifUrl(null);
                            setReplyGifPreviewUrl(null);
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path stroke="white" strokeWidth="2.25" strokeLinecap="round" d="M7 12h10" />
                          </svg>
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-[color:var(--border)]/55 pt-4">
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
                        title="Search GIFs (Klipy)"
                        aria-label="Search Klipy for a GIF"
                        disabled={busy !== null}
                        onClick={() => setGifPickerOpen(true)}
                      >
                        <span className="flex h-6 min-w-[2rem] items-center justify-center rounded border border-current px-1 text-[10px] leading-none">
                          GIF
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`${toolbarBtn} opacity-40`}
                        title="Polls are only available on new posts in the Composer (X does not support poll replies)"
                        aria-label="Poll (not available on replies)"
                        disabled
                      >
                        <IconPoll />
                      </button>
                      <div className="relative z-20" ref={emojiWrapRef}>
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
                          <EmojiTabPicker open={emojiOpen} onPick={(em) => insertEmoji(em)} />
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

                    <div className="ml-auto flex items-center gap-3 sm:ml-0">
                      <span className="text-sm tabular-nums text-[color:var(--muted-foreground)]">
                        {replyDraft.length}/{replyLimit}
                      </span>
                      <button
                        type="button"
                        className="rounded-full bg-sky-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:bg-[color:var(--muted)] disabled:text-[color:var(--muted-foreground)] disabled:opacity-70 dark:bg-sky-500"
                        disabled={busy !== null || !canSubmitReply}
                        onClick={() => void engage("reply", replyDraft, replyMedia, replyGifUrl)}
                      >
                        {busy === "reply" ? "Posting…" : "Reply"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <GiphyReplyPicker
        open={gifPickerOpen && replyOpen}
        onClose={() => setGifPickerOpen(false)}
        onPick={({ gifUrl, previewUrl }) => {
          setReplyMedia(null);
          setReplyGifUrl(gifUrl);
          setReplyGifPreviewUrl(previewUrl);
        }}
      />
    </>
  );
}
