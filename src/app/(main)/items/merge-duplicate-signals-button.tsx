"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/** Admin: merges rows that share signal_group_key (same URL or same title + UTC day). */
export function MergeDuplicateSignalsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/merge-duplicate-signals", {
        method: "POST",
      });
      const data = (await res.json()) as { merged?: number; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Consolidate failed");
        return;
      }
      toast.success(
        `Removed ${data.merged ?? 0} duplicate row(s); investigators merged onto one signal.`,
      );
      router.refresh();
    } catch {
      toast.error("Consolidate request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full shrink-0 whitespace-nowrap py-2.5 text-sm font-medium sm:w-auto"
      disabled={busy}
      onClick={() => void run()}
      title="Merge duplicate rows that point at the same article (same URL or same title + date)"
    >
      {busy ? "Consolidating…" : "Consolidate duplicates"}
    </Button>
  );
}
