"use client";

import { useState } from "react";
import type { WorkspaceAsset } from "@/lib/social-signals/workspace-types";
const KIND_LABEL: Record<WorkspaceAsset["kind"], string> = {
  logo: "Logo",
  pi_photo: "PI / lab image",
  illustration: "Illustration",
  boilerplate: "Boilerplate",
  hashtag_bank: "Hashtag bank",
  cta_snippet: "CTA snippet",
  funder_ack: "Funder acknowledgement",
  alt_text_snippet: "Alt text snippet",
  image_prompt: "Image prompt",
};

export function AssetLibraryPanel({ initialAssets }: { initialAssets: WorkspaceAsset[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyAsset(a: WorkspaceAsset) {
    const text = a.body ?? a.usageNotes;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(a.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {initialAssets.map((a) => (
        <article key={a.id} className="flex flex-col rounded-2xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/92 p-4 shadow-[0_10px_26px_-22px_rgba(38,24,17,0.5)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[color:var(--foreground)]">{a.name}</h3>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">{KIND_LABEL[a.kind]}</p>
            </div>
            {a.previewHint ? (
              <span className="rounded-lg bg-[color:var(--muted)]/35 px-2 py-1 text-[10px] font-medium text-[color:var(--muted-foreground)]">{a.previewHint}</span>
            ) : null}
          </div>
          {a.campaign ? <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">Campaign: {a.campaign}</p> : null}
          <p className="mt-2 flex-1 text-xs leading-relaxed text-[color:var(--muted-foreground)]">{a.usageNotes}</p>
          {a.body ? (
            <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-lg border border-[color:var(--border)]/50 bg-[color:var(--background)]/95 p-2 text-[11px] text-[color:var(--foreground)]">
              {a.body}
            </pre>
          ) : (
            <div className="mt-2 flex min-h-[4rem] items-center justify-center rounded-lg border border-dashed border-[color:var(--border)]/65 bg-[color:var(--muted)]/10 text-[11px] text-[color:var(--muted-foreground)]">
              Preview thumbnail — upload pipeline not wired
            </div>
          )}
          <button
            type="button"
            onClick={() => void copyAsset(a)}
            className="mt-3 rounded-lg bg-[color:var(--foreground)] px-3 py-2 text-xs font-semibold text-[color:var(--background)]"
          >
            {copied === a.id ? "Copied" : "Copy / use"}
          </button>
        </article>
      ))}
    </div>
  );
}
