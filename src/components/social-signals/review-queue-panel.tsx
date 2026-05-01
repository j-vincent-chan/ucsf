"use client";

import { useState } from "react";
import type { PostStatus, ReviewQueueItem } from "@/lib/social-signals/workspace-types";
import { PlatformBadge } from "./platform-badge";
import { StatusBadge } from "./status-badge";

const FLAGS_LABEL: Record<string, string> = {
  needs_pi_review: "Needs PI review",
  mentions_unpublished_data: "Unpublished data",
  needs_image_rights: "Image rights",
  needs_alt_text: "Alt text",
  needs_funder_acknowledgement: "Funder acknowledgement",
  embargo_sensitive: "Embargo / date-sensitive",
  needs_program_comms_review: "Program comms",
};

export function ReviewQueuePanel({ initialItems }: { initialItems: ReviewQueueItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  function transition(itemId: string, next: PostStatus) {
    setItems((prev) =>
      prev.map((row) =>
        row.id === itemId ? { ...row, reviewStatus: next, post: { ...row.post, status: next }, version: row.version + 1 } : row,
      ),
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[color:var(--muted-foreground)]">
        Lightweight review workflow (local demo). Approve items before scheduling or publishing when integrations are enabled.
      </p>
      <ul className="space-y-4">
        {items.map((row) => (
          <li key={row.id} className="rounded-2xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/92 p-4 shadow-[0_12px_32px_-26px_rgba(38,24,17,0.55)]">
            <div className="flex flex-wrap items-center gap-2">
              <PlatformBadge platform={row.post.platform} size="xs" />
              <StatusBadge status={row.reviewStatus} />
              <span className="text-[11px] text-[color:var(--muted-foreground)]">v{row.version}</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-[color:var(--foreground)] line-clamp-2">{row.post.text}</p>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
              Signal: {row.post.sourceSignalTitle}
              {row.assignedReviewer ? ` · Reviewer: ${row.assignedReviewer}` : ""}
              {row.dueDate ? ` · Due ${new Date(row.dueDate).toLocaleDateString()}` : ""}
            </p>

            {row.flags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {row.flags.map((f) => (
                  <span key={f} className="rounded-md bg-amber-500/14 px-2 py-0.5 text-[10px] font-semibold text-amber-950 dark:text-amber-100">
                    {FLAGS_LABEL[f] ?? f}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-3 space-y-2 border-t border-[color:var(--border)]/45 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">Comments</p>
              {row.comments.map((c) => (
                <div key={c.id} className="flex gap-2 text-xs">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--muted)]/45 text-[11px] font-bold text-[color:var(--foreground)]">
                    {c.initials}
                  </span>
                  <div>
                    <p className="font-medium text-[color:var(--foreground)]">{c.author}</p>
                    <p className="text-[color:var(--foreground)]/90">{c.body}</p>
                    <p className="text-[10px] text-[color:var(--muted-foreground)]">{new Date(c.at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add internal comment…"
                  value={commentDrafts[row.id] ?? ""}
                  onChange={(e) => setCommentDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                  className="min-w-0 flex-1 rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)]/95 px-2 py-1.5 text-xs"
                />
                <button
                  type="button"
                  className="rounded-lg border border-[color:var(--border)]/70 px-2 py-1 text-[11px] font-semibold text-[color:var(--foreground)]"
                  onClick={() => {
                    const body = (commentDrafts[row.id] ?? "").trim();
                    if (!body) return;
                    setItems((prev) =>
                      prev.map((r) =>
                        r.id === row.id
                          ? {
                              ...r,
                              comments: [
                                ...r.comments,
                                {
                                  id: `new-${Date.now()}`,
                                  author: "You",
                                  initials: "YO",
                                  body,
                                  at: new Date().toISOString(),
                                },
                              ],
                            }
                          : r,
                      ),
                    );
                    setCommentDrafts((d) => ({ ...d, [row.id]: "" }));
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-[color:var(--border)]/70 px-2 py-1 text-[11px] font-semibold"
                onClick={() => transition(row.id, "needs_review")}
              >
                → Needs review
              </button>
              <button
                type="button"
                className="rounded-lg border border-[color:var(--border)]/70 px-2 py-1 text-[11px] font-semibold"
                onClick={() => transition(row.id, "approved")}
              >
                Approve
              </button>
              <button
                type="button"
                className="rounded-lg border border-[color:var(--border)]/70 px-2 py-1 text-[11px] font-semibold"
                onClick={() => transition(row.id, "scheduled")}
              >
                Mark scheduled
              </button>
              <button
                type="button"
                className="rounded-lg border border-[color:var(--border)]/70 px-2 py-1 text-[11px] font-semibold"
                onClick={() => transition(row.id, "published")}
              >
                Mark published
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
