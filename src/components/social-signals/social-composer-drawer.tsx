"use client";

import { useMemo, useState } from "react";
import type {
  Audience,
  CtaKind,
  PublishPlatform,
  Tone,
} from "@/lib/social-signals/workspace-types";
import { BLUESKY_CHAR_LIMIT, X_CHAR_LIMIT } from "@/lib/social-signals/workspace-types";
import { DEMO_SIGNAL_OPTIONS } from "@/lib/social-signals/workspace-demo-data";
import { PlatformBadge } from "./platform-badge";

const AUDIENCES: { id: Audience; label: string }[] = [
  { id: "public", label: "Public" },
  { id: "scientific", label: "Scientific" },
  { id: "donor_facing", label: "Donor-facing" },
  { id: "internal", label: "Internal" },
  { id: "trainee", label: "Trainee" },
];

const TONES: { id: Tone; label: string }[] = [
  { id: "professional", label: "Professional" },
  { id: "celebratory", label: "Celebratory" },
  { id: "plain_language", label: "Plain-language" },
  { id: "punchy", label: "Punchy" },
  { id: "institutional", label: "Institutional" },
];

const CTAS: { id: CtaKind; label: string }[] = [
  { id: "read_more", label: "Read more" },
  { id: "register", label: "Register" },
  { id: "apply", label: "Apply" },
  { id: "congratulate", label: "Congratulate" },
  { id: "learn_more", label: "Learn more" },
  { id: "share", label: "Share" },
];

export function SocialComposerDrawer({
  open,
  onClose,
  initialPlatform = "bluesky",
}: {
  open: boolean;
  onClose: () => void;
  initialPlatform?: PublishPlatform;
}) {
  const [platform, setPlatform] = useState<PublishPlatform>(initialPlatform);
  const [secondaryDraftPlatform, setSecondaryDraftPlatform] = useState<PublishPlatform | null>(null);
  const [signalId, setSignalId] = useState<string>(DEMO_SIGNAL_OPTIONS[0]!.id);
  const [audience, setAudience] = useState<Audience>("scientific");
  const [tone, setTone] = useState<Tone>("professional");
  const [lengthPct, setLengthPct] = useState(40);
  const [cta, setCta] = useState<CtaKind>("read_more");
  const [text, setText] = useState(
    "New research signal: regulatory T cells are being explored as a targeted strategy to reduce autoimmune pressure on insulin-producing cells in type 1 diabetes — early-stage science with clear mechanistic rationale.",
  );
  const [altText, setAltText] = useState("Editorial schematic suggesting immune regulation near pancreatic islets.");
  const [threadMode, setThreadMode] = useState(false);

  const limit = platform === "x" ? X_CHAR_LIMIT : BLUESKY_CHAR_LIMIT;
  const over = text.length > limit;

  const hashtags = useMemo(() => ["#UCSF", "#Immunology", "#T1D"].join(" "), []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[2px]" role="dialog" aria-modal aria-labelledby="composer-title">
      <button type="button" className="h-full min-w-0 flex-1 cursor-default" aria-label="Close composer backdrop" onClick={onClose} />
      <div className="flex h-full w-full max-w-lg flex-col border-l border-[color:var(--border)]/80 bg-[color:var(--background)] shadow-[0_0_60px_-20px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between gap-2 border-b border-[color:var(--border)]/60 px-4 py-3">
          <h2 id="composer-title" className="text-base font-semibold text-[color:var(--foreground)]">
            Composer
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[color:var(--border)]/70 px-2.5 py-1 text-xs font-semibold text-[color:var(--foreground)]"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">
            Source signal
            <select
              value={signalId}
              onChange={(e) => setSignalId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--card)]/95 px-3 py-2 text-sm text-[color:var(--foreground)]"
            >
              {DEMO_SIGNAL_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Platform</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["x", "bluesky"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    platform === p
                      ? "border-[color:var(--accent)]/50 bg-[color:var(--accent)]/12 text-[color:var(--foreground)]"
                      : "border-[color:var(--border)]/70 bg-[color:var(--card)]/90 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                  }`}
                >
                  <span className="mr-2 inline-flex align-middle">
                    <PlatformBadge platform={p} size="xs" />
                  </span>
                  {p === "x" ? "X" : "Bluesky"}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-[color:var(--muted-foreground)]">
              LinkedIn: coming soon — publishing disabled.
            </p>
          </div>

          <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">
            Audience
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience)}
              className="mt-1 w-full rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--card)]/95 px-3 py-2 text-sm"
            >
              {AUDIENCES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">
            Tone
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as Tone)}
              className="mt-1 w-full rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--card)]/95 px-3 py-2 text-sm"
            >
              {TONES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">
            Length: {lengthPct < 33 ? "Short" : lengthPct < 66 ? "Medium" : "Long"}
            <input
              type="range"
              min={0}
              max={100}
              value={lengthPct}
              onChange={(e) => setLengthPct(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </label>

          <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">
            CTA
            <select
              value={cta}
              onChange={(e) => setCta(e.target.value as CtaKind)}
              className="mt-1 w-full rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--card)]/95 px-3 py-2 text-sm"
            >
              {CTAS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">
            Post text
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              className="mt-1 w-full resize-y rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--card)]/95 px-3 py-2 text-sm leading-relaxed text-[color:var(--foreground)]"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className={over ? "font-semibold text-red-600 dark:text-red-400" : "text-[color:var(--muted-foreground)]"}>
              {text.length}/{limit} characters ({platform === "x" ? "X" : "Bluesky"})
            </span>
            {platform === "bluesky" ? (
              <span className="text-[color:var(--muted-foreground)]">Alt text strongly recommended for images.</span>
            ) : null}
          </div>

          <div>
            <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Suggested hashtags</p>
            <p className="mt-1 rounded-xl border border-[color:var(--border)]/60 bg-[color:var(--muted)]/15 px-3 py-2 text-xs text-sky-800 dark:text-sky-200">{hashtags}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Image prompt / illustration suggestion</p>
            <p className="mt-1 rounded-xl border border-dashed border-[color:var(--border)]/70 bg-[color:var(--muted)]/12 px-3 py-2 text-[11px] leading-relaxed text-[color:var(--muted-foreground)]">
              BioRender-inspired schematic: Treg modulation near islets; muted blues/sand; no logos.
            </p>
          </div>

          <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">
            Alt text
            <textarea
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--card)]/95 px-3 py-2 text-sm"
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-[color:var(--foreground)]">
            <input type="checkbox" checked={threadMode} onChange={(e) => setThreadMode(e.target.checked)} className="rounded border-[color:var(--border)]" />
            Thread mode
          </label>

          <div className="rounded-xl border border-[color:var(--border)]/60 bg-[color:var(--muted)]/12 px-3 py-2 text-[11px] text-[color:var(--muted-foreground)]">
            Adapt for the other platform:{" "}
            <button
              type="button"
              className="font-semibold text-[color:var(--foreground)] underline underline-offset-2"
              onClick={() => setSecondaryDraftPlatform(platform === "x" ? "bluesky" : "x")}
            >
              Prep {platform === "x" ? "Bluesky" : "X"} variant from this copy
            </button>
            {secondaryDraftPlatform ? (
              <span className="ml-2 text-emerald-700 dark:text-emerald-400">Draft slot ready ({secondaryDraftPlatform})</span>
            ) : null}
          </div>
        </div>

        <div className="border-t border-[color:var(--border)]/60 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                "Generate X post",
                "Generate Bluesky post",
                "Generate both",
                "Create X thread",
                "Create Bluesky thread",
                "Regenerate",
                "Variations",
                "Save draft",
                "Send for review",
                "Schedule",
                "Publish to X",
                "Publish to Bluesky",
              ] as const
            ).map((label) => {
              const needsApi =
                label.startsWith("Publish") ||
                label.includes("Generate") ||
                label.includes("Regenerate") ||
                label.includes("Variations") ||
                label.includes("thread");
              return (
                <button
                  key={label}
                  type="button"
                  disabled={needsApi}
                  className="rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--card)]/95 px-2.5 py-1.5 text-[11px] font-semibold text-[color:var(--foreground)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-[color:var(--muted-foreground)]">
            Generate / publish actions require API wiring. Edit text locally; validation reflects platform limits.
          </p>
        </div>
      </div>
    </div>
  );
}
