"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ItemCategory, SourceType, Summary } from "@/types/database";
import { SummaryEditor } from "@/components/summary-editor";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CategoryTag, SourceTypeTag } from "@/app/(main)/items/queue-cell-tags";
import { ucsfProfilesUrl } from "@/lib/ucsf-profiles-url";

/** Subtle card tint per item category — hues match `CategoryTag` in the review queue. */
const DIGEST_SIGNAL_SURFACE: Record<ItemCategory | "uncategorized", string> = {
  paper:
    "!bg-[#eef3f7] !border-[#cfdbe5]",
  award:
    "!bg-[#f7efe6] !border-[#e4ceb1]",
  event:
    "!bg-[#f6ecef] !border-[#dec4ce]",
  media:
    "!bg-[#f7ecee] !border-[#dfc4c9]",
  funding:
    "!bg-[#edf4ef] !border-[#c9d9cc]",
  community_update:
    "!bg-[#edf4f4] !border-[#c9d8d9]",
  other:
    "!bg-[#f4eee8] !border-[#d9cdc1]",
  uncategorized:
    "!bg-[#fcf8f2] !border-[#e2d7cb]",
};

function digestCardClass(category: ItemCategory | null): string {
  return DIGEST_SIGNAL_SURFACE[category ?? "uncategorized"];
}

export type DigestItemPayload = {
  id: string;
  title: string;
  published_at: string | null;
  found_at: string;
  category: ItemCategory | null;
  source_type: SourceType;
  source_url: string | null;
  investigator: { name: string; first_name: string; last_name: string } | null;
  summaries: Summary[];
};

function DigestItemRow({ item }: { item: DigestItemPayload }) {
  const [summaries, setSummaries] = useState<Summary[]>(item.summaries);
  const [genStyle, setGenStyle] = useState<string>("newsletter");
  const [agent, setAgent] = useState<string>(""); // empty = server default
  const [generating, setGenerating] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(item.summaries.length > 0);

  const refreshSummaries = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("summaries")
      .select("*")
      .eq("source_item_id", item.id)
      .order("created_at", { ascending: false });
    if (!error && data) setSummaries(data as Summary[]);
  }, [item.id]);

  async function generateSummary() {
    setGenerating(true);
    const hadExisting = summaries.length > 0;
    try {
      const res = await fetch("/api/generate-blurb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_item_id: item.id,
          style: genStyle,
          model: agent || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; record?: Summary };
      if (!res.ok) {
        throw new Error(data.error ?? "Request failed");
      }
      toast.success(hadExisting ? "Summary regenerated" : "Summary drafted");
      setSummaryOpen(true);
      await refreshSummaries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const dateLabel = item.published_at
    ? new Date(item.published_at).toLocaleDateString()
    : `Found ${new Date(item.found_at).toLocaleDateString()} (no publish date)`;
  const profileUrl = item.investigator
    ? ucsfProfilesUrl(item.investigator.first_name, item.investigator.last_name)
    : null;

  return (
    <Card className={digestCardClass(item.category)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-base font-semibold leading-snug text-[color:var(--foreground)]">
            <Link href={`/items/${item.id}`} className="hover:underline">
              {item.title}
            </Link>
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--muted-foreground)]">
            {item.investigator ? (
              profileUrl ? (
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 transition-colors hover:text-[color:var(--foreground)]"
                >
                  {item.investigator.name}
                </a>
              ) : (
                <span>{item.investigator.name}</span>
              )
            ) : (
              <span>Unassigned</span>
            )}
            <span aria-hidden>·</span>
            <SourceTypeTag type={item.source_type} />
            <CategoryTag category={item.category} />
            <span className="text-xs text-[color:var(--muted-foreground)]">{dateLabel}</span>
          </div>
          {item.source_url ? (
            <p className="text-sm">
              <a
                href={item.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-[color:var(--foreground)] underline underline-offset-4"
              >
                Open source
              </a>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={genStyle}
            onChange={(e) => setGenStyle(e.target.value)}
            className="min-w-[140px]"
            aria-label="Summary format"
          >
            <option value="newsletter">Newsletter</option>
            <option value="linkedin">LinkedIn</option>
            <option value="bluesky_x">Bluesky or X</option>
            <option value="instagram">Instagram</option>
          </Select>
          <Select
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            className="min-w-[170px]"
            aria-label="Agent"
          >
            <option value="">Agent: Default</option>
            <option value="gpt-4o-mini">Agent: GPT-4o mini</option>
            <option value="gpt-4.1-mini">Agent: GPT-4.1 mini</option>
            <option value="gpt-4o">Agent: GPT-4o</option>
            <option value="gpt-4.1">Agent: GPT-4.1</option>
          </Select>
          <Button type="button" onClick={generateSummary} disabled={generating}>
            {generating
              ? "Drafting…"
              : summaries.length > 0
                ? "Regenerate"
                : "Draft summary"}
          </Button>
        </div>
      </div>

      <div className="mt-4 border-t border-[color:var(--border)]/60 pt-4">
        <button
          type="button"
          onClick={() => setSummaryOpen((o) => !o)}
          className="text-sm font-medium text-[color:var(--muted-foreground)] underline-offset-2 hover:text-[color:var(--foreground)] hover:underline"
        >
          {summaryOpen ? "Hide draft summary" : "Show draft summary"}
        </button>
        {summaryOpen ? (
          <div className="mt-3 space-y-3">
            {summaries.length === 0 ? (
              <p className="text-sm text-[color:var(--muted-foreground)]">No summary yet — draft one above.</p>
            ) : (
              <SummaryEditor
                key={summaries[0]!.id}
                summary={summaries[0]!}
                onSaved={refreshSummaries}
              />
            )}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function MonthlyDigestView({
  monthLabel,
  items,
}: {
  monthLabel: string;
  items: DigestItemPayload[];
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Monthly digest</h1>
        <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
          Approved items for {monthLabel}. Pick a format and draft or regenerate: each platform gets
          its own wording (same facts, different tone and length). Newsletter is longest; Bluesky or X is
          shortest.
        </p>
      </div>
      {items.length === 0 ? (
        <Card>
          <CardTitle>No approved items this month</CardTitle>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
            Approve items in the Review Queue (or adjust published dates) so they appear here for this
            month.
          </p>
        </Card>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.id}>
              <DigestItemRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
