"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Summary } from "@/types/database";
import {
  parseBlurbJson,
  stringifyBlurbContent,
  type BlurbContent,
} from "@/lib/blurb-content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

/** Fold legacy `why_it_matters` into `blurb` so the UI is one paragraph (no label). */
function mergeWhyIntoBlurb(c: BlurbContent): BlurbContent {
  const b = c.blurb?.trim() ?? "";
  const w = c.why_it_matters?.trim() ?? "";
  if (!w) return { ...c, blurb: b, why_it_matters: "" };
  const merged = b ? `${b.trimEnd()} ${w}` : w;
  return { ...c, blurb: merged, why_it_matters: "" };
}

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

export function SummaryEditor({
  summary,
  onSaved,
}: {
  summary: Summary;
  onSaved: () => Promise<void>;
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
  const [lengthDeltaWords, setLengthDeltaWords] = useState(0); // negative shorter, positive longer
  const [adjusting, setAdjusting] = useState(false);
  const [chatPrompt, setChatPrompt] = useState("");
  const [chatting, setChatting] = useState(false);

  useEffect(() => {
    const raw = summary.edited_text ?? summary.generated_text;
    const p = parseBlurbJson(raw);
    setContent(
      mergeWhyIntoBlurb(
        p ?? { headline: "", blurb: raw, why_it_matters: "", confidence_notes: "" },
      ),
    );
    setChatPrompt("");
    setLengthDeltaWords(0);
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

  async function adjustLength() {
    const base = summaryBody().trim();
    if (!base) {
      toast.error("Nothing to adjust yet");
      return;
    }
    const current = wordCount(base);
    const targetWords = Math.max(15, Math.min(400, current + lengthDeltaWords));

    setAdjusting(true);
    try {
      const res = await fetch("/api/adjust-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: base,
          target_words: targetWords,
          // Keep style/model implicit for now; endpoint is generic.
        }),
      });
      const data = (await res.json()) as { error?: string; text?: string };
      if (!res.ok || !data.text) {
        throw new Error(data.error ?? "Adjust failed");
      }
      applySummaryBody(data.text);
      toast.success("Adjusted");
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

  return (
    <Card className="text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium capitalize">{summary.style}</span>
        <span className="text-xs text-[color:var(--muted-foreground)]">
          {summary.model_name ?? "model"} · {new Date(summary.created_at).toLocaleString()}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-[color:var(--muted-foreground)]">
          {wordCount(
            `${content.headline} ${summaryBody()}`.trim(),
          )}{" "}
          words
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="surface-subtle flex items-center gap-2 rounded-full px-2 py-1">
            <span className="text-[11px] font-medium text-[color:var(--muted-foreground)]">
              Length
            </span>
            <input
              type="range"
              min={-40}
              max={40}
              step={5}
              value={lengthDeltaWords}
              onChange={(e) => setLengthDeltaWords(Number(e.target.value))}
              className="h-0.5 w-24 accent-[color:var(--accent)]"
              aria-label="Adjust summary length in words"
            />
            <Button
              type="button"
              variant="secondary"
              className="h-7 px-2 py-0 text-xs"
              onClick={adjustLength}
              disabled={adjusting}
              title="Rewrite to target length"
            >
              {adjusting ? "…" : "Apply"}
            </Button>
          </div>
          <Button type="button" variant="ghost" onClick={copyText}>
            <span className="inline-flex items-center gap-1.5">
              <CopyIcon className="h-4 w-4" />
              Copy
            </span>
          </Button>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div>
          <Label>Headline</Label>
          <Input
            className="mt-1"
            value={content.headline}
            onChange={(e) => setContent({ ...content, headline: e.target.value })}
          />
        </div>
        <div>
          <Label>Summary</Label>
          <Textarea
            className="mt-1 min-h-[176px]"
            value={summaryBody()}
            onChange={(e) => applySummaryBody(e.target.value)}
          />
        </div>
        <div className="surface-subtle rounded-[1rem] p-3">
          <p className="text-xs font-medium text-[color:var(--foreground)]">Agent chat</p>
          <div className="mt-1.5 flex gap-2">
            <Input
              className="h-8 flex-1 text-sm"
              value={chatPrompt}
              onChange={(e) => setChatPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void askAgent();
                }
              }}
              placeholder="e.g. punchier, shorter, less jargon…"
              aria-label="Instruction for the agent"
            />
            <Button
              type="button"
              variant="secondary"
              className="h-8 shrink-0 px-3 text-xs"
              onClick={() => void askAgent()}
              disabled={chatting}
            >
              {chatting ? "…" : "Apply"}
            </Button>
          </div>
        </div>
        <div>
          <p className="text-xs italic text-[color:var(--muted-foreground)]">
            Confidence notes (from the draft, read-only)
          </p>
          <p className="mt-1 rounded-xl border border-transparent bg-[color:var(--muted)]/55 px-3 py-2 text-sm text-[color:var(--foreground)]/90">
            {content.confidence_notes?.trim()
              ? content.confidence_notes
              : "—"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={saveEdits} disabled={saving}>
            Save edits
          </Button>
        </div>
      </div>
    </Card>
  );
}
