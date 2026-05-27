"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { PublishPlatform } from "@/lib/social-signals/workspace-types";
import { BLUESKY_CHAR_LIMIT, X_CHAR_LIMIT } from "@/lib/social-signals/workspace-types";
import { WorkspaceHandleAvatarImg, type WorkspaceAccountAvatars } from "@/components/workspace-handle-avatar-img";
import { emptyPollDraft, validateSocialPoll, type SocialPollDraft } from "@/lib/social-poll";
import { EmojiTabPicker } from "./emoji-tab-picker";
import { GiphyReplyPicker } from "./giphy-reply-picker";
import { PollComposerPanel } from "./poll-composer-panel";
import { PlatformBadge } from "./platform-badge";

const COMPOSER_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
const COMPOSER_MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

const composerToolbarIcon =
  "rounded-full p-2 text-sky-600 transition-colors hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-40 dark:text-sky-400";

function IconClose({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
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

export function SocialComposerDrawer({
  open,
  onClose,
  initialPlatform = "bluesky",
  accounts,
  onOpenDrafts,
}: {
  open: boolean;
  onClose: () => void;
  initialPlatform?: PublishPlatform;
  /** Connected X / Bluesky profile avatars — composer shows X first for simplicity. */
  accounts?: WorkspaceAccountAvatars | null;
  /** Jump to Scheduler queue (drafts). */
  onOpenDrafts?: () => void;
}) {
  const [postToX, setPostToX] = useState(initialPlatform === "x");
  const [postToBluesky, setPostToBluesky] = useState(initialPlatform !== "x");
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [gifPreviewUrl, setGifPreviewUrl] = useState<string | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pollDraft, setPollDraft] = useState<SocialPollDraft | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiWrapRef = useRef<HTMLDivElement>(null);

  const effectivePostToX = postToX;
  const effectivePostToBluesky = postToBluesky;
  const postingToBoth = effectivePostToX && effectivePostToBluesky;
  const postingToNone = !effectivePostToX && !effectivePostToBluesky;
  const hasAttachment = Boolean(mediaFile || gifUrl);
  const hasPoll = pollDraft != null;
  const pollValid = useMemo(
    () => (pollDraft ? validateSocialPoll(pollDraft).ok : false),
    [pollDraft],
  );
  const overX = effectivePostToX ? text.length > X_CHAR_LIMIT : false;
  const overBluesky = effectivePostToBluesky ? text.length > BLUESKY_CHAR_LIMIT : false;
  const overAny = overX || overBluesky;

  const charLimit = useMemo(() => {
    if (postingToNone) return X_CHAR_LIMIT;
    if (postingToBoth) return Math.min(X_CHAR_LIMIT, BLUESKY_CHAR_LIMIT);
    return effectivePostToX ? X_CHAR_LIMIT : BLUESKY_CHAR_LIMIT;
  }, [postingToNone, postingToBoth, effectivePostToX]);

  const mediaPreviewUrl = useMemo(() => (mediaFile ? URL.createObjectURL(mediaFile) : null), [mediaFile]);
  const attachmentPreviewSrc = gifPreviewUrl ?? mediaPreviewUrl;

  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    };
  }, [mediaPreviewUrl]);

  useEffect(() => {
    if (!emojiOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = emojiWrapRef.current;
      if (el && !el.contains(e.target as Node)) setEmojiOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [emojiOpen]);

  const clearAttachments = useCallback(() => {
    setMediaFile(null);
    setGifUrl(null);
    setGifPreviewUrl(null);
  }, []);

  const clearPoll = useCallback(() => setPollDraft(null), []);

  const openPoll = useCallback(() => {
    if (hasAttachment) {
      toast.message("Remove the image or GIF before adding a poll.");
      return;
    }
    setPollDraft((prev) => prev ?? emptyPollDraft());
  }, [hasAttachment]);

  const insertEmoji = useCallback(
    (emoji: string) => {
      const el = textareaRef.current;
      if (!el) {
        setText((t) => (t + emoji).slice(0, charLimit));
        return;
      }
      const start = el.selectionStart;
      const end = el.selectionEnd;
      setText((t) => {
        const next = t.slice(0, start) + emoji + t.slice(end);
        return next.slice(0, charLimit);
      });
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + emoji.length;
        el.setSelectionRange(pos, pos);
      });
      setEmojiOpen(false);
    },
    [charLimit],
  );

  const pickImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image or GIF file.");
      return;
    }
    if (file.size > COMPOSER_MEDIA_MAX_BYTES) {
      toast.error("File must be 5 MB or smaller.");
      return;
    }
    setGifUrl(null);
    setGifPreviewUrl(null);
    setPollDraft(null);
    setMediaFile(file);
  }, []);

  const charSummary = useMemo(() => {
    if (postingToNone) return "Choose a platform";
    if (postingToBoth) return `${text.length} / ${X_CHAR_LIMIT} (X) · ${text.length} / ${BLUESKY_CHAR_LIMIT} (Bluesky)`;
    if (effectivePostToX) return `${text.length} / ${X_CHAR_LIMIT}`;
    return `${text.length} / ${BLUESKY_CHAR_LIMIT}`;
  }, [text.length, postingToNone, postingToBoth, effectivePostToX]);

  const canPost =
    !overAny &&
    !postingToNone &&
    !posting &&
    !scheduling &&
    (hasPoll
      ? pollValid && Boolean(text.trim()) && effectivePostToX
      : Boolean(text.trim()) || hasAttachment);

  async function submitPost(): Promise<void> {
    const body = text.trim();
    if (overAny || postingToNone || posting) return;
    if (hasPoll) {
      const checked = validateSocialPoll(pollDraft ?? emptyPollDraft());
      if (!pollDraft || !checked.ok) {
        toast.error(!checked.ok ? checked.error : "Complete your poll choices.");
        return;
      }
      if (!body) {
        toast.error("Add a question above your poll choices.");
        return;
      }
      if (!effectivePostToX) {
        toast.error("Polls are only supported on X. Select X or remove the poll.");
        return;
      }
    } else if (!body && !hasAttachment) {
      return;
    }

    setPosting(true);
    type Done = { platform: "x" | "bluesky"; ok: boolean; url?: string; error?: string };

    try {
      if (hasPoll && pollDraft) {
        const checked = validateSocialPoll(pollDraft);
        if (!checked.ok) {
          toast.error(checked.error);
          return;
        }
        const fd = new FormData();
        fd.append("text", body);
        fd.append("postToX", effectivePostToX ? "1" : "0");
        fd.append("postToBluesky", effectivePostToBluesky ? "1" : "0");
        fd.append("pollOptions", JSON.stringify(checked.options));
        fd.append("pollDurationMinutes", String(Math.round(pollDraft.durationMinutes)));

        const res = await fetch("/api/social-signals/composer-post", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          partial?: boolean;
          error?: string;
          urls?: { platform: string; url: string }[];
        };

        if (!res.ok || !data.ok) {
          toast.error(typeof data.error === "string" ? data.error : "Posting failed.");
          return;
        }

        const lines =
          data.urls?.map((u) => `${u.platform === "x" ? "X" : "Bluesky"}: ${u.url}`).join("\n") ?? "";
        toast.success(data.partial ? "Posted to some platforms." : "Poll posted on X.", {
          description: lines || (effectivePostToBluesky ? "Bluesky does not support polls." : undefined),
          duration: 6500,
        });
        setText("");
        clearPoll();
        return;
      }

      if (hasAttachment) {
        const fd = new FormData();
        fd.append("text", body);
        if (effectivePostToX) fd.append("postToX", "1");
        if (effectivePostToBluesky) fd.append("postToBluesky", "1");
        if (mediaFile) fd.append("media", mediaFile);
        else if (gifUrl) fd.append("gifUrl", gifUrl);

        const res = await fetch("/api/social-signals/composer-post", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          partial?: boolean;
          error?: string;
          urls?: { platform: string; url: string }[];
        };

        if (!res.ok || !data.ok) {
          toast.error(typeof data.error === "string" ? data.error : "Posting failed.");
          return;
        }

        const lines =
          data.urls?.map((u) => `${u.platform === "x" ? "X" : "Bluesky"}: ${u.url}`).join("\n") ?? "";
        toast.success(data.partial ? "Posted to some platforms." : "Posted.", {
          description: lines || undefined,
          duration: 6500,
        });
        setText("");
        clearAttachments();
        return;
      }

      const done: Done[] = [];
      const postJson = async (url: string, payload: Record<string, string>) => {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
        return { ok: res.ok, url: typeof data.url === "string" ? data.url : undefined, error: data.error };
      };

      if (effectivePostToX) {
        const r = await postJson("/api/x/post", { text: body } as Record<string, string>);
        done.push({
          platform: "x",
          ok: Boolean(r.ok),
          url: r.url,
          error: !r.ok ? r.error ?? "X post failed" : undefined,
        });
      }
      if (effectivePostToBluesky) {
        const r = await postJson("/api/bsky/post", { text: body });
        done.push({
          platform: "bluesky",
          ok: Boolean(r.ok),
          url: r.url,
          error: !r.ok ? r.error ?? "Bluesky post failed" : undefined,
        });
      }

      const failed = done.filter((d) => !d.ok);
      const succeeded = done.filter((d) => d.ok && d.url);

      if (failed.length === 0 && succeeded.length > 0) {
        const lines = succeeded.map((s) => (s.platform === "x" ? `X: ${s.url}` : `Bluesky: ${s.url}`)).join("\n");
        toast.success(done.length > 1 ? "Posted everywhere." : "Posted.", {
          description: lines,
          duration: 6500,
        });
        setText("");
        return;
      }

      if (succeeded.length > 0 && failed.length > 0) {
        const okLines = succeeded.map((s) => (s.platform === "x" ? `X: ${s.url}` : `Bluesky: ${s.url}`)).join("\n");
        const errLines = failed.map((f) => `${f.platform === "x" ? "X" : "Bluesky"}: ${f.error}`).join("\n");
        toast.message("Posted to some platforms — check messages.", {
          description: `${okLines}\n\n${errLines}`,
          duration: 12_000,
        });
        return;
      }

      const errMsg = failed.map((f) => `${f.platform === "x" ? "X" : "Bluesky"}: ${f.error}`).join(" · ");
      toast.error(errMsg || "Posting failed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error while posting.");
    } finally {
      setPosting(false);
    }
  }

  async function saveAsSchedulerDraft(): Promise<void> {
    const body = text.trim();
    if (!body) {
      toast.error("Add text before saving a draft.");
      return;
    }
    if (postingToNone) {
      toast.error("Choose a platform.");
      return;
    }

    const platforms: ("x" | "bluesky")[] = [
      ...(effectivePostToX ? (["x"] as const) : []),
      ...(effectivePostToBluesky ? (["bluesky"] as const) : []),
    ];

    setScheduling(true);
    try {
      const res = await fetch("/api/social-signals/review-queue/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body, platforms }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; created?: number };
      if (!res.ok) throw new Error(data.error ?? "Could not save draft");
      toast.success(
        `Draft${data.created === 1 ? "" : "s"} saved to Scheduler`,
        onOpenDrafts
          ? {
              action: { label: "Open Scheduler", onClick: onOpenDrafts },
            }
          : undefined,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save draft");
    } finally {
      setScheduling(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-4 pb-10 pt-[max(1rem,8vh)] backdrop-blur-[2px] sm:items-center sm:pt-4"
      role="dialog"
      aria-modal
      aria-labelledby="composer-title"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default"
        aria-label="Close composer"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[color:var(--border)]/80 bg-[color:var(--background)] shadow-[0_30px_120px_-65px_rgba(0,0,0,0.75)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)]/55 px-3 py-2.5 sm:px-4">
          <button
            type="button"
            onClick={onClose}
            className={`${composerToolbarIcon} -ml-1`}
            aria-label="Close"
          >
            <IconClose className="h-5 w-5" />
          </button>
          <span id="composer-title" className="sr-only">
            Composer
          </span>
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-sky-600 hover:bg-sky-500/10 dark:text-sky-400"
            onClick={() => {
              if (onOpenDrafts) {
                onClose();
                onOpenDrafts();
              } else {
                toast.message("Open the Scheduler tab to manage drafts.");
              }
            }}
          >
            Drafts
          </button>
        </div>

        <div className="border-b border-[color:var(--border)]/40 px-3 py-2 sm:px-4">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">Platform</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setPostToX(true);
                setPostToBluesky(false);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                effectivePostToX && !effectivePostToBluesky
                  ? "border-[color:var(--accent)]/50 bg-[color:var(--accent)]/12 text-[color:var(--foreground)]"
                  : "border-[color:var(--border)]/70 bg-[color:var(--card)]/90 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
              }`}
              aria-pressed={effectivePostToX && !effectivePostToBluesky}
            >
              <span className="mr-1.5 inline-flex align-middle">
                <PlatformBadge platform="x" size="xs" />
              </span>
              X
            </button>
            <button
              type="button"
              onClick={() => {
                setPostToX(false);
                setPostToBluesky(true);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                effectivePostToBluesky && !effectivePostToX
                  ? "border-[color:var(--accent)]/50 bg-[color:var(--accent)]/12 text-[color:var(--foreground)]"
                  : "border-[color:var(--border)]/70 bg-[color:var(--card)]/90 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
              }`}
              aria-pressed={effectivePostToBluesky && !effectivePostToX}
            >
              <span className="mr-1.5 inline-flex align-middle">
                <PlatformBadge platform="bluesky" size="xs" />
              </span>
              Bluesky
            </button>
            <button
              type="button"
              onClick={() => {
                setPostToX(true);
                setPostToBluesky(true);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                postingToBoth
                  ? "border-[color:var(--accent)]/50 bg-[color:var(--accent)]/12 text-[color:var(--foreground)]"
                  : "border-[color:var(--border)]/70 bg-[color:var(--card)]/90 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
              }`}
              aria-pressed={postingToBoth}
            >
              <span className="mr-1.5 inline-flex align-middle" aria-hidden>
                <span className="inline-flex items-center gap-1">
                  <PlatformBadge platform="x" size="xs" />
                  <PlatformBadge platform="bluesky" size="xs" />
                </span>
              </span>
              Both
            </button>
          </div>
        </div>

        <div className="flex gap-3 px-3 pt-3 sm:px-4">
          <div className="shrink-0 pt-0.5" aria-hidden>
            <WorkspaceHandleAvatarImg
              postToX={effectivePostToX}
              postToBluesky={effectivePostToBluesky}
              accounts={accounts}
              preferXCommunityAvatar
              size="lg"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label className="block">
              <span className="sr-only">Post text</span>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder="What would you like to share?"
                className="w-full resize-none border-0 bg-transparent px-0 py-1 text-lg leading-relaxed text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)]/75 focus:outline-none focus:ring-0 sm:text-[1.05rem]"
              />
            </label>
            {pollDraft ? (
              <PollComposerPanel
                draft={pollDraft}
                onChange={setPollDraft}
                onRemove={clearPoll}
                disabled={posting || scheduling}
                platformNote="X only"
              />
            ) : null}
            {attachmentPreviewSrc ? (
              <div className="relative mt-2 inline-block max-w-full overflow-hidden rounded-xl border border-[color:var(--border)]/55">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachmentPreviewSrc} alt="" className="max-h-40 max-w-full object-cover" />
                <button
                  type="button"
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1.5 text-white hover:bg-black/70"
                  aria-label="Remove attachment"
                  onClick={clearAttachments}
                >
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={COMPOSER_MEDIA_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          onChange={onFileChange}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--border)]/45 px-2 py-1.5 sm:px-3">
          <div className="flex flex-wrap items-center gap-0.5">
            <button
              type="button"
              disabled={posting || scheduling || hasPoll}
              className={composerToolbarIcon}
              title={hasPoll ? "Remove poll to add an image" : "Add image"}
              aria-label="Add image"
              onClick={pickImage}
            >
              <IconMedia className="h-5 w-5" />
            </button>
            <button
              type="button"
              disabled={posting || scheduling || hasPoll}
              className={`${composerToolbarIcon} font-bold`}
              title={hasPoll ? "Remove poll to add a GIF" : "Search GIFs (Klipy)"}
              aria-label="Search GIFs"
              onClick={() => {
                if (hasPoll) {
                  toast.message("Remove the poll before adding a GIF.");
                  return;
                }
                setGifPickerOpen(true);
              }}
            >
              <span className="flex h-6 min-w-[2rem] items-center justify-center rounded border border-current px-1 text-[10px] leading-none">
                GIF
              </span>
            </button>
            <button
              type="button"
              disabled={posting || scheduling || hasPoll}
              className={`${composerToolbarIcon}${hasPoll ? " opacity-50" : ""}`}
              title={hasPoll ? "Poll added" : "Add poll (X only)"}
              aria-label="Add poll"
              aria-pressed={hasPoll}
              onClick={openPoll}
            >
              <IconPoll className="h-5 w-5" />
            </button>
            <div className="relative" ref={emojiWrapRef}>
              <button
                type="button"
                disabled={posting || scheduling}
                className={composerToolbarIcon}
                title="Emoji"
                aria-label="Emoji"
                aria-expanded={emojiOpen}
                onClick={() => setEmojiOpen((o) => !o)}
              >
                <IconEmoji className="h-5 w-5" />
              </button>
              {emojiOpen ? <EmojiTabPicker open={emojiOpen} onPick={insertEmoji} /> : null}
            </div>
            <button
              type="button"
              disabled={posting || scheduling || !text.trim() || postingToNone}
              className={composerToolbarIcon}
              title="Save to Scheduler queue"
              aria-label="Schedule as draft"
              onClick={() => void saveAsSchedulerDraft()}
            >
              <IconSchedule className="h-5 w-5" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`text-sm tabular-nums ${overAny ? "font-semibold text-red-600 dark:text-red-400" : "text-[color:var(--muted-foreground)]"}`}
              aria-live="polite"
            >
              {charSummary}
            </span>
            <button
              type="button"
              disabled={!canPost}
              onClick={() => void submitPost()}
              className="rounded-full bg-sky-600 px-4 py-1.5 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:bg-[color:var(--muted)] disabled:text-[color:var(--muted-foreground)] disabled:opacity-80 dark:bg-sky-500"
            >
              {posting ? "Posting…" : "Post"}
            </button>
          </div>
        </div>

        <p className="border-t border-[color:var(--border)]/50 px-3 py-2.5 text-[10px] leading-snug text-[color:var(--muted-foreground)] sm:px-4">
          Bluesky posts use your workspace&apos;s Bluesky credentials from Settings. X posting uses your personal account —
          connect <span className="font-medium text-[color:var(--foreground)]">Post to X (OAuth)</span> under Settings first.
          Images and Klipy GIFs post via the composer; digest hero images remain in Digest Studio. Use Schedule to save unscheduled drafts.
        </p>
      </div>

      <GiphyReplyPicker
        open={gifPickerOpen}
        onClose={() => setGifPickerOpen(false)}
        onPick={({ gifUrl: pickedGifUrl, previewUrl }) => {
          setMediaFile(null);
          setPollDraft(null);
          setGifUrl(pickedGifUrl);
          setGifPreviewUrl(previewUrl);
        }}
      />
    </div>
  );
}
