"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Summary } from "@/types/database";
import { summaryStyleLabel } from "@/lib/summary-style-label";
import {
  mergeWhyIntoBlurb,
  parseBlurbJson,
  stringifyBlurbContent,
  type BlurbContent,
} from "@/lib/blurb-content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_DIGEST_SUMMARY_TONE,
  DIGEST_SUMMARY_TONE_OPTIONS,
  type DigestSummaryTone,
} from "@/lib/digest-summary-tone";
import { blurbWordRangeForStyle } from "@/lib/blurb-length-range";

/** Payload for full regeneration (channel + tone + length + optional AI direction). */
export type SummaryRegeneratePayload = {
  /** Target word count for the generated blurb body (headline separate). */
  targetBlurbWords: number;
  refinement: string;
  tone: DigestSummaryTone;
};

const GENERATE_BLURB_STYLES = new Set<string>([
  "newsletter",
  "donor",
  "social",
  "concise",
  "linkedin",
  "bluesky_x",
]);
import { toast } from "sonner";
import { BLUESKY_CHAR_LIMIT } from "@/lib/social-signals/workspace-types";
import { wordCountText } from "@/lib/signal-preview-metrics";

function CopyIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export type DigestPublishAttachmentMode = "digest_visual" | "source_link";

/** Controlled publish targets + attachment for digest cards (shared collapsed strip + SummaryEditor). */
export type SummaryEditorPublishPlatformsControlled = {
  postToX: boolean;
  postToBluesky: boolean;
  onPostToXChange: (next: boolean) => void;
  onPostToBlueskyChange: (next: boolean) => void;
  attachmentMode: DigestPublishAttachmentMode;
  onAttachmentModeChange: (next: DigestPublishAttachmentMode) => void;
};

export function DigestPublishSettingsInline({
  postToX,
  postToBluesky,
  onPostToXChange,
  onPostToBlueskyChange,
  attachmentMode,
  onAttachmentModeChange,
  sourceUrl,
  className = "",
}: SummaryEditorPublishPlatformsControlled & {
  sourceUrl?: string | null;
  className?: string;
}) {
  const hasLink = Boolean(sourceUrl?.trim());
  return (
    <div
      className={`rounded-xl border border-[color:var(--border)]/60 bg-[color:var(--card)]/85 px-3 py-2 ${className}`}
      role="group"
      aria-label="Publish settings"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-tight text-[color:var(--foreground)]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
          Publish
        </span>
        <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium">
          <input
            type="checkbox"
            className="rounded border-[color:var(--border)]"
            checked={postToX}
            onChange={(e) => onPostToXChange(e.target.checked)}
          />
          X
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium">
          <input
            type="checkbox"
            className="rounded border-[color:var(--border)]"
            checked={postToBluesky}
            onChange={(e) => onPostToBlueskyChange(e.target.checked)}
          />
          Bluesky
        </label>
        {hasLink ? (
          <>
            <span className="text-[color:var(--muted-foreground)]/70" aria-hidden>
              ·
            </span>
            <span className="text-[11px] font-medium text-[color:var(--muted-foreground)]">With</span>
            <span className="inline-flex rounded-lg border border-[color:var(--border)]/70 p-0.5">
              <button
                type="button"
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                  attachmentMode === "digest_visual"
                    ? "bg-[color:var(--accent)]/18 text-[color:var(--foreground)]"
                    : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                }`}
                onClick={() => onAttachmentModeChange("digest_visual")}
              >
                Image
              </button>
              <button
                type="button"
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                  attachmentMode === "source_link"
                    ? "bg-[color:var(--accent)]/18 text-[color:var(--foreground)]"
                    : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                }`}
                onClick={() => onAttachmentModeChange("source_link")}
              >
                Link
              </button>
            </span>
          </>
        ) : null}
        <span className="text-[10px] leading-snug text-[color:var(--muted-foreground)] max-sm:basis-full max-sm:pt-0.5 sm:ml-auto sm:text-right">
          Newsletter &amp; LinkedIn planned.
        </span>
      </div>
    </div>
  );
}

export type SummaryEditorDigestWorkflow = {
  genStyle: string;
  onGenStyleChange: (style: string) => void;
  onRegenerate: (payload: SummaryRegeneratePayload) => void | Promise<void>;
  regenerateBusy: boolean;
  disableActions: boolean;
};

export type SummaryEditorStandaloneRegenerate = {
  onRegenerate: (payload: SummaryRegeneratePayload) => void | Promise<void>;
  busy: boolean;
};

export function SummaryEditor({
  summary,
  onSaved,
  variant = "default",
  tone: toneControlled,
  onToneChange,
  sourceUrl,
  digestWorkflow,
  standaloneRegenerate,
  publishPlatforms,
  omitPublishChrome,
}: {
  summary: Summary;
  onSaved: () => Promise<void>;
  variant?: "default" | "embedded";
  tone?: DigestSummaryTone;
  onToneChange?: (tone: DigestSummaryTone) => void;
  sourceUrl?: string | null;
  digestWorkflow?: SummaryEditorDigestWorkflow;
  /** Item page: regenerate from full editor controls (channel fixed to this summary’s style). */
  standaloneRegenerate?: SummaryEditorStandaloneRegenerate;
  /** When set (digest monthly card), publish toggles are controlled by the parent so the collapsed strip stays in sync. */
  publishPlatforms?: SummaryEditorPublishPlatformsControlled;
  /** Digest card: publish bar + Post/Save/Copy live in the collapsed preview only — hide them here. */
  omitPublishChrome?: boolean;
}) {
  const rawText = summary.edited_text ?? summary.generated_text;
  const initial = mergeWhyIntoBlurb(
    parseBlurbJson(rawText) ?? {
      headline: "",
      blurb: rawText,
      why_it_matters: "",
      confidence_notes: "",
    },
  );
  const [content, setContent] = useState<BlurbContent>(initial);
  const [saving, setSaving] = useState(false);
  const channelStyleForLength = digestWorkflow?.genStyle ?? summary.style;
  const wordRange = useMemo(() => blurbWordRangeForStyle(channelStyleForLength), [channelStyleForLength]);
  const [targetBlurbWords, setTargetBlurbWords] = useState(() =>
    blurbWordRangeForStyle(digestWorkflow?.genStyle ?? summary.style).default,
  );
  const [chatPrompt, setChatPrompt] = useState("");
  const [intPostToX, setIntPostToX] = useState(true);
  const [intPostToBluesky, setIntPostToBluesky] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [intAttachmentMode, setIntAttachmentMode] = useState<DigestPublishAttachmentMode>("digest_visual");

  const postToX = publishPlatforms ? publishPlatforms.postToX : intPostToX;
  const setPostToX = publishPlatforms ? publishPlatforms.onPostToXChange : setIntPostToX;
  const postToBluesky = publishPlatforms ? publishPlatforms.postToBluesky : intPostToBluesky;
  const setPostToBluesky = publishPlatforms ? publishPlatforms.onPostToBlueskyChange : setIntPostToBluesky;
  const attachmentMode = publishPlatforms ? publishPlatforms.attachmentMode : intAttachmentMode;
  const setAttachmentMode = publishPlatforms ? publishPlatforms.onAttachmentModeChange : setIntAttachmentMode;

  const [toneInternal, setToneInternal] = useState<DigestSummaryTone>(DEFAULT_DIGEST_SUMMARY_TONE);
  const toneControlledDefined = toneControlled !== undefined;
  const tone = toneControlledDefined ? toneControlled : toneInternal;
  function setTone(next: DigestSummaryTone) {
    if (!toneControlledDefined) setToneInternal(next);
    onToneChange?.(next);
  }

  useEffect(() => {
    const raw = summary.edited_text ?? summary.generated_text;
    const p = parseBlurbJson(raw);
    setContent(
      mergeWhyIntoBlurb(
        p ?? { headline: "", blurb: raw, why_it_matters: "", confidence_notes: "" },
      ),
    );
    setChatPrompt("");
    setTargetBlurbWords(blurbWordRangeForStyle(digestWorkflow?.genStyle ?? summary.style).default);
    if (!publishPlatforms) {
      setIntAttachmentMode("digest_visual");
      setIntPostToX(true);
      setIntPostToBluesky(true);
    }
  }, [summary, publishPlatforms]);

  useEffect(() => {
    const r = blurbWordRangeForStyle(digestWorkflow?.genStyle ?? summary.style);
    setTargetBlurbWords((prev) => Math.min(r.max, Math.max(r.min, prev)));
  }, [digestWorkflow?.genStyle, summary.style]);

  useEffect(() => {
    if (!sourceUrl?.trim()) {
      if (publishPlatforms) publishPlatforms.onAttachmentModeChange("digest_visual");
      else setIntAttachmentMode("digest_visual");
    }
  }, [sourceUrl, publishPlatforms]);

  function summaryBody(): string {
    return content.blurb?.trim() ?? "";
  }

  function applySummaryBody(raw: string) {
    const t = raw.trimEnd();
    const legacy = "\n\nWhy it matters:";
    const idx = t.toLowerCase().lastIndexOf(legacy.toLowerCase());
    if (idx >= 0) {
      const blurbPart = t.slice(0, idx).trim();
      const whyPart = t.slice(idx + legacy.length).trim();
      setContent((c) => mergeWhyIntoBlurb({ ...c, blurb: blurbPart, why_it_matters: whyPart }));
      return;
    }
    setContent((c) => ({ ...c, blurb: t.trim(), why_it_matters: "" }));
  }

  async function saveEdits() {
    setSaving(true);
    const supabase = createClient();
    const edited = stringifyBlurbContent(content);
    const { error } = await supabase.from("summaries").update({ edited_text: edited }).eq("id", summary.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Summary updated");
    await onSaved();
  }

  function wordCount(s: string): number {
    return wordCountText(s);
  }

  function baseCopyText(): string {
    return `${content.headline}\n\n${summaryBody()}`.trim();
  }

  async function copyText() {
    const text = baseCopyText();
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  const dw = digestWorkflow;
  const showRegenerate =
    Boolean(dw) ||
    Boolean(standaloneRegenerate && GENERATE_BLURB_STYLES.has(summary.style));

  async function runRegenerate() {
    const regen = dw
      ? {
          fn: dw.onRegenerate,
          busy: dw.regenerateBusy,
          disabled: dw.disableActions,
        }
      : standaloneRegenerate
        ? {
            fn: standaloneRegenerate.onRegenerate,
            busy: standaloneRegenerate.busy,
            disabled: false,
          }
        : null;
    if (!regen || regen.busy || regen.disabled) return;
    const payload: SummaryRegeneratePayload = {
      targetBlurbWords,
      refinement: chatPrompt.trim(),
      tone,
    };
    try {
      await Promise.resolve(regen.fn(payload));
      setChatPrompt("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    }
  }

  const isSocialChannel = summary.style === "bluesky_x";

  async function publishToPlatforms() {
    const text = baseCopyText();
    if (!text.trim()) {
      toast.error("Nothing to post yet");
      return;
    }
    if (!postToX && !postToBluesky) {
      toast.error("Select X and/or Bluesky");
      return;
    }
    setPublishing(true);
    const results: string[] = [];
    const errors: string[] = [];
    try {
      const publishPayload: Record<string, unknown> = {
        text,
        source_item_id: summary.source_item_id,
        attachment: attachmentMode,
      };
      if (postToX) {
        const res = await fetch("/api/x/post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(publishPayload),
        });
        const data = (await res.json()) as {
          error?: string;
          url?: string;
          posted_without_media?: boolean;
        };
        if (!res.ok) errors.push(`X: ${data.error ?? res.statusText}`);
        else if (data.url) {
          results.push(
            data.posted_without_media
              ? `X: ${data.url} (text only — X rejected the image attachment)`
              : `X: ${data.url}`,
          );
        } else results.push("X: posted");
      }
      if (postToBluesky) {
        const res = await fetch("/api/bsky/post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(publishPayload),
        });
        const data = (await res.json()) as { error?: string; url?: string; truncated?: boolean };
        if (!res.ok) errors.push(`Bluesky: ${data.error ?? res.statusText}`);
        else if (data.url) {
          results.push(
            data.truncated
              ? `Bluesky: ${data.url} (shortened to ${BLUESKY_CHAR_LIMIT} characters)`
              : `Bluesky: ${data.url}`,
          );
        } else results.push("Bluesky: posted");
      }
      if (results.length) toast.success(results.join(" · "));
      if (errors.length) toast.error(errors.join(" · "));
    } catch {
      toast.error("Publish request failed");
    } finally {
      setPublishing(false);
    }
  }

  const cardShell =
    "rounded-xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/80 p-4 shadow-sm";

  /** Matches digest `DigestVisualPanel` “Acquire visuals” strip (`bg-[color:var(--background)]/60`). */
  const editingChannelsShell =
    "space-y-4 rounded-xl border border-[color:var(--border)]/55 bg-[color:var(--background)]/60 p-4";

  /** Twin panels (Selected text / Editing channels); outer shell stays minimal like Media library + digest column. */
  const shellClass =
    variant === "embedded"
      ? "flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 text-sm"
      : "w-full min-w-0 space-y-4 text-sm";

  return (
    <div className={shellClass} data-summary-editor-variant={variant}>
      <section
        className={`${cardShell} ${
          variant === "embedded" ? "flex min-h-0 flex-1 flex-col gap-4" : "space-y-4"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
              Selected text
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyText()}
            title="Copy summary"
            aria-label="Copy summary"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--border)]/65 text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)]"
          >
            <CopyIcon className="h-4 w-4 shrink-0" aria-hidden />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border)]/45 pb-3 text-xs text-[color:var(--muted-foreground)]">
          <span className="rounded-full border border-[color:var(--border)]/75 bg-[color:var(--muted)]/30 px-2.5 py-0.5 font-semibold text-[color:var(--foreground)]">
            {summaryStyleLabel(summary.style)}
          </span>
          <span className="text-right">
            {summary.model_name ?? "model"} · {new Date(summary.created_at).toLocaleString()}
          </span>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-[color:var(--foreground)]/90">Headline</Label>
          <Input
            className="w-full min-w-0 border-[color:var(--border)]/85 bg-[color:var(--background)]/95"
            value={content.headline}
            onChange={(e) => setContent({ ...content, headline: e.target.value })}
          />
        </div>
        <div
          className={
            variant === "embedded"
              ? "flex min-h-0 flex-1 flex-col gap-1.5"
              : "space-y-1.5"
          }
        >
          <Label className="text-xs font-semibold text-[color:var(--foreground)]/90">Summary</Label>
          <Textarea
            className={`w-full min-w-0 box-border border-[color:var(--border)]/85 bg-[color:var(--background)]/95 ${
              variant === "embedded"
                ? "min-h-[168px] flex-1 resize-y"
                : "min-h-[168px]"
            }`}
            value={summaryBody()}
            onChange={(e) => applySummaryBody(e.target.value)}
          />
        </div>
      </section>

      <section className={editingChannelsShell}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
            Editing channels
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
            Channel, tone, length, and optional AI direction are applied when you generate the selected text
            above.
          </p>
        </div>

        {dw ? (
          <div className="flex min-w-0 flex-col gap-2 border-b border-[color:var(--border)]/40 pb-4">
            <div className="flex min-w-0 max-w-md flex-col gap-2">
              <Label className="text-xs font-semibold text-[color:var(--foreground)]/90">Channel</Label>
              <Select
                value={dw.genStyle}
                onChange={(e) => dw.onGenStyleChange(e.target.value)}
                className="w-full py-2.5 leading-normal"
                aria-label="Summary format for generation"
                disabled={dw.disableActions}
              >
                <option value="newsletter">Newsletter</option>
                <option value="linkedin">LinkedIn</option>
                <option value="bluesky_x">Social media</option>
              </Select>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
          <div className="flex min-w-0 shrink-0 flex-col gap-2 sm:w-[min(100%,14rem)]">
            <Label className="text-[11px] font-semibold text-[color:var(--foreground)]/90">Tone</Label>
            <Select
              value={tone}
              onChange={(e) => setTone(e.target.value as DigestSummaryTone)}
              className="py-2.5 text-sm leading-normal"
              aria-label="Writing tone"
            >
              {DIGEST_SUMMARY_TONE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-0 flex-1 space-y-2 pt-0.5 sm:pt-0">
            <Label className="text-[11px] font-semibold text-[color:var(--foreground)]/90">Length</Label>
            <div className="px-0.5 pt-1">
              <input
                type="range"
                min={wordRange.min}
                max={wordRange.max}
                step={1}
                value={targetBlurbWords}
                onChange={(e) => setTargetBlurbWords(Number(e.target.value))}
                className="editorial-length-slider h-2.5 w-full cursor-pointer appearance-none rounded-full bg-[color:var(--border)]/60 accent-[color:var(--accent)]"
                aria-valuetext={`Target ${targetBlurbWords} words for blurb`}
                aria-label="Target length in words for the summary body"
              />
              <div className="mt-2 flex justify-between gap-2 text-[11px] font-medium">
                <span className="text-[color:var(--muted-foreground)]/85">{wordRange.min}</span>
                <span className="tabular-nums text-[color:var(--foreground)]">~{targetBlurbWords} words</span>
                <span className="text-[color:var(--muted-foreground)]/85">{wordRange.max}</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[11px] font-medium text-[color:var(--muted-foreground)]">
          Draft {wordCount(`${content.headline} ${summaryBody()}`.trim())} words · target ~{targetBlurbWords}{" "}
          words when generating
        </p>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-[color:var(--foreground)]/90">Adjust with AI</Label>
          <Input
            className="h-9 w-full border-[color:var(--border)]/85 bg-[color:var(--background)]/95 text-sm"
            value={chatPrompt}
            onChange={(e) => setChatPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && showRegenerate) {
                e.preventDefault();
                void runRegenerate();
              }
            }}
            placeholder="e.g. punchier, shorter, less jargon…"
            aria-label="Instruction for AI refinement"
          />
        </div>

        {showRegenerate ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="primary"
              className="h-10 px-4 text-sm font-semibold"
              disabled={
                dw
                  ? dw.disableActions || dw.regenerateBusy
                  : Boolean(standaloneRegenerate?.busy)
              }
              onClick={() => void runRegenerate()}
            >
              {(dw ? dw.regenerateBusy : standaloneRegenerate?.busy) ? "Generating…" : "Generate"}
            </Button>
          </div>
        ) : null}

        {isSocialChannel && !omitPublishChrome ? (
          <div className="border-t border-[color:var(--border)]/40 pt-4">
            <DigestPublishSettingsInline
              postToX={postToX}
              postToBluesky={postToBluesky}
              onPostToXChange={setPostToX}
              onPostToBlueskyChange={setPostToBluesky}
              attachmentMode={attachmentMode}
              onAttachmentModeChange={setAttachmentMode}
              sourceUrl={sourceUrl}
              className="border-0 bg-transparent p-0 shadow-none"
            />
          </div>
        ) : null}

        {!(omitPublishChrome && isSocialChannel) ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--border)]/40 pt-4">
            {isSocialChannel && !omitPublishChrome ? (
              <Button
                type="button"
                className="h-10 px-5 text-sm font-semibold shadow-sm"
                disabled={publishing || (!postToX && !postToBluesky)}
                onClick={() => void publishToPlatforms()}
              >
                {publishing ? "Posting…" : "Post"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={() => void saveEdits()}
              disabled={saving}
              className="h-10 px-5 text-sm font-medium"
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
