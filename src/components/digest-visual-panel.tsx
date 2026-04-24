"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { DigestVisualBundle, DigestVisualCandidate, VisualCandidateType } from "@/lib/digest-visual-types";
import { activeVisualImageDataUrl, getActiveCandidate } from "@/lib/digest-visual-types";

type VisualTab = "source" | "schematic" | "stock";

function typeLabel(t: VisualCandidateType): string {
  switch (t) {
    case "source":
      return "Source";
    case "schematic":
      return "Illustration";
    case "stock":
      return "Stock";
    case "abstract":
    default:
      return "AI";
  }
}

function rightsLabel(r: DigestVisualCandidate["rights"]): string {
  switch (r) {
    case "open_access":
      return "Open access / PMC";
    case "verify":
      return "Needs verification";
    case "unknown":
    default:
      return "Unknown";
  }
}

function mapTypeToTab(t: VisualCandidateType): VisualTab {
  if (t === "source") return "source";
  if (t === "stock") return "stock";
  return "schematic";
}

function tabLabel(tab: VisualTab): string {
  if (tab === "source") return "Source";
  if (tab === "stock") return "Stock";
  return "Illustration";
}

function selectedVisualDescriptor(candidate: DigestVisualCandidate): string {
  if (candidate.type === "source") return "Image from source material";
  if (candidate.type === "stock") return "Stock-style editorial visual";
  return "AI-generated scientific schematic";
}

function sortCandidates(candidates: DigestVisualCandidate[]): DigestVisualCandidate[] {
  const order: VisualCandidateType[] = ["source", "schematic", "stock", "abstract"];
  return [...candidates].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}

function CandidateCard({
  candidate,
  selected,
  onSelect,
  onPreview,
}: {
  candidate: DigestVisualCandidate;
  selected: boolean;
  onSelect: () => void;
  onPreview: () => void;
}) {
  const src = activeVisualImageDataUrl(candidate);
  return (
    <div
      className={`overflow-hidden rounded-xl border bg-[color:var(--card)]/95 shadow-sm transition-all ${
        selected
          ? "border-[color:var(--accent)]/75 ring-2 ring-[color:var(--accent)]/30"
          : "border-[color:var(--border)]/70 hover:border-[color:var(--accent)]/40"
      }`}
    >
      <button type="button" onClick={onPreview} className="block w-full text-left" title="Preview larger">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-[color:var(--muted)]/30">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="h-full w-full object-cover object-center" />
          ) : (
            <div className="flex h-full items-center justify-center p-2 text-center text-[10px] text-[color:var(--muted-foreground)]">
              No image
            </div>
          )}
        </div>
      </button>
      <div className="space-y-2 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex rounded-md border border-[color:var(--border)]/75 bg-[color:var(--muted)]/30 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--foreground)]">
            {typeLabel(candidate.type)}
          </span>
          <div className="flex gap-1.5">
            <Button type="button" className="h-7 px-2 text-[10px]" onClick={onSelect} disabled={selected}>
              {selected ? "Selected" : "Select"}
            </Button>
            <Button type="button" variant="secondary" className="h-7 px-2 text-[10px]" onClick={onPreview}>
              Preview
            </Button>
          </div>
        </div>
        <details className="text-[10px] text-[color:var(--muted-foreground)]">
          <summary className="cursor-pointer select-none">Details</summary>
          <p className="mt-1 line-clamp-2">{candidate.rationale}</p>
          <p className="mt-1">{rightsLabel(candidate.rights)}</p>
        </details>
      </div>
    </div>
  );
}

export function DigestVisualPanel({
  sourceItemId,
  bundle,
  busy,
  onStarted,
  onComplete,
  disabled,
}: {
  sourceItemId: string;
  bundle: DigestVisualBundle | null;
  busy: boolean;
  onStarted: () => void;
  onComplete: () => void;
  disabled: boolean;
}) {
  const [preview, setPreview] = useState<DigestVisualCandidate | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<VisualTab>("schematic");
  const [optimisticSelectedId, setOptimisticSelectedId] = useState<string | null>(null);
  const [localBundle, setLocalBundle] = useState<DigestVisualBundle | null>(bundle);

  useEffect(() => {
    setLocalBundle(bundle);
  }, [bundle]);

  async function api(
    action: "refresh_all" | "select" | "clear_ai" | "discover_source" | "generate_illustration",
    extra?: { candidate_id?: string },
  ) {
    setActionBusy(action);
    onStarted();
    try {
      const body: Record<string, unknown> = { action, source_item_id: sourceItemId };
      if (extra?.candidate_id) {
        if (action === "select") body.candidate_id = extra.candidate_id;
      }
      const res = await fetch("/api/digest-visuals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string; bundle?: DigestVisualBundle | null };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      if ("bundle" in data) {
        setLocalBundle(data.bundle ?? null);
      }
      onComplete();
      if (action === "select") toast.success("Visual selected for digest");
      else if (action === "clear_ai") toast.success("AI-generated images cleared");
      else if (action === "discover_source") toast.success("Source images updated");
      else if (action === "generate_illustration") toast.success("Illustration options updated");
      else toast.success("Visual options updated");
    } catch (e) {
      if (action === "select") setOptimisticSelectedId(null);
      toast.error(e instanceof Error ? e.message : "Visual request failed");
    } finally {
      setActionBusy(null);
    }
  }

  const effectiveBundle = localBundle;
  const working = busy || actionBusy != null;
  const sorted = effectiveBundle ? sortCandidates(effectiveBundle.candidates) : [];
  const sourceCandidates = sorted.filter((c) => mapTypeToTab(c.type) === "source");
  const schematicCandidates = sorted.filter((c) => mapTypeToTab(c.type) === "schematic");
  const stockCandidates = sorted.filter((c) => mapTypeToTab(c.type) === "stock");
  const hasAiCandidates = sorted.some((c) => c.aiGenerated);
  const selectedId = optimisticSelectedId ?? effectiveBundle?.selectedId ?? null;
  const active =
    effectiveBundle?.candidates.find((c) => c.id === selectedId) ??
    getActiveCandidate(effectiveBundle);
  const activeSrc = activeVisualImageDataUrl(active);
  const tabCandidates =
    activeTab === "source" ? sourceCandidates : activeTab === "stock" ? stockCandidates : schematicCandidates;

  useEffect(() => {
    if (optimisticSelectedId && effectiveBundle?.selectedId === optimisticSelectedId) {
      setOptimisticSelectedId(null);
    }
  }, [effectiveBundle?.selectedId, optimisticSelectedId]);

  useEffect(() => {
    if (!preview) return;
    const stillExists = sorted.some((candidate) => candidate.id === preview.id);
    if (!stillExists) setPreview(null);
  }, [preview, sorted]);

  useEffect(() => {
    if (!selectorOpen) return;
    if (sourceCandidates.length > 0) setActiveTab("source");
    else if (schematicCandidates.length > 0) setActiveTab("schematic");
    else setActiveTab("stock");
  }, [selectorOpen, sourceCandidates.length, schematicCandidates.length]);

  return (
    <div className="space-y-4">
      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal
          onClick={() => setPreview(null)}
        >
          <div
            className="max-h-[90vh] max-w-4xl overflow-auto rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {activeVisualImageDataUrl(preview) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeVisualImageDataUrl(preview)!}
                alt=""
                className="max-h-[80vh] w-auto max-w-full object-contain"
              />
            ) : null}
            <p className="mt-2 text-sm text-[color:var(--foreground)]">{preview.provenance}</p>
            <p className="text-xs text-[color:var(--muted-foreground)]">{preview.rationale}</p>
            <div className="mt-2 flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setPreview(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-[color:var(--border)]/55 bg-[color:var(--card)]/92 p-3 shadow-[0_8px_18px_-18px_rgba(40,22,16,0.7)]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--muted-foreground)]">Selected for Digest</p>
          </div>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="secondary"
              className="h-7 px-2 text-[11px]"
              disabled={disabled || working}
              onClick={() => setSelectorOpen((v) => !v)}
            >
              Choose image
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-7 px-2 text-[11px]"
              disabled={!active}
              onClick={() => active && setPreview(active)}
            >
              Expand
            </Button>
          </div>
        </div>
        {activeSrc ? (
          <div className="mt-2 overflow-hidden rounded-lg border border-[color:var(--border)]/50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeSrc} alt="" className="max-h-52 w-full object-cover object-center" />
          </div>
        ) : (
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">No visual selected. Run options below and pick a candidate.</p>
        )}
        {active ? (
          <p className="mt-2 text-[10px] text-[color:var(--muted-foreground)]">
            <span className="font-medium text-[color:var(--foreground)]">{typeLabel(active.type)}</span> · {selectedVisualDescriptor(active)}
          </p>
        ) : null}
        <p className="mt-1 text-[10px] text-[color:var(--muted-foreground)]">
          {active ? `Rights: ${rightsLabel(active.rights)}` : "Rights and provenance appear after selection."}
        </p>
      </div>

      {!effectiveBundle || effectiveBundle.candidates.length === 0 ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">
          No candidates yet. Use Choose image.
        </p>
      ) : selectorOpen ? (
        <div className="rounded-xl border border-[color:var(--border)]/50 bg-[color:var(--muted)]/5 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[color:var(--foreground)]">Choose image</p>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="secondary"
                className="h-7 px-2 text-[11px]"
                disabled={disabled || working || !hasAiCandidates}
                onClick={() => void api("clear_ai")}
              >
                {actionBusy === "clear_ai" ? "Clearing…" : "Clear AI images"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-7 px-2 text-[11px]"
                disabled={disabled || working}
                onClick={() => void api("refresh_all")}
              >
                {actionBusy === "refresh_all" ? "Refreshing…" : "Refresh options"}
              </Button>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(["source", "schematic", "stock"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  if (tab === "source" && sourceCandidates.length === 0) {
                    void api("discover_source");
                  } else if (tab === "schematic" && schematicCandidates.length === 0) {
                    void api("generate_illustration");
                  }
                }}
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  tab === activeTab
                    ? "border-[color:var(--accent)]/60 bg-[color:var(--accent)]/12 text-[color:var(--foreground)]"
                    : "border-[color:var(--border)]/70 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                }`}
              >
                {tabLabel(tab)}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {tabCandidates.length === 0 ? (
              <p className="text-sm text-[color:var(--muted-foreground)]">
                {activeTab === "stock" ? "Stock image options are coming soon." : "No options in this tab yet."}
              </p>
            ) : (
              tabCandidates.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  selected={selectedId === candidate.id}
                  onPreview={() => setPreview(candidate)}
                  onSelect={() => {
                    setOptimisticSelectedId(candidate.id);
                    void api("select", { candidate_id: candidate.id });
                  }}
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
