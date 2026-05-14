"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DeleteFacultyButton } from "./delete-faculty-button";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type WatchlistEntityRow = {
  id: string;
  name: string;
  first_name: string;
  middle_initial: string;
  last_name: string;
  headshot_display_url: string | null;
  pubmed_url: string | null;
  lab_website: string | null;
  nih_profile_id: string | null;
  x_handle: string | null;
  bluesky_handle: string | null;
  active: boolean;
};

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function displayName(row: Pick<WatchlistEntityRow, "name" | "first_name" | "middle_initial" | "last_name">): string {
  let first = safeTrim(row.first_name);
  let mi = safeTrim(row.middle_initial).slice(0, 1).toUpperCase();
  const last = safeTrim(row.last_name);
  // Backward compatibility: older data may have middle initial in first_name ("Abul C").
  if (!mi && first) {
    const parts = first.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const maybeMi = parts[parts.length - 1]?.replace(/\./g, "");
      if (maybeMi && /^[A-Za-z]$/.test(maybeMi)) {
        mi = maybeMi.toUpperCase();
        first = parts.slice(0, -1).join(" ");
      }
    }
  }
  const composed = [first, mi ? `${mi}.` : "", last].filter(Boolean).join(" ").trim();
  return composed || safeTrim(row.name);
}

function nihReporterPersonHref(profileId: string | null | undefined): string | null {
  const id = profileId?.trim();
  if (!id) return null;
  return `https://reporter.nih.gov/person-details/${encodeURIComponent(id)}`;
}

function hrefForHttpUrl(raw: string | null | undefined): string | null {
  let s = raw?.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

function stripAt(h: string | null | undefined): string {
  return (h ?? "").replace(/^@+/u, "").trim();
}

function xProfileHref(handle: string | null | undefined): string | null {
  const u = stripAt(handle);
  if (!u) return null;
  return `https://x.com/${encodeURIComponent(u)}`;
}

function blueskyProfileHref(handle: string | null | undefined): string | null {
  const u = stripAt(handle);
  if (!u) return null;
  return `https://bsky.app/profile/${encodeURIComponent(u)}`;
}

/** Stored without @; display with @ prefix. */
function atHandle(raw: string | null | undefined): string {
  const u = stripAt(raw);
  return u ? `@${u}` : "";
}

const linkClass =
  "text-[color:var(--foreground)] underline decoration-[color:var(--muted-foreground)]/55 underline-offset-2";

function CompactExtLink({
  href,
  label,
  title,
  className,
}: {
  href: string;
  label: string;
  title?: string;
  className?: string;
}) {
  const aria = title ? `${label}: ${title}` : label;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={[linkClass, className].filter(Boolean).join(" ")}
      title={title ?? href}
      aria-label={aria}
    >
      {label}
    </a>
  );
}

/** Circular crop; falls back to initial when missing URL or load error. */
function EntityAvatar({
  displayName: shown,
  imageSrc,
}: {
  displayName: string;
  imageSrc: string | null;
}) {
  const [broken, setBroken] = useState(false);
  const url = imageSrc?.trim() ?? "";
  const valid = /^https?:\/\//i.test(url);
  const initial = shown.trim().slice(0, 1).toUpperCase() || "?";

  const shell =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--muted)] text-sm font-semibold text-[color:var(--muted-foreground)] ring-1 ring-[color:var(--border)]";

  if (!valid || broken) {
    return (
      <span className={shell} aria-hidden>
        {initial}
      </span>
    );
  }

  return (
    <span className={`${shell} p-0`} aria-hidden>
      <img
        src={url}
        alt=""
        width={40}
        height={40}
        className="h-full w-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    </span>
  );
}

function LinkOrEmDash({
  href,
  label,
  title,
  className,
}: {
  href: string | null;
  label: string;
  title?: string;
  className?: string;
}) {
  if (!href) {
    return <span className="text-[color:var(--muted-foreground)]">—</span>;
  }
  return <CompactExtLink href={href} label={label} title={title} className={className} />;
}

export function WatchlistEntitiesTable({ rows }: { rows: WatchlistEntityRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const rowIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const activeSelected = useMemo(
    () => new Set([...selected].filter((id) => rowIds.has(id))),
    [selected, rowIds],
  );
  const selectedList = useMemo(
    () => rows.filter((r) => activeSelected.has(r.id)),
    [activeSelected, rows],
  );

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllOnPage = useCallback(() => {
    setSelected((prev) => {
      if (rows.length === 0) return new Set();
      const allSelected = rows.every((r) => prev.has(r.id));
      if (allSelected) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  }, [rows]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  async function bulkDelete() {
    const ids = selectedList.map((r) => r.id);
    if (ids.length === 0) return;

    const sample = selectedList
      .slice(0, 5)
      .map((r) => r.name.trim() || "(unnamed)")
      .join(", ");
    const more = ids.length > 5 ? ` and ${ids.length - 5} more` : "";
    if (
      !confirm(
        `Delete ${ids.length} investigator${ids.length === 1 ? "" : "s"} from the watchlist? This cannot be undone. Source items will stay but lose this link.\n\n${sample}${more}`,
      )
    ) {
      return;
    }

    setBulkDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("tracked_entities").delete().in("id", ids);
    setBulkDeleting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Removed ${ids.length} from watchlist`);
    clearSelection();
    router.refresh();
  }

  const allSelected = rows.length > 0 && rows.every((r) => activeSelected.has(r.id));
  const someSelected = activeSelected.size > 0;

  if (rows.length === 0) {
    return (
      <div className="soft-table">
        <div className="min-w-0 max-w-full overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <tbody>
              <tr>
                <td colSpan={9} className="p-10 text-center text-[color:var(--muted-foreground)]">
                  No faculty match. Clear filters or add one.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {someSelected ? (
        <div className="surface-subtle flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] px-3 py-3">
          <p className="text-sm text-[color:var(--foreground)]/90">
            <span className="font-medium tabular-nums">{activeSelected.size}</span> selected
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={clearSelection}>
              Clear
            </Button>
            <Button
              type="button"
              variant="danger"
              className="h-8 px-3 text-xs"
              disabled={bulkDeleting}
              onClick={() => void bulkDelete()}
            >
              {bulkDeleting ? "Deleting…" : `Delete ${activeSelected.size} selected`}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="soft-table">
        <div className="min-w-0 max-w-full overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr>
                <th className="w-10 p-3">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={allSelected}
                    onChange={selectAllOnPage}
                  />
                </th>
                <th className="min-w-[160px] p-3 font-medium">Name</th>
                <th className="p-3 font-medium whitespace-nowrap">Active</th>
                <th className="p-3 font-medium whitespace-nowrap">PubMed</th>
                <th className="min-w-[7.5rem] p-3 font-medium whitespace-nowrap">RePORTER</th>
                <th className="p-3 font-medium whitespace-nowrap">Lab website</th>
                <th className="min-w-[10rem] max-w-[14rem] p-3 font-medium">X (Twitter)</th>
                <th className="min-w-[10rem] max-w-[14rem] p-3 font-medium">Bluesky</th>
                <th className="min-w-[120px] p-3 font-medium text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const shownName = displayName(e);
                const pubmedHref = hrefForHttpUrl(e.pubmed_url);
                const labHref = hrefForHttpUrl(e.lab_website);
                const nihId = e.nih_profile_id?.trim() ?? "";
                const nihHref = nihReporterPersonHref(nihId);
                const xHref = xProfileHref(e.x_handle);
                const bskyHref = blueskyProfileHref(e.bluesky_handle);
                const xLabel = atHandle(e.x_handle);
                const bskyLabel = atHandle(e.bluesky_handle);
                return (
                  <tr key={e.id} className="align-top">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={activeSelected.has(e.id)}
                        onChange={() => toggle(e.id)}
                        aria-label={`Select ${shownName}`}
                      />
                    </td>
                    <td className="p-3 font-medium">
                      <div className="flex min-w-0 items-center gap-3">
                        <EntityAvatar displayName={shownName} imageSrc={e.headshot_display_url} />
                        <Link href={`/entities/${e.id}/edit`} className={`${linkClass} min-w-0`}>
                          {shownName}
                        </Link>
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">{e.active ? "Yes" : "No"}</td>
                    <td className="p-3 whitespace-nowrap">
                      <LinkOrEmDash href={pubmedHref} label="PubMed" title={e.pubmed_url ?? undefined} />
                    </td>
                    <td className="min-w-0 max-w-[9rem] p-3 font-mono text-xs tabular-nums">
                      {nihHref && nihId ? (
                        <CompactExtLink
                          href={nihHref}
                          label={nihId}
                          title="RePORTER person profile"
                          className="block truncate"
                        />
                      ) : (
                        <span className="text-[color:var(--muted-foreground)]">—</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <LinkOrEmDash href={labHref} label="Lab" title={e.lab_website ?? undefined} />
                    </td>
                    <td className="min-w-0 max-w-[14rem] p-3">
                      {xHref && xLabel ? (
                        <CompactExtLink
                          href={xHref}
                          label={xLabel}
                          title={`Open ${xLabel} on X`}
                          className="block truncate font-mono text-xs"
                        />
                      ) : (
                        <span className="text-[color:var(--muted-foreground)]">—</span>
                      )}
                    </td>
                    <td className="min-w-0 max-w-[14rem] p-3">
                      {bskyHref && bskyLabel ? (
                        <CompactExtLink
                          href={bskyHref}
                          label={bskyLabel}
                          title={`Open ${bskyLabel} on Bluesky`}
                          className="block truncate font-mono text-xs"
                        />
                      ) : (
                        <span className="text-[color:var(--muted-foreground)]">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <span className="inline-flex items-center justify-end gap-3">
                        <Link href={`/entities/${e.id}/edit`} className={linkClass}>
                          Edit
                        </Link>
                        <DeleteFacultyButton id={e.id} name={e.name} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
