"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type DiscoverResponse = {
  inserted: number;
  skippedDuplicates: number;
  linkedInvestigators?: number;
  bySource?: Record<string, number>;
  errors?: { source: string; entityId: string; message: string }[];
  facultyProcessed?: number;
  labWebsiteFacultyWithUrl?: number;
  labWebsiteCandidates?: number;
  note?: string;
};

export function DiscoverItemsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  function cancel() {
    abortRef.current?.abort();
  }

  async function run() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    abortRef.current = new AbortController();
    setBusy(true);
    try {
      const res = await fetch("/api/discover-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: abortRef.current.signal,
      });
      const data = (await res.json()) as DiscoverResponse & { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Discovery failed");
        return;
      }
      const parts = [
        `Added ${data.inserted} item(s)`,
        `${data.skippedDuplicates} duplicate(s) skipped`,
        ...(data.linkedInvestigators
          ? [`${data.linkedInvestigators} investigator link(s) to existing signal(s)`]
          : []),
        `${data.facultyProcessed ?? 0} faculty scanned`,
      ];
      const by = data.bySource;
      if (by && Object.keys(by).length > 0) {
        const src = Object.entries(by)
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => `${k}: ${n}`)
          .join(" · ");
        parts.push(src);
      }
      const lw = data.labWebsiteFacultyWithUrl ?? 0;
      if (lw > 0) {
        parts.push(
          `lab feeds: ${data.labWebsiteCandidates ?? 0} candidate(s) from ${lw} investigator URL(s)`,
        );
      }
      toast.success(parts.join(" · "));
      if (data.note) {
        toast.message(data.note, { duration: 8000 });
      }
      if (data.errors && data.errors.length > 0) {
        toast.warning(
          `${data.errors.length} fetch warning(s): ${data.errors
            .slice(0, 3)
            .map((e) => `${e.source}: ${e.message}`)
            .join("; ")}`,
          { duration: 12_000 },
        );
      }
      router.refresh();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        toast.message("Discovery cancelled");
        return;
      }
      if (e instanceof Error && e.name === "AbortError") {
        toast.message("Discovery cancelled");
        return;
      }
      toast.error("Discovery request failed");
    } finally {
      abortRef.current = null;
      inFlightRef.current = false;
      setBusy(false);
    }
  }

  if (busy) {
    return (
      <div className="flex w-full flex-nowrap items-center gap-2 sm:w-auto">
        <Button
          type="button"
          variant="primary"
          className="min-w-0 flex-1 whitespace-nowrap px-5 py-2.5 text-sm font-semibold shadow-md sm:flex-none"
          disabled
        >
          Discovering…
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 whitespace-nowrap px-5 py-2.5 text-sm font-medium sm:flex-none"
          onClick={cancel}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="primary"
      className="w-full whitespace-nowrap px-5 py-2.5 text-sm font-semibold shadow-md transition-shadow hover:shadow-lg sm:w-auto"
      onClick={run}
    >
      Discover new items
    </Button>
  );
}
