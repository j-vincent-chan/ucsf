"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ItemCategory, ItemStatus, SourceItem, Summary } from "@/types/database";
import {
  ARCHIVE_REASON_OPTIONS,
  archiveReasonFormOptions,
  isPersistableArchiveReason,
  isValidArchiveReason,
} from "@/lib/archive-reasons";
import { sourceTypeDisplayLabel } from "../queue-cell-tags";
import { SummaryEditor } from "@/components/summary-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function ItemDetail({
  item,
  entityName,
  summaries: initialSummaries,
  duplicates,
  duplicateOf,
}: {
  item: SourceItem;
  entityName: string | null;
  summaries: Summary[];
  duplicates: Pick<SourceItem, "id" | "title" | "status" | "duplicate_key">[];
  duplicateOf: Pick<SourceItem, "id" | "title"> | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(item.status);
  const [archiveReason, setArchiveReason] = useState<string>(
    item.archive_reason ?? "",
  );
  const [quickArchiveReason, setQuickArchiveReason] = useState("");
  const [archivePanelOpen, setArchivePanelOpen] = useState(false);
  const [category, setCategory] = useState(item.category ?? "");
  const [title, setTitle] = useState(item.title);
  const [sourceUrl, setSourceUrl] = useState(item.source_url ?? "");
  const [savingMeta, setSavingMeta] = useState(false);
  const [summaries, setSummaries] = useState(initialSummaries);

  const refreshSummaries = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("summaries")
      .select("*")
      .eq("source_item_id", item.id)
      .order("created_at", { ascending: false });
    if (!error && data) setSummaries(data as Summary[]);
  }, [item.id]);

  const quickSetStatus = useCallback(async (s: ItemStatus) => {
    const supabase = createClient();
    const patch =
      s === "approved"
        ? { status: s as ItemStatus, archive_reason: null as string | null }
        : s === "archived"
          ? { status: s as ItemStatus, archive_reason: "other" as const }
          : { status: s as ItemStatus };
    const { error } = await supabase.from("source_items").update(patch).eq("id", item.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStatus(s);
    if (s === "approved") setArchiveReason("");
    if (s === "archived") {
      setArchiveReason("other");
      setQuickArchiveReason("");
      setArchivePanelOpen(false);
    }
    toast.success(`Status: ${s} (shortcut)`);
    router.refresh();
  }, [item.id, router]);

  useEffect(() => {
    setQuickArchiveReason("");
    setArchivePanelOpen(false);
  }, [item.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "a" && !e.metaKey && !e.ctrlKey) {
        void quickSetStatus("approved");
      }
      if (e.key === "x" && !e.metaKey && !e.ctrlKey) {
        void quickSetStatus("archived");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quickSetStatus]);

  async function saveMetadata(e: React.FormEvent) {
    e.preventDefault();
    setSavingMeta(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("source_items")
      .update({
        title: title.trim(),
        source_url: sourceUrl.trim() || null,
        status,
        category: (category || null) as ItemCategory | null,
        archive_reason:
          status === "archived" && isPersistableArchiveReason(archiveReason) ? archiveReason : null,
      })
      .eq("id", item.id);
    setSavingMeta(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Metadata saved");
    router.refresh();
  }

  async function setStatusOnly(s: ItemStatus) {
    const supabase = createClient();
    const patch =
      s === "approved"
        ? { status: s, archive_reason: null as string | null }
        : { status: s };
    const { error } = await supabase.from("source_items").update(patch).eq("id", item.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStatus(s);
    if (s === "approved") setArchiveReason("");
    toast.success(`Marked ${s}`);
    router.refresh();
  }

  async function archiveFromHeader() {
    if (!isValidArchiveReason(quickArchiveReason)) {
      toast.error("Select an archive reason");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("source_items")
      .update({ status: "archived", archive_reason: quickArchiveReason })
      .eq("id", item.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStatus("archived");
    setArchiveReason(quickArchiveReason);
    setQuickArchiveReason("");
    setArchivePanelOpen(false);
    toast.success("Archived");
    router.refresh();
  }

  function cancelHeaderArchive() {
    setArchivePanelOpen(false);
    setQuickArchiveReason("");
  }

  return (
    <div className="mx-auto max-w-6xl gap-8 lg:grid lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500">
              <Link href="/items" className="hover:underline">
                ← Review Queue
              </Link>
            </p>
            <h1 className="mt-2 text-2xl font-semibold leading-snug">{item.title}</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {entityName ?? "Unassigned"} · {sourceTypeDisplayLabel(item.source_type)}
              {item.published_at
                ? ` · ${new Date(item.published_at).toLocaleDateString()}`
                : ""}
            </p>
          </div>
          <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:max-w-md sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setArchivePanelOpen(false);
                  void setStatusOnly("approved");
                }}
              >
                Approve
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={archivePanelOpen}
                onClick={() => setArchivePanelOpen(true)}
              >
                Archive
              </Button>
            </div>
            {archivePanelOpen ? (
              <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50/90 p-3 dark:border-neutral-700 dark:bg-neutral-900/40">
                <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Why archive?
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="header-archive-reason" className="sr-only">
                      Archive reason
                    </Label>
                    <select
                      id="header-archive-reason"
                      value={quickArchiveReason}
                      onChange={(e) => setQuickArchiveReason(e.target.value)}
                      className="w-full min-w-[12rem] rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                    >
                      <option value="">Choose a reason…</option>
                      {ARCHIVE_REASON_OPTIONS.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={!isValidArchiveReason(quickArchiveReason)}
                    className="shrink-0"
                    onClick={() => void archiveFromHeader()}
                  >
                    Confirm archive
                  </Button>
                  <Button type="button" variant="ghost" className="shrink-0" onClick={cancelHeaderArchive}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-neutral-400">
          Keyboard: <kbd className="rounded border px-1">a</kbd> approve ·{" "}
          <kbd className="rounded border px-1">x</kbd> archive as Other (when not typing in a field)
        </p>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          <Link href={`/digest/${monthKeyForItem(item)}`} className="underline">
            Open monthly digest
          </Link>{" "}
          for this item&apos;s month to draft summaries alongside other approved stories.
        </p>

        {(duplicates.length > 0 || duplicateOf) && (
          <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
            <CardTitle>Duplicate hints</CardTitle>
            <ul className="mt-2 list-inside list-disc text-sm text-neutral-700 dark:text-neutral-300">
              {duplicateOf && (
                <li>
                  Possible duplicate of:{" "}
                  <Link href={`/items/${duplicateOf.id}`} className="underline">
                    {duplicateOf.title}
                  </Link>
                </li>
              )}
              {duplicates.map((d) => (
                <li key={d.id}>
                  Same fingerprint as:{" "}
                  <Link href={`/items/${d.id}`} className="underline">
                    {d.title}
                  </Link>{" "}
                  ({d.status})
                </li>
              ))}
            </ul>
          </Card>
        )}

        {item.source_url && (
          <p className="text-sm">
            <a
              href={item.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-neutral-900 underline dark:text-neutral-100"
            >
              Open source link
            </a>
          </p>
        )}

        <Card>
          <CardTitle>Raw summary</CardTitle>
          <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
            {item.raw_summary ?? "—"}
          </p>
        </Card>

        <Card>
          <CardTitle>Raw text</CardTitle>
          <p className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
            {item.raw_text ?? "—"}
          </p>
        </Card>

        <Card>
          <CardTitle>Edit metadata</CardTitle>
          <form onSubmit={saveMetadata} className="mt-4 space-y-3">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="url">Source URL</Label>
              <Input id="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} className="mt-1" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  id="status"
                  value={status}
                  onChange={(e) => {
                    const v = e.target.value as ItemStatus;
                    setStatus(v);
                    if (v === "approved") setArchiveReason("");
                  }}
                  className="mt-1"
                >
                  <option value="new">New</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="approved">Approved</option>
                  <option value="archived">Archived</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="cat">Category</Label>
                <Select
                  id="cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1"
                >
                  <option value="">—</option>
                  <option value="paper">Paper</option>
                  <option value="award">Award</option>
                  <option value="event">Event</option>
                  <option value="media">Media</option>
                  <option value="funding">Funding</option>
                  <option value="community_update">Community update</option>
                  <option value="other">Other</option>
                </Select>
              </div>
            </div>
            {status === "archived" ? (
              <div>
                <Label htmlFor="archive-reason">Archive reason</Label>
                <Select
                  id="archive-reason"
                  value={archiveReason}
                  onChange={(e) => setArchiveReason(e.target.value)}
                  className="mt-1"
                >
                  <option value="">— Not set —</option>
                  {archiveReasonFormOptions(archiveReason).map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <Button type="submit" disabled={savingMeta}>
              {savingMeta ? "Saving…" : "Save metadata"}
            </Button>
          </form>
        </Card>
      </div>

      <aside className="mt-8 space-y-4 lg:mt-0">
        <h2 className="text-lg font-semibold">Summaries</h2>
        <p className="text-sm text-neutral-500">
          Generate new copy from the{" "}
          <Link href={`/digest/${monthKeyForItem(item)}`} className="underline">
            monthly digest
          </Link>{" "}
          for this item&apos;s month.
        </p>
        {summaries.length === 0 ? (
          <p className="text-sm text-neutral-500">No summaries yet.</p>
        ) : (
          summaries.map((s) => (
            <SummaryEditor key={s.id} summary={s} onSaved={refreshSummaries} />
          ))
        )}
      </aside>
    </div>
  );
}

function monthKeyForItem(item: SourceItem): string {
  const d = item.published_at ? new Date(item.published_at) : new Date(item.found_at);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}
