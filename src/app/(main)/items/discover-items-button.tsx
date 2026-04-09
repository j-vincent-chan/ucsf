"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type DiscoverResponse = {
  inserted: number;
  skippedDuplicates: number;
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

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/discover-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as DiscoverResponse & { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Discovery failed");
        return;
      }
      const parts = [
        `Added ${data.inserted} item(s)`,
        `${data.skippedDuplicates} duplicate(s) skipped`,
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
    } catch {
      toast.error("Discovery request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="primary"
      className="w-full px-5 py-2.5 text-base font-semibold shadow-md transition-shadow hover:shadow-lg sm:w-auto"
      disabled={busy}
      onClick={run}
    >
      {busy ? "Discovering…" : "Discover new items"}
    </Button>
  );
}
