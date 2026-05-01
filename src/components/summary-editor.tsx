"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Summary } from "@/types/database";
import {
  mergeWhyIntoBlurb,
  parseBlurbJson,
  stringifyBlurbContent,
  type BlurbContent,
} from "@/lib/blurb-content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

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

/** Three editorial length targets (word delta from current body). */
const LENGTH_TIERS = [
  { id: 0, label: "Short", delta: -45 },
  { id: 1, label: "Medium", delta: 0 },
  { id: 2, label: "Long", delta: 45 },
] as const;

export function SummaryEditor({
  summary,
  onSaved,
  variant = "default",
  onRequestClose,
}: {
  summary: Summary;
  onSaved: () => Promise<void>;
  /** Tighter layout for digest queue (no heavy card chrome). */
  variant?: "default" | "embedded";
  /** When set, shows “Hide editor” as secondary action (digest queue). */
  onRequestClose?: () => void;
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
  const [lengthTier, setLengthTier] = useState<0 | 1 | 2>(1);
  const [adjusting, setAdjusting] = useState(false);
  const [chatPrompt, setChatPrompt] = useState("");
  const [chatting, setChatting] = useState(false);
  const hasSavedEdits = Boolean(summary.edited_text?.trim());

  useEffect(() => {
    const raw = summary.edited_text ?? summary.generated_text;
    const p = parseBlurbJson(raw);
    setContent(
      mergeWhyIntoBlurb(
        p ?? { headline: "", blurb: raw, why_it_matters: "", confidence_notes: "" },
      ),
    );
    setChatPrompt("");
    setLengthTier(1);
  }, [summary]);

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
    const t = s.trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
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

  async function applyLengthFromTier() {
    const base = summaryBody().trim();
    if (!base) {
      toast.error("Nothing to adjust yet");
      return;
    }
    const current = wordCount(base);
    const delta = LENGTH_TIERS[lengthTier].delta;
    const targetWords = Math.max(15, Math.min(400, current + delta));

    setAdjusting(true);
    try {
      const res = await fetch("/api/adjust-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: base,
          target_words: targetWords,
        }),
      });
      const data = (await res.json()) as { error?: string; text?: string };
      if (!res.ok || !data.text) {
        throw new Error(data.error ?? "Adjust failed");
      }
      applySummaryBody(data.text);
      toast.success("Length applied");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Adjust failed");
    } finally {
      setAdjusting(false);
    }
  }

  async function askAgent() {
    const instruction = chatPrompt.trim();
    if (!instruction) return;
    setChatting(true);
    try {
      const res = await fetch("/api/blurb-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          instruction,
        }),
      });
      const data = (await res.json()) as { error?: string; content?: BlurbContent };
      if (!res.ok || !data.content) {
        throw new Error(data.error ?? "Request failed");
      }
      setContent(mergeWhyIntoBlurb(data.content));
      setChatPrompt("");
      toast.success("Applied");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Agent request failed");
    } finally {
      setChatting(false);
    }
  }

  const embedded = variant === "embedded";

  const body = (
    <div className={`w-full min-w-0 space-y-4 text-sm ${embedded ? "" : "rounded-2xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/95 p-4 sm:p-5 shadow-sm"}`}>
      {!embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--muted-foreground)]">
          <span className="font-medium capitalize text-[color:var(--foreground)]">{summary.style}</span>
          <span>
            {summary.model_name ?? "model"} · {new Date(summary.created_at).toLocaleString()}
          </span>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-[color:var(--foreground)]/90">Headline</Label>
        <Input
          className="w-full min-w-0 border-[color:var(--border)]/80 bg-[color:var(--background)]/95"
          value={content.headline}
          onChange={(e) => setContent({ ...content, headline: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-[color:var(--foreground)]/90">Summary</Label>
        <Textarea
          className="min-h-[168px] w-full min-w-0 box-border border-[color:var(--border)]/80 bg-[color:var(--background)]/95"
          value={summaryBody()}
          onChange={(e) => applySummaryBody(e.target.value)}
        />
      </div>

      <div className="rounded-xl border border-[color:var(--border)]/55 bg-[color:var(--muted)]/12 px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--muted-foreground)]">
          Length
        </p>
        <div className="mt-3 px-1">
          <input
            type="range"
            min={0}
            max={2}
            step={1}
            value={lengthTier}
            onChange={(e) => setLengthTier(Number(e.target.value) as 0 | 1 | 2)}
            className="editorial-length-slider h-2 w-full cursor-pointer appearance-none rounded-full bg-[color:var(--border)]/60 accent-[color:var(--accent)]"
            aria-valuetext={LENGTH_TIERS[lengthTier].label}
            aria-label="Editorial length: Short, Medium, or Long"
          />
          <div className="mt-2 flex justify-between text-[11px] font-medium">
            {LENGTH_TIERS.map((tier) => (
              <span
                key={tier.id}
                className={
                  lengthTier === tier.id
                    ? "text-[color:var(--foreground)]"
                    : "text-[color:var(--muted-foreground)]/80"
                }
              >
                {tier.label}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-8 px-3 text-xs"
            onClick={() => void applyLengthFromTier()}
            disabled={adjusting || !summaryBody().trim()}
          >
            {adjusting ? "Applying…" : "Apply length"}
          </Button>
          <span className="text-[11px] text-[color:var(--muted-foreground)]">
            {wordCount(`${content.headline} ${summaryBody()}`.trim())} words
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-[color:var(--foreground)]/90">Adjust with AI</Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            className="h-9 flex-1 border-[color:var(--border)]/80 bg-[color:var(--background)]/95 text-sm"
            value={chatPrompt}
            onChange={(e) => setChatPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void askAgent();
              }
            }}
            placeholder="e.g. punchier, shorter, less jargon…"
            aria-label="Instruction for AI refinement"
          />
          <Button
            type="button"
            variant="secondary"
            className="h-9 shrink-0 px-4 text-xs sm:w-auto"
            onClick={() => void askAgent()}
            disabled={chatting || !chatPrompt.trim()}
          >
            {chatting ? "Applying…" : "Apply"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--border)]/40 pt-4">
        <Button type="button" onClick={() => void saveEdits()} disabled={saving} className="h-9 px-4 text-sm">
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {onRequestClose ? (
          <Button type="button" variant="secondary" className="h-9 px-3 text-sm" onClick={onRequestClose}>
            Hide editor
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          title="Copy summary"
          aria-label="Copy summary"
          className="h-9 w-9 shrink-0 p-0 text-[color:var(--muted-foreground)]"
          onClick={copyText}
        >
          <CopyIcon className="mx-auto h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return body;
}
