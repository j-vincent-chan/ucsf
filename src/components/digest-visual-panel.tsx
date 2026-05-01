"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DigestImageEditorModal, type EditorToolTab } from "@/components/digest-image-editor-modal";
import type { DigestVisualEditMetadata } from "@/lib/digest-visual-types";
import type { DigestVisualBundle, DigestVisualCandidate, VisualCandidateType } from "@/lib/digest-visual-types";
import { activeVisualImageDataUrl, getActiveCandidate } from "@/lib/digest-visual-types";
import { userFacingDbStatementTimeoutMessage } from "@/lib/db-timeout-message";

type VisualTab = "source" | "schematic" | "stock";

function typeLabel(t: VisualCandidateType): string {
  switch (t) {
    case "source":
      return "Source";
    case "schematic":
      return "Illustration";
    case "stock":
      return "Photo";
    case "abstract":
    default:
      return "Illustration";
  }
}

function rightsLine(r: DigestVisualCandidate["rights"], source: boolean): string {
  switch (r) {
    case "open_access":
      return source ? "Rights: Source-provided (open access — verify reuse)" : "Rights: Source-provided";
    case "verify":
      return "Rights: Needs verification";
    case "unknown":
    default:
      return "Rights: Unknown";
  }
}

function mapTypeToTab(t: VisualCandidateType): VisualTab {
  if (t === "source") return "source";
  if (t === "stock") return "stock";
  return "schematic";
}

function tabLabel(tab: VisualTab): string {
  if (tab === "source") return "Source";
  if (tab === "stock") return "Photos";
  return "Illustration";
}

function selectedKindLine(candidate: DigestVisualCandidate): string {
  const edited =
    Boolean(candidate.editedFromId) ||
    Boolean(candidate.editOriginal) ||
    Boolean(candidate.editMetadata);
  if (candidate.type === "source") return edited ? "Edited source image" : "Source image";
  if (candidate.type === "stock") return edited ? "Edited photo-style visual" : "Photo-style visual";
  return edited ? "Edited AI-generated illustration" : "AI-generated illustration";
}

function selectedKindDetail(candidate: DigestVisualCandidate): string {
  if (candidate.type === "source") {
    return "From source page. Verify rights before use.";
  }
  if (candidate.type === "stock") {
    return "Verify license and source before publication.";
  }
  return "Generated with the digest illustration prompt from ingested research content. Review for scientific accuracy.";
}

function sortCandidates(candidates: DigestVisualCandidate[]): DigestVisualCandidate[] {
  const order: VisualCandidateType[] = ["source", "schematic", "stock", "abstract"];
  return [...candidates].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

function ClipboardCopyIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
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

async function copyDigestVisualCandidate(candidate: DigestVisualCandidate): Promise<void> {
  try {
    if (candidate.kind === "url" && candidate.url?.trim()) {
      await navigator.clipboard.writeText(candidate.url.trim());
      toast.success("Image link copied");
      return;
    }
    if (
      candidate.kind === "inline" &&
      candidate.base64 &&
      candidate.mime?.startsWith("image/")
    ) {
      const bin = atob(candidate.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: candidate.mime });
      await navigator.clipboard.write([new ClipboardItem({ [candidate.mime]: blob })]);
      toast.success("Image copied");
      return;
    }
    toast.error("Nothing to copy");
  } catch {
    toast.error("Copy failed");
  }
}

function PreviewIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CandidateCard({
  candidate,
  selected,
  onSelect,
  onPreview,
  canDiscard,
  onDiscard,
  discardBusy,
}: {
  candidate: DigestVisualCandidate;
  selected: boolean;
  onSelect: () => void;
  onPreview: () => void;
  canDiscard?: boolean;
  onDiscard?: () => void;
  discardBusy?: boolean;
}) {
  const src = activeVisualImageDataUrl(candidate);
  return (
    <div
      className={`overflow-hidden rounded-lg border transition-all ${
        selected
          ? "border-[color:var(--accent)]/55 bg-[color:var(--accent)]/6 ring-1 ring-[color:var(--accent)]/25"
          : "border-[color:var(--border)]/50 bg-[color:var(--background)]/70 hover:border-[color:var(--border)]/80"
      }`}
    >
      <div className="relative aspect-video w-full min-w-0 overflow-hidden bg-[#faf6ef]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="box-border h-full w-full object-contain object-center"
            decoding="async"
          />
        ) : (
          <div className="flex min-h-[5.5rem] w-full items-center justify-center p-2 text-center text-[10px] text-[color:var(--muted-foreground)]">
            No image
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[color:var(--muted-foreground)]">
            {typeLabel(candidate.type)}
          </span>
          {candidate.editedFromId || candidate.editOriginal || candidate.editMetadata ? (
            <span className="rounded bg-[color:var(--accent)]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[color:var(--foreground)]">
              Edited
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {selected ? (
            <span className="rounded-md bg-[color:var(--accent)]/18 px-2 py-1 text-[10px] font-semibold text-[color:var(--foreground)]">
              Selected
            </span>
          ) : (
            <Button type="button" className="h-8 px-2.5 text-[11px]" onClick={onSelect}>
              Select
            </Button>
          )}
          <button
            type="button"
            title="Preview"
            aria-label="Preview image"
            onClick={onPreview}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:var(--border)]/50 text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)]"
          >
            <PreviewIcon />
          </button>
          {canDiscard && onDiscard ? (
            <button
              type="button"
              title="Remove this option"
              aria-label="Remove candidate"
              disabled={discardBusy}
              onClick={(e) => {
                e.stopPropagation();
                onDiscard();
              }}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:var(--border)]/50 text-[color:var(--muted-foreground)] transition-colors hover:border-[#b95d54]/45 hover:bg-[#f2dfd9]/80 hover:text-[#8f4d45] disabled:opacity-40"
            >
              <TrashIcon />
            </button>
          ) : null}
        </div>
      </div>
      {selected ? (
        <details className="border-t border-[color:var(--border)]/40 px-2 py-1.5 text-[10px] text-[color:var(--muted-foreground)]">
          <summary className="cursor-pointer select-none font-medium text-[color:var(--foreground)]/80">Details</summary>
          <p className="mt-1 line-clamp-3">{candidate.rationale}</p>
        </details>
      ) : null}
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
  digestQueueLayout = false,
}: {
  sourceItemId: string;
  bundle: DigestVisualBundle | null;
  busy: boolean;
  onStarted: () => void;
  onComplete: () => void;
  disabled: boolean;
  /** When true (expanded digest card), show acquisition modes and candidates without folding behind “Choose image”. */
  digestQueueLayout?: boolean;
}) {
  const [imageEditor, setImageEditor] = useState<{
    candidate: DigestVisualCandidate;
    initialMode: EditorToolTab;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(digestQueueLayout);
  const [activeTab, setActiveTab] = useState<VisualTab>("schematic");
  const [optimisticSelectedId, setOptimisticSelectedId] = useState<string | null>(null);
  const [localBundle, setLocalBundle] = useState<DigestVisualBundle | null>(bundle);

  useEffect(() => {
    if (bundle != null) setLocalBundle(bundle);
  }, [bundle]);

  useEffect(() => {
    if (digestQueueLayout) setSelectorOpen(true);
  }, [digestQueueLayout]);

  async function api(
    action:
      | "refresh_all"
      | "select"
      | "discard"
      | "discover_source"
      | "generate_illustration"
      | "generate_stock"
      | "save_cropped"
      | "save_digest_image_edit"
      | "revert_digest_candidate_image",
    extra?: {
      candidate_id?: string;
      base64?: string;
      mime?: string;
      for_candidate_id?: string;
      source_candidate_id?: string;
      edit_metadata?: DigestVisualEditMetadata;
    },
  ) {
    setActionBusy(action);
    onStarted();
    try {
      const body: Record<string, unknown> = { action, source_item_id: sourceItemId };
      if (extra?.candidate_id) {
        if (
          action === "select" ||
          action === "discard" ||
          action === "revert_digest_candidate_image"
        ) {
          body.candidate_id = extra.candidate_id;
        }
      }
      if (action === "save_cropped" && extra?.base64 && extra?.mime) {
        body.base64 = extra.base64;
        body.mime = extra.mime;
        if (extra.for_candidate_id) body.for_candidate_id = extra.for_candidate_id;
      }
      if (action === "save_digest_image_edit" && extra?.base64 && extra?.mime && extra.edit_metadata != null) {
        body.base64 = extra.base64;
        body.mime = extra.mime;
        body.source_candidate_id = extra.source_candidate_id;
        body.edit_metadata = extra.edit_metadata;
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
      else if (action === "discard") toast.success("Image option removed");
      else if (action === "save_cropped") toast.success("Image snapshot saved");
      else if (action === "save_digest_image_edit") toast.success("Image saved");
      else if (action === "revert_digest_candidate_image") toast.success("Restored original image");
      else if (action === "discover_source") toast.success("Source images updated");
      else if (action === "generate_illustration") toast.success("New AI illustrations generated");
      else if (action === "generate_stock") toast.success("AI photo options updated");
      else toast.success("Visual options updated");
    } catch (e) {
      if (action === "select") setOptimisticSelectedId(null);
      toast.error(
        userFacingDbStatementTimeoutMessage(
          e instanceof Error ? e.message : "Visual request failed",
        ),
      );
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
    if (!imageEditor) return;
    const stillExists = sorted.some((candidate) => candidate.id === imageEditor.candidate.id);
    if (!stillExists) setImageEditor(null);
  }, [imageEditor, sorted]);

  useEffect(() => {
    setImageEditor((prev) => {
      if (!prev || !effectiveBundle) return prev;
      const fresh = effectiveBundle.candidates.find((c) => c.id === prev.candidate.id);
      return fresh ? { ...prev, candidate: fresh } : prev;
    });
  }, [effectiveBundle?.updatedAt]);

  /** Only pick default tab when the chooser opens — not when candidates change (e.g. discard), so tabs stay put. */
  const digestChooserWasOpenRef = useRef(false);
  useEffect(() => {
    if (!digestQueueLayout) {
      digestChooserWasOpenRef.current = false;
      return;
    }
    const wasOpen = digestChooserWasOpenRef.current;
    digestChooserWasOpenRef.current = selectorOpen;
    if (!selectorOpen || wasOpen) return;
    if (sourceCandidates.length > 0) setActiveTab("source");
    else if (schematicCandidates.length > 0) setActiveTab("schematic");
    else setActiveTab("stock");
  }, [
    digestQueueLayout,
    selectorOpen,
    sourceCandidates.length,
    schematicCandidates.length,
    stockCandidates.length,
  ]);

  const showChooser = digestQueueLayout || selectorOpen;
  const hasBundle = effectiveBundle && effectiveBundle.candidates.length > 0;

  return (
    <div className="space-y-5">
      {imageEditor ? (
        <DigestImageEditorModal
          candidate={imageEditor.candidate}
          initialMode={imageEditor.initialMode}
          disabled={disabled || working}
          onClose={() => setImageEditor(null)}
          onSaveEdited={async ({ base64, mime, editMetadata }) => {
            await api("save_digest_image_edit", {
              base64,
              mime,
              source_candidate_id: imageEditor.candidate.id,
              edit_metadata: editMetadata,
            });
            setImageEditor(null);
          }}
          onRevertOriginal={async () => {
            await api("revert_digest_candidate_image", {
              candidate_id: imageEditor.candidate.id,
            });
          }}
        />
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            {!digestQueueLayout ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--muted-foreground)]">
                Selected Visual
              </p>
            ) : null}
            {!activeSrc ? (
              <p
                className={`max-w-md text-sm text-[color:var(--muted-foreground)] ${digestQueueLayout ? "" : "mt-1"}`}
              >
                No visual selected. Choose a source image, generate an illustration, or add AI photo options.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {!digestQueueLayout ? (
              <Button
                type="button"
                variant="secondary"
                className="h-8 px-2.5 text-xs font-medium"
                disabled={disabled || working}
                onClick={() => setSelectorOpen((v) => !v)}
              >
                {selectorOpen ? "Hide options" : "Choose image"}
              </Button>
            ) : null}
            <button
              type="button"
              disabled={!active}
              title="Preview"
              aria-label="Preview selected visual"
              onClick={() => active && setImageEditor({ candidate: active, initialMode: "preview" })}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:var(--border)]/55 text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)] disabled:pointer-events-none disabled:opacity-40"
            >
              <PreviewIcon />
            </button>
            <button
              type="button"
              disabled={!active || !activeSrc}
              title="Copy image or link"
              aria-label="Copy selected visual"
              onClick={() => active && void copyDigestVisualCandidate(active)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:var(--border)]/55 text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)] disabled:pointer-events-none disabled:opacity-40"
            >
              <ClipboardCopyIcon />
            </button>
            <Button
              type="button"
              variant="secondary"
              className="h-8 px-2.5 text-xs font-medium"
              disabled={!active}
              title="Open image editor"
              aria-label="Edit digest image"
              onClick={() => active && setImageEditor({ candidate: active, initialMode: "crop" })}
            >
              Edit
            </Button>
          </div>
        </div>
        {!activeSrc && digestQueueLayout ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-8 px-3 text-xs"
              disabled={disabled || working}
              onClick={() => {
                setActiveTab("source");
                setSelectorOpen(true);
                void api("discover_source");
              }}
            >
              Source
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-8 px-3 text-xs"
              disabled={disabled || working}
              onClick={() => {
                setActiveTab("schematic");
                setSelectorOpen(true);
              }}
            >
              Illustration
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-8 px-3 text-xs"
              disabled={disabled || working}
              onClick={() => {
                setActiveTab("stock");
                setSelectorOpen(true);
                void api("generate_stock");
              }}
            >
              Photos
            </Button>
          </div>
        ) : null}
        {activeSrc ? (
          <div className="relative aspect-video max-h-52 w-full min-w-0 overflow-hidden rounded-lg border border-[color:var(--border)]/45 bg-[#faf6ef]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeSrc}
              alt=""
              className="box-border h-full w-full object-contain object-center"
              decoding="async"
            />
          </div>
        ) : null}
        {active ? (
          <div className="space-y-0.5 text-xs text-[color:var(--muted-foreground)]">
            <p className="font-medium text-[color:var(--foreground)]">{selectedKindLine(active)}</p>
            <p>{rightsLine(active.rights, active.type === "source")}</p>
          </div>
        ) : null}
      </section>

      {showChooser ? (
        <section className="space-y-3 border-t border-[color:var(--border)]/40 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--muted-foreground)]">
            Acquisition modes
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(["source", "schematic", "stock"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab);
                    if (tab === "source" && sourceCandidates.length === 0) {
                      void api("discover_source");
                    }
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    tab === activeTab
                      ? "border-[color:var(--accent)]/50 bg-[color:var(--accent)]/14 text-[color:var(--foreground)]"
                      : "border-[color:var(--border)]/55 bg-[color:var(--background)]/80 text-[color:var(--muted-foreground)] hover:border-[color:var(--border)]/90 hover:text-[color:var(--foreground)]"
                  }`}
                >
                  {tabLabel(tab)}
                </button>
              ))}
            </div>
            <div className="ml-auto flex shrink-0 items-center">
              {activeTab === "schematic" ? (
                <Button
                  type="button"
                  variant="primary"
                  className="h-8 px-3 text-xs font-semibold"
                  disabled={disabled || working}
                  title="Runs the illustration model on this signal’s title and summary to add BioRender-style options."
                  onClick={() => void api("generate_illustration")}
                >
                  Generate illustration
                </Button>
              ) : activeTab === "stock" ? (
                <Button
                  type="button"
                  variant="primary"
                  className="h-8 px-3 text-xs font-semibold"
                  disabled={disabled || working}
                  title="Runs the photo-style agent on this signal (options appear when available)."
                  onClick={() => void api("generate_stock")}
                >
                  Generate photos
                </Button>
              ) : null}
            </div>
          </div>
          {!hasBundle ? (
            <p className="text-sm text-[color:var(--muted-foreground)]">
              No candidates yet. Use Source, or switch to Illustration / Photos and tap Generate.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-3.5">
              {tabCandidates.length === 0 ? (
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  {activeTab === "stock"
                    ? "No photo options in this tab yet. Try Generate photos."
                    : "No options in this tab yet. Try Generate illustration."}
                </p>
              ) : (
                tabCandidates.map((candidate) => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    selected={selectedId === candidate.id}
                    canDiscard={
                      sorted.length > 1 &&
                      (Boolean(candidate.editedFromId) || candidate.aiGenerated === true)
                    }
                    discardBusy={actionBusy === "discard"}
                    onDiscard={() => {
                      if (!window.confirm("Remove this image option from the digest?")) return;
                      void api("discard", { candidate_id: candidate.id });
                    }}
                    onPreview={() => setImageEditor({ candidate, initialMode: "preview" })}
                    onSelect={() => {
                      setOptimisticSelectedId(candidate.id);
                      void api("select", { candidate_id: candidate.id });
                    }}
                  />
                ))
              )}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
