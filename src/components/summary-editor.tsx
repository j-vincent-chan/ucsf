"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { Summary, SummaryOutputStatus, SummaryStyle } from "@/types/database";
import { isDigestSocialOutputStyle, type DigestContentStudioOutputOption } from "@/lib/digest-output-styles";
import { isDigestStudioPlaceholderSummary } from "@/lib/digest-studio-placeholder-summary";
import { DigestStudioOutputTabs, type DigestStudioOutputTab } from "@/components/digest-studio-output-tabs";
import { summaryStyleLabel } from "@/lib/summary-style-label";
import {
  mergeWhyIntoBlurb,
  parseBlurbJson,
  stringifyBlurbContent,
  type BlurbContent,
} from "@/lib/blurb-content";
import { SparklesIcon } from "@/components/icons/sparkles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { InvestigatorMentionTextarea } from "@/components/investigator-mention-textarea";
import {
  DEFAULT_DIGEST_SUMMARY_TONE,
  DIGEST_SUMMARY_TONE_OPTIONS,
  type DigestSummaryTone,
} from "@/lib/digest-summary-tone";
import {
  BLURB_CHAR_SLIDER_STEP,
  blurbCharRangeForStyle,
  snapBlurbCharsToSliderStep,
} from "@/lib/blurb-length-range";
import { BLUESKY_CHAR_LIMIT } from "@/lib/social-signals/workspace-types";
import { toast } from "sonner";

/** Payload for full regeneration (channel + tone + length + optional AI direction). */
export type SummaryRegeneratePayload = {
  /** Target character count for the generated blurb body (headline separate). */
  targetBlurbChars: number;
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
  "x",
  "bluesky",
  "web_blurb",
  "internal_digest",
]);

function normalizeOutputStatus(v: string | null | undefined): SummaryOutputStatus {
  if (v === "ready" || v === "reviewed" || v === "draft") return v;
  return "draft";
}

/** Headline + blurb length for UI/save (preserves trailing spaces in blurb). */
function digestCombinedCharCountChars(c: Pick<BlurbContent, "headline" | "blurb">): number {
  const h = c.headline.trim();
  const b = c.blurb ?? "";
  if (!h.length) return [...b].length;
  return [...`${h} ${b}`].length;
}

/** Matches summary `Textarea` `min-h`; used when syncing height to `scrollHeight`. */
const SUMMARY_BODY_TEXTAREA_MIN_PX = 168;

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
  // attachmentMode / onAttachmentModeChange are still part of the controlled publish state,
  // but the collapsed digest strip now renders attachment actions (copy/download) instead of a toggle.
  attachmentMode: _attachmentMode,
  onAttachmentModeChange: _onAttachmentModeChange,
  sourceUrl,
  className = "",
}: SummaryEditorPublishPlatformsControlled & {
  sourceUrl?: string | null;
  className?: string;
}) {
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
      </div>
    </div>
  );
}

export type SummaryEditorDigestWorkflow = {
  /** All channels in the single Output dropdown (Content studio shows exactly these rows). */
  channelOptions: DigestContentStudioOutputOption[];
  selectedChannelStyle: SummaryStyle;
  onSelectChannelStyle: (style: SummaryStyle) => void;
  /** Always three outputs; `selectable` when generated text exists for that channel. */
  outputTabs: DigestStudioOutputTab[];
  activeTabStyle: SummaryStyle;
  onSelectOutputTab: (style: SummaryStyle) => void;
  onRegenerate: (payload: SummaryRegeneratePayload) => void | Promise<void>;
  regenerateBusy: boolean;
  /** Remove this channel’s summary row (reset the output). */
  onResetDigestOutput: () => void | Promise<void>;
  resetDigestBusy: boolean;
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
  digestBriefSaveOutletRef,
  onBriefSaveBusyChange,
  onDigestBriefDraftChange,
  onAfterSuccessfulBriefSave,
  omitDigestOutputTabs = false,
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
  /** Digest: parent holds Save on checklist row — assign latest save handler here; hides inline footer Save when set. */
  digestBriefSaveOutletRef?: MutableRefObject<(() => Promise<void>) | null>;
  /** Digest: mirror saving state so external Save disables (e.g. checklist + collapsed strip share one flag). */
  onBriefSaveBusyChange?: (busy: boolean) => void;
  /** Digest expanded card: draft differs from persisted summary (external checklist Save bar). */
  onDigestBriefDraftChange?: (state: { dirty: boolean }) => void;
  /** Digest queue card: collapse the expanded row after a successful save so the Output preview is visible again. */
  onAfterSuccessfulBriefSave?: () => void;
  /** Digest expanded card: parent renders channel tabs above Content studio — hide duplicate tab strip here. */
  omitDigestOutputTabs?: boolean;
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
  const channelStyleForLength = summary.style;
  const charRange = useMemo(() => blurbCharRangeForStyle(channelStyleForLength), [channelStyleForLength]);
  const [targetBlurbChars, setTargetBlurbChars] = useState(() => {
    const fromDb = summary.target_blurb_chars;
    if (typeof fromDb === "number" && Number.isFinite(fromDb) && fromDb > 0) {
      return snapBlurbCharsToSliderStep(fromDb);
    }
    return blurbCharRangeForStyle(summary.style).default;
  });
  const lengthSliderFillPct = useMemo(() => {
    const span = charRange.max - charRange.min;
    if (span <= 0) return 0;
    return ((targetBlurbChars - charRange.min) / span) * 100;
  }, [charRange.min, charRange.max, targetBlurbChars]);
  const [outputStatus, setOutputStatus] = useState<SummaryOutputStatus>(() =>
    normalizeOutputStatus(summary.output_status),
  );
  /** Only reset length when switching summaries — not when the same row refreshes after Generate. */
  const lastSummaryIdForLengthRef = useRef(summary.id);
  const [chatPrompt, setChatPrompt] = useState("");
  const [intPostToX, setIntPostToX] = useState(true);
  const [intPostToBluesky, setIntPostToBluesky] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [intAttachmentMode, setIntAttachmentMode] = useState<DigestPublishAttachmentMode>("digest_visual");
  const summaryBodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const postToX = publishPlatforms ? publishPlatforms.postToX : intPostToX;
  const setPostToX = publishPlatforms ? publishPlatforms.onPostToXChange : setIntPostToX;
  const postToBluesky = publishPlatforms ? publishPlatforms.postToBluesky : intPostToBluesky;
  const setPostToBluesky = publishPlatforms ? publishPlatforms.onPostToBlueskyChange : setIntPostToBluesky;
  const attachmentMode = publishPlatforms ? publishPlatforms.attachmentMode : intAttachmentMode;
  const setAttachmentMode = publishPlatforms ? publishPlatforms.onAttachmentModeChange : setIntAttachmentMode;

  const [toneInternal, setToneInternal] = useState<DigestSummaryTone>(DEFAULT_DIGEST_SUMMARY_TONE);
  /** Tracks which summary row last drove tone sync — avoids snapping to Professional when `digest_tone` is briefly null during refresh/generate. */
  const toneSyncSummaryIdRef = useRef(summary.id);
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
    setOutputStatus(normalizeOutputStatus(summary.output_status));
    if (!publishPlatforms) {
      setIntAttachmentMode("digest_visual");
      setIntPostToX(true);
      setIntPostToBluesky(true);
    }
  }, [summary, publishPlatforms]);

  useEffect(() => {
    if (!digestWorkflow || toneControlledDefined) return;
    const prevId = toneSyncSummaryIdRef.current;
    const idChanged = prevId !== summary.id;
    const t = summary.digest_tone;
    if (t && DIGEST_SUMMARY_TONE_OPTIONS.some((o) => o.id === t)) {
      setToneInternal(t as DigestSummaryTone);
      toneSyncSummaryIdRef.current = summary.id;
      return;
    }
    if (idChanged) {
      setToneInternal(DEFAULT_DIGEST_SUMMARY_TONE);
    }
    toneSyncSummaryIdRef.current = summary.id;
  }, [digestWorkflow, toneControlledDefined, summary.id, summary.digest_tone]);

  useEffect(() => {
    if (lastSummaryIdForLengthRef.current !== summary.id) {
      lastSummaryIdForLengthRef.current = summary.id;
      const fromDb = summary.target_blurb_chars;
      setTargetBlurbChars(
        typeof fromDb === "number" && Number.isFinite(fromDb) && fromDb > 0
          ? snapBlurbCharsToSliderStep(fromDb)
          : blurbCharRangeForStyle(summary.style).default,
      );
    }
  }, [summary.id, summary.style]);

  useEffect(() => {
    const r = blurbCharRangeForStyle(summary.style);
    setTargetBlurbChars((prev) =>
      snapBlurbCharsToSliderStep(Math.min(r.max, Math.max(r.min, prev))),
    );
  }, [summary.style]);

  useEffect(() => {
    if (!sourceUrl?.trim()) {
      if (publishPlatforms) publishPlatforms.onAttachmentModeChange("digest_visual");
      else setIntAttachmentMode("digest_visual");
    }
  }, [sourceUrl, publishPlatforms]);

  /** Blurb as edited (preserves trailing spaces for typing @mentions at end of paragraph). */
  function summaryBody(): string {
    return content.blurb ?? "";
  }

  function applySummaryBody(raw: string) {
    const legacy = "\n\nWhy it matters:";
    const idx = raw.toLowerCase().lastIndexOf(legacy.toLowerCase());
    if (idx >= 0) {
      const blurbPart = raw.slice(0, idx).trimEnd();
      const whyPart = raw.slice(idx + legacy.length).trim();
      setContent((c) => mergeWhyIntoBlurb({ ...c, blurb: blurbPart, why_it_matters: whyPart }));
      return;
    }
    setContent((c) => ({ ...c, blurb: raw, why_it_matters: "" }));
  }

  const syncSummaryBodyTextareaHeight = useCallback(() => {
    const el = summaryBodyTextareaRef.current;
    if (!el) return;
    el.style.minHeight = "0";
    el.style.height = "0";
    const measured = el.scrollHeight;
    const next = Math.max(SUMMARY_BODY_TEXTAREA_MIN_PX, measured);
    el.style.height = "";
    if (variant === "embedded") {
      el.style.minHeight = `${next}px`;
    } else {
      el.style.minHeight = "";
      el.style.height = `${next}px`;
    }
  }, [variant]);

  useLayoutEffect(() => {
    syncSummaryBodyTextareaHeight();
  }, [syncSummaryBodyTextareaHeight, content.blurb]);

  const saveEdits = useCallback(async () => {
    if (isDigestStudioPlaceholderSummary(summary)) {
      toast.message("Generate text before saving.");
      return;
    }
    setSaving(true);
    onBriefSaveBusyChange?.(true);
    try {
      const supabase = createClient();
      const edited = stringifyBlurbContent(content);
      const cc = digestCombinedCharCountChars(content);
      const { error } = await supabase
        .from("summaries")
        .update({
          edited_text: edited,
          digest_tone: tone,
          target_blurb_chars: targetBlurbChars,
          character_count: cc,
          output_status: outputStatus,
        })
        .eq("id", summary.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Summary updated");
      await onSaved();
      onAfterSuccessfulBriefSave?.();
    } finally {
      setSaving(false);
      onBriefSaveBusyChange?.(false);
    }
  }, [
    content,
    summary.id,
    tone,
    targetBlurbChars,
    outputStatus,
    onSaved,
    onBriefSaveBusyChange,
    onAfterSuccessfulBriefSave,
    summary,
  ]);

  useLayoutEffect(() => {
    if (!digestBriefSaveOutletRef) return undefined;
    digestBriefSaveOutletRef.current = saveEdits;
    return () => {
      digestBriefSaveOutletRef.current = null;
    };
  }, [digestBriefSaveOutletRef, saveEdits]);

  function baseCopyText(): string {
    const h = content.headline.trim();
    const b = content.blurb ?? "";
    if (!h.length) return b;
    return `${h}\n\n${b}`;
  }

  const dw = digestWorkflow;
  const persistDigestPlaceholder = isDigestStudioPlaceholderSummary(summary);
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
      targetBlurbChars,
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

  const isSocialChannel = isDigestSocialOutputStyle(summary.style);
  const saveInBriefOutlet = Boolean(digestBriefSaveOutletRef);

  const digestBriefDirty = useMemo(() => {
    if (!saveInBriefOutlet || variant !== "embedded") return false;
    if (isDigestStudioPlaceholderSummary(summary)) return false;
    const raw = summary.edited_text ?? summary.generated_text ?? "";
    const baselineParsed = mergeWhyIntoBlurb(
      parseBlurbJson(raw) ?? {
        headline: "",
        blurb: raw,
        why_it_matters: "",
        confidence_notes: "",
      },
    );
    const textDirty = stringifyBlurbContent(content) !== stringifyBlurbContent(baselineParsed);
    const baselineTone: DigestSummaryTone =
      summary.digest_tone && DIGEST_SUMMARY_TONE_OPTIONS.some((o) => o.id === summary.digest_tone)
        ? (summary.digest_tone as DigestSummaryTone)
        : DEFAULT_DIGEST_SUMMARY_TONE;
    const toneDirty = tone !== baselineTone;
    const dbChars = summary.target_blurb_chars;
    const baselineChars =
      typeof dbChars === "number" && Number.isFinite(dbChars) && dbChars > 0
        ? snapBlurbCharsToSliderStep(dbChars)
        : charRange.default;
    const charsDirty = targetBlurbChars !== baselineChars;
    const statusDirty = outputStatus !== normalizeOutputStatus(summary.output_status);
    return textDirty || toneDirty || charsDirty || statusDirty;
  }, [saveInBriefOutlet, variant, summary, content, tone, targetBlurbChars, outputStatus, charRange]);

  useEffect(() => {
    if (!onDigestBriefDraftChange || !saveInBriefOutlet || variant !== "embedded") return;
    onDigestBriefDraftChange({ dirty: digestBriefDirty });
  }, [digestBriefDirty, onDigestBriefDraftChange, saveInBriefOutlet, variant]);

  const showPublishSettingsInline = isSocialChannel && !omitPublishChrome;
  const showPostInActionsFooter = showPublishSettingsInline;
  /** Inline Save stays in Output Settings unless parent owns the handler (wired Save elsewhere). */
  const showInlineSaveButton = !saveInBriefOutlet;
  /** Bottom bar: divider + Generate / Post / Save (Generate stays visible even when social chrome collapses elsewhere). */
  const showEditingActionsFooter =
    showRegenerate || showPostInActionsFooter || showInlineSaveButton;

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
      ? "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-4 text-sm"
      : "w-full min-w-0 space-y-4 text-sm";

  return (
    <div className={shellClass} data-summary-editor-variant={variant}>
      <section
        className={`${cardShell} ${
          variant === "embedded" ? "flex min-h-0 flex-1 flex-col gap-4" : "space-y-4"
        }`}
      >
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
            Selected output
          </p>
          {digestWorkflow ? (
            <p className="text-xs leading-relaxed text-[color:var(--muted-foreground)]">
              {isDigestStudioPlaceholderSummary(summary)
                ? "No copy for this channel yet — use Generate text below."
                : "Review the saved text for this channel."}
            </p>
          ) : null}
        </div>

        {digestWorkflow && !omitDigestOutputTabs ? (
          <DigestStudioOutputTabs
            tabs={digestWorkflow.outputTabs}
            activeStyle={digestWorkflow.activeTabStyle}
            onSelectStyle={digestWorkflow.onSelectOutputTab}
            disabled={digestWorkflow.disableActions}
          />
        ) : null}

        {!digestWorkflow ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border)]/45 pb-3 text-xs text-[color:var(--muted-foreground)]">
            <span className="rounded-full border border-[color:var(--border)]/75 bg-[color:var(--muted)]/30 px-2.5 py-0.5 font-semibold text-[color:var(--foreground)]">
              {summaryStyleLabel(summary.style)}
            </span>
            <span className="text-right">
              {summary.model_name ?? "model"} ·{" "}
              <span suppressHydrationWarning>
                {new Date(
                  summary.generated_at ?? summary.updated_at ?? summary.created_at,
                ).toLocaleString()}
              </span>
            </span>
          </div>
        ) : null}

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
              : "flex flex-col gap-1.5"
          }
        >
          <Label className="text-xs font-semibold text-[color:var(--foreground)]/90">Summary</Label>
          <InvestigatorMentionTextarea
            ref={summaryBodyTextareaRef}
            mentionNetwork="bluesky"
            className={`w-full min-w-0 box-border resize-y border-[color:var(--border)]/85 bg-[color:var(--background)]/95 ${
              variant === "embedded"
                ? "min-h-0 flex-1 overflow-auto"
                : "min-h-[168px] overflow-hidden"
            }`}
            value={summaryBody()}
            onChange={(v) => applySummaryBody(v)}
          />
        </div>
        {digestWorkflow ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[color:var(--border)]/45 pt-3 text-[11px] font-medium tabular-nums text-[color:var(--muted-foreground)]">
            <span className="min-w-0 shrink-0">
              {digestCombinedCharCountChars(content).toLocaleString("en-US")}{" "}
              characters
            </span>
            <span className="min-w-0 max-w-[min(100%,22rem)] text-right leading-snug">
              {summary.model_name ?? "model"} ·{" "}
              <span suppressHydrationWarning>
                {new Date(
                  summary.generated_at ?? summary.updated_at ?? summary.created_at,
                ).toLocaleString()}
              </span>
            </span>
          </div>
        ) : null}
      </section>

      <section
        className={`${editingChannelsShell}${variant === "embedded" ? " shrink-0" : ""}`}
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
            Output Settings
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
            Set the channel, tone, length, and edit direction.             Use{" "}
            <span className="font-medium text-[color:var(--foreground)]">Save all changes</span> to keep edits.{" "}
            <span className="font-medium text-[#8b7e74] dark:text-[#b8a99e]">Reset text</span> removes this output entirely so
            you can start over on this channel.
          </p>
        </div>

        <div
          className={
            dw
              ? "flex min-w-0 flex-col gap-3 border-b border-[color:var(--border)]/40 pb-4 sm:flex-row sm:items-start sm:gap-3 lg:gap-4"
              : "flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8"
          }
        >
          {dw ? (
            <>
              <div className="flex min-w-0 flex-[1.2] basis-0 flex-col gap-2 sm:max-w-[min(100%,18rem)]">
                <Label className="text-xs font-semibold text-[color:var(--foreground)]/90">Output</Label>
                <Select
                  value={dw.selectedChannelStyle}
                  onChange={(e) => dw.onSelectChannelStyle(e.target.value as SummaryStyle)}
                  className="w-full py-2.5 leading-normal"
                  aria-label="Channel for this signal"
                  disabled={dw.disableActions}
                >
                  {dw.channelOptions.map((opt) => (
                    <option key={opt.style} value={opt.style}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex min-w-0 flex-[1.2] basis-0 flex-col gap-2 sm:max-w-[min(100%,18rem)]">
                <Label className="text-xs font-semibold text-[color:var(--foreground)]/90">Tone</Label>
                <Select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as DigestSummaryTone)}
                  className="w-full py-2.5 text-sm leading-normal"
                  aria-label="Writing tone"
                  disabled={dw.disableActions}
                >
                  {DIGEST_SUMMARY_TONE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          ) : (
            <div className="flex min-w-0 shrink-0 flex-col gap-2 sm:w-[min(100%,14rem)]">
              <Label className="text-xs font-semibold text-[color:var(--foreground)]/90">Tone</Label>
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
          )}
          <div
            className={
              dw
                ? "flex min-w-0 flex-[1.15] basis-0 flex-col gap-2 sm:max-w-[min(100%,22rem)]"
                : "flex min-w-0 flex-1 flex-col gap-2 sm:pt-0"
            }
          >
            <Label className="text-xs font-semibold text-[color:var(--foreground)]/90">Length</Label>
            <div className={dw ? "px-0.5 pt-0.5" : "px-0.5 pt-1"}>
              <input
                type="range"
                min={charRange.min}
                max={charRange.max}
                step={BLURB_CHAR_SLIDER_STEP}
                value={targetBlurbChars}
                onChange={(e) => setTargetBlurbChars(Number(e.target.value))}
                className="editorial-length-slider h-2.5 w-full cursor-pointer appearance-none"
                style={{ "--range-pct": `${lengthSliderFillPct}%` } as CSSProperties}
                aria-valuetext={`Target ${targetBlurbChars} characters for blurb`}
                aria-label="Target length in characters for the summary body"
              />
              <div className="mt-2 flex justify-between gap-2 text-[11px] font-medium">
                <span className="text-[color:var(--muted-foreground)]/85">{charRange.min}</span>
                <span className="tabular-nums text-[color:var(--foreground)]">~{targetBlurbChars} characters</span>
                <span className="text-[color:var(--muted-foreground)]/85">{charRange.max}</span>
              </div>
            </div>
          </div>
        </div>

        {!digestWorkflow ? (
          <p className="text-[11px] font-medium text-[color:var(--muted-foreground)]">
            Draft {digestCombinedCharCountChars(content)} characters · target ~{targetBlurbChars}{" "}
            characters when generating
          </p>
        ) : null}

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

        {showPublishSettingsInline ? (
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

        {showEditingActionsFooter ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--border)]/40 pt-4">
            {showRegenerate ? (
              <Button
                type="button"
                variant="primary"
                className="h-10 min-h-10 gap-2 px-5 text-sm font-semibold"
                disabled={
                  dw
                    ? dw.disableActions || dw.regenerateBusy
                    : Boolean(standaloneRegenerate?.busy)
                }
                onClick={() => void runRegenerate()}
              >
                <SparklesIcon className="h-4 w-4 shrink-0 opacity-95" />
                {(dw ? dw.regenerateBusy : standaloneRegenerate?.busy)
                  ? "Generating text…"
                  : "Generate text"}
              </Button>
            ) : null}
            {dw ? (
              <Button
                type="button"
                variant="ghost"
                className="h-10 min-h-10 border border-solid border-[#d1c6bd] bg-[#f9f7f2] px-5 text-sm font-semibold !text-[#8b7e74] shadow-none hover:!text-[#6f645c] hover:bg-[#f3efe8] dark:border-[color:var(--border)]/65 dark:bg-[color:var(--muted)]/20 dark:!text-[#b8a99e] dark:hover:bg-[color:var(--muted)]/30 dark:hover:!text-[#cbbfaf]"
                disabled={
                  dw.disableActions ||
                  dw.regenerateBusy ||
                  dw.resetDigestBusy ||
                  saving ||
                  persistDigestPlaceholder
                }
                onClick={() => void Promise.resolve(dw.onResetDigestOutput())}
              >
                {dw.resetDigestBusy ? "Removing…" : "Reset text"}
              </Button>
            ) : null}
            {showPostInActionsFooter ? (
              <Button
                type="button"
                className="h-10 min-h-10 px-5 text-sm font-semibold shadow-sm"
                disabled={publishing || (!postToX && !postToBluesky)}
                onClick={() => void publishToPlatforms()}
              >
                {publishing ? "Posting…" : "Post"}
              </Button>
            ) : null}
            {showInlineSaveButton ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void saveEdits()}
                disabled={saving}
                className="h-10 min-h-10 px-5 text-sm font-semibold"
              >
                {saving ? "Saving…" : "Save all changes"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
