"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ItemCategory, SourceType, Summary } from "@/types/database";
import { SummaryEditor } from "@/components/summary-editor";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CategoryTag, SourceTypeTag } from "@/app/(main)/items/queue-cell-tags";
import { ucsfProfilesUrl } from "@/lib/ucsf-profiles-url";
import { formatYearMonthLabel } from "@/lib/digest-month";
import type { DigestCoverPayload } from "@/lib/digest-cover";

/** Subtle card tint per item category — hues match `CategoryTag` in the review queue. */
const DIGEST_SIGNAL_SURFACE: Record<ItemCategory | "uncategorized", string> = {
  paper:
    "!bg-[#f4eee7] !border-[#ddcec0] dark:!bg-[#2c2520] dark:!border-[#4a4036]",
  award:
    "!bg-[#f5ede3] !border-[#dfccb5] dark:!bg-[#2f261f] dark:!border-[#4d4236]",
  event:
    "!bg-[#f4ebe8] !border-[#dbc9c0] dark:!bg-[#2f2322] dark:!border-[#4b3f3a]",
  media:
    "!bg-[#f4ebe9] !border-[#dcc9c1] dark:!bg-[#2f2322] dark:!border-[#4b3f3c]",
  funding:
    "!bg-[#eff1e8] !border-[#d4d8c6] dark:!bg-[#252a23] dark:!border-[#3f463b]",
  community_update:
    "!bg-[#eef1ed] !border-[#d3d8ce] dark:!bg-[#252927] dark:!border-[#3f4540]",
  other:
    "!bg-[#f4eee8] !border-[#d9cdc1] dark:!bg-[#2d2520] dark:!border-[#4a4038]",
  uncategorized:
    "!bg-[#f7f1ea] !border-[#ded1c4] dark:!bg-[#2b241f] dark:!border-[#463b34]",
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
  raw_summary: string | null;
  /** Primary + junction-linked watchlist investigators, sorted by name */
  investigators: { id: string; name: string; first_name: string; last_name: string }[];
  pi_name: string | null;
  /** Illustration for newsletter / social (PMC image or AI-generated). */
  digest_cover: DigestCoverPayload | null;
  summaries: Summary[];
};

function DigestItemRow({ item }: { item: DigestItemPayload }) {
  const router = useRouter();
  const [summaries, setSummaries] = useState<Summary[]>(item.summaries);
  const [genStyle, setGenStyle] = useState<string>("newsletter");
  const [agent, setAgent] = useState<string>(""); // empty = server default
  const [generating, setGenerating] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(item.summaries.length > 0);
  const [illustrating, setIllustrating] = useState(false);

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

  async function addIllustration() {
    setIllustrating(true);
    try {
      const res = await fetch("/api/digest-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_item_id: item.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Request failed");
      }
      toast.success(
        item.digest_cover ? "Illustration refreshed" : "Illustration added",
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Illustration failed");
    } finally {
      setIllustrating(false);
    }
  }

  async function archiveSignal() {
    if (!confirm("Archive this signal? You can still view it later in Signals with status = Archived.")) {
      return;
    }
    setArchiving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("source_items")
        .update({ status: "archived", archive_reason: "other" })
        .eq("id", item.id);
      if (error) throw error;
      toast.success("Signal archived");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not archive item");
    } finally {
      setArchiving(false);
    }
  }

  const dateLabel = item.published_at
    ? new Date(item.published_at).toLocaleDateString()
    : `Found ${new Date(item.found_at).toLocaleDateString()} (no publish date)`;
  const piListedSeparately =
    Boolean(item.pi_name) &&
    item.investigators.length > 0 &&
    !item.investigators.some(
      (inv) => inv.name.trim().toLowerCase() === (item.pi_name ?? "").trim().toLowerCase(),
    );

  return (
    <Card className={digestCardClass(item.category)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-base font-semibold leading-snug text-[color:var(--foreground)]">
            <Link href={`/items/${item.id}`} className="hover:underline">
              {item.title}
            </Link>
          </h3>
          <p className="text-sm leading-snug text-[color:var(--muted-foreground)]">
            {item.investigators.length > 0 ? (
              <>
                {item.investigators.map((inv, i) => {
                  const profileUrl = ucsfProfilesUrl(inv.first_name, inv.last_name);
                  return (
                    <Fragment key={inv.id}>
                      {i > 0 ? (
                        <span className="text-[color:var(--muted-foreground)]/45">, </span>
                      ) : null}
                      {profileUrl ? (
                        <a
                          href={profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 transition-colors hover:text-[color:var(--foreground)]"
                        >
                          {inv.name}
                        </a>
                      ) : (
                        <span>{inv.name}</span>
                      )}
                    </Fragment>
                  );
                })}
                {piListedSeparately ? (
                  <>
                    <span className="text-[color:var(--muted-foreground)]/50"> · </span>
                    <span className="text-[color:var(--muted-foreground)]/90">
                      Last author: {item.pi_name}
                    </span>
                  </>
                ) : null}
              </>
            ) : item.pi_name ? (
              <span>{item.pi_name}</span>
            ) : (
              <span>Unassigned</span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted-foreground)]">
            <SourceTypeTag type={item.source_type} />
            <CategoryTag category={item.category} />
            <span>{dateLabel}</span>
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
            <option value="bluesky_x">Social Media</option>
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
          <Button
            type="button"
            onClick={generateSummary}
            disabled={generating || archiving || illustrating}
            className="whitespace-nowrap"
          >
            {generating
              ? "Drafting…"
              : summaries.length > 0
                ? "Regenerate"
                : "Draft summary"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void addIllustration()}
            disabled={generating || archiving || illustrating}
            className="whitespace-nowrap"
            title="Use a PMC article image when available, otherwise generate an AI illustration"
          >
            {illustrating ? "Illustration…" : item.digest_cover ? "Refresh illustration" : "Illustration"}
          </Button>
          <button
            type="button"
            onClick={archiveSignal}
            disabled={archiving || generating || illustrating}
            title="Archive signal"
            aria-label="Archive signal"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--card)] text-[color:var(--muted-foreground)] transition-colors hover:bg-[#f4dfd9] hover:text-[#8f4d45] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              <line x1="10" x2="10" y1="11" y2="17" />
              <line x1="14" x2="14" y1="11" y2="17" />
            </svg>
          </button>
        </div>
      </div>

      {item.digest_cover ? (
        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
            Newsletter / social illustration
          </p>
          <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/80">
            {item.digest_cover.kind === "url" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.digest_cover.url}
                alt=""
                className="max-h-56 w-full object-contain object-center"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:${item.digest_cover.mime};base64,${item.digest_cover.base64}`}
                alt=""
                className="max-h-56 w-full object-contain object-center"
              />
            )}
          </div>
          <p className="text-xs text-[color:var(--muted-foreground)]">
            Source:{" "}
            {item.digest_cover.source === "pmc_article_image"
              ? "Article image (PMC)"
              : item.digest_cover.source === "dall-e-3"
                ? "AI illustration (DALL·E 3)"
                : item.digest_cover.source}
            . For newsletters or social posts—right-click or save the image as needed.
          </p>
        </div>
      ) : null}

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
  selectedMonth,
  minMonth,
  maxMonth,
}: {
  monthLabel: string;
  items: DigestItemPayload[];
  selectedMonth?: string;
  minMonth?: string;
  maxMonth?: string;
}) {
  const router = useRouter();
  const [monthInput, setMonthInput] = useState(selectedMonth ?? "");

  useEffect(() => {
    if (selectedMonth) setMonthInput(selectedMonth);
  }, [selectedMonth]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Monthly Digest</h1>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
            Monthly Digest is your drafting workspace for <span className="font-medium text-[color:var(--foreground)]/90">{monthLabel}</span>—approved signals only. Choose a channel, then draft or regenerate copy tuned for that audience (same facts, different tone and length). Newsletter runs longest; social media stays tight. Use the month control to jump between months; regenerate anytime you change format or want a fresh pass.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!monthInput) return;
            router.push(`/digest/${monthInput}`);
          }}
          className="surface-subtle flex w-full max-w-sm items-end gap-2 rounded-2xl p-2.5 sm:w-auto sm:min-w-[320px]"
        >
          <label className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
            Month
            <div className="relative mt-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] normal-case">
              <span
                className="pointer-events-none absolute left-3 top-1/2 z-0 max-w-[calc(100%-2.75rem)] -translate-y-1/2 truncate text-base font-normal tracking-[-0.012em] text-[color:var(--foreground)]"
                aria-hidden
              >
                {monthInput ? formatYearMonthLabel(monthInput) : "Select month"}
              </span>
              <input
                type="month"
                name="month"
                value={monthInput}
                onChange={(e) => setMonthInput(e.target.value)}
                min={minMonth}
                max={maxMonth}
                className="relative z-10 mt-0 w-full cursor-pointer rounded-xl border-0 bg-transparent px-3 py-2 text-base text-transparent caret-transparent outline-none focus:ring-0 normal-case"
              />
            </div>
          </label>
          <Button type="submit" className="shrink-0 whitespace-nowrap px-4">
            Go
          </Button>
        </form>
      </div>
      {items.length === 0 ? (
        <Card>
          <CardTitle>No approved items this month</CardTitle>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
            Approve items in Signals (or adjust published/found dates) so they appear here for this
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
