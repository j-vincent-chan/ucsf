"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MemberStatus } from "@/types/database";
import { tierFromMemberStatus } from "@/lib/member-tier";
import { DeleteFacultyButton } from "./delete-faculty-button";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type WatchlistEntityRow = {
  id: string;
  name: string;
  member_status: MemberStatus | string;
  institution: string | null;
  nih_profile_id: string | null;
  lab_website: string | null;
  active: boolean;
};

function hrefForLabWebsite(raw: string | null | undefined): string | null {
  let s = raw?.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

function memberLabel(s: MemberStatus | string): string {
  switch (s) {
    case "leadership_committee":
      return "Leadership Committee";
    case "member":
    case "full_member":
      return "Member";
    case "associate":
      return "Associate";
    default:
      return String(s);
  }
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
      <div className="soft-table overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <tbody>
            <tr>
              <td colSpan={8} className="p-10 text-center text-[color:var(--muted-foreground)]">
                No faculty match. Clear filters or add one.
              </td>
            </tr>
          </tbody>
        </table>
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

      <div className="soft-table overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
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
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Member</th>
              <th className="p-3 font-medium">Institution</th>
              <th className="p-3 font-medium whitespace-nowrap">NIH profile ID</th>
              <th className="p-3 font-medium">Tier</th>
              <th className="p-3 font-medium">Active</th>
              <th className="p-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const labHref = hrefForLabWebsite(e.lab_website);
              return (
                <tr key={e.id} className="align-top">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={activeSelected.has(e.id)}
                      onChange={() => toggle(e.id)}
                      aria-label={`Select ${e.name}`}
                    />
                  </td>
                  <td className="p-3 font-medium">
                    {labHref ? (
                      <a
                        href={labHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[color:var(--foreground)] underline decoration-[color:var(--muted-foreground)]/55 underline-offset-2"
                      >
                        {e.name}
                      </a>
                    ) : (
                      e.name
                    )}
                  </td>
                  <td className="p-3">{memberLabel(e.member_status)}</td>
                  <td className="max-w-[240px] p-3 text-[color:var(--muted-foreground)]">
                    {e.institution ?? "—"}
                  </td>
                  <td className="p-3 font-mono text-xs text-[color:var(--muted-foreground)]">
                    {e.nih_profile_id?.trim() ? (
                      <a
                        href={`https://reporter.nih.gov/person-details/${e.nih_profile_id.trim()}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[color:var(--foreground)] underline decoration-[color:var(--muted-foreground)]/55 underline-offset-2"
                      >
                        {e.nih_profile_id.trim()}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3">{tierFromMemberStatus(e.member_status)}</td>
                  <td className="p-3">{e.active ? "Yes" : "No"}</td>
                  <td className="p-3 text-right">
                    <span className="inline-flex items-center justify-end gap-3">
                      <Link
                        href={`/entities/${e.id}/edit`}
                        className="text-[color:var(--foreground)] underline decoration-[color:var(--muted-foreground)]/55 underline-offset-2"
                      >
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
  );
}
