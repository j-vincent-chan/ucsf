"use client";

import type { Recommendation } from "@/lib/social-signals/workspace-types";
import { PlatformBadge } from "./platform-badge";

export function RecommendationPanel({
  items,
  onAction,
}: {
  items: Recommendation[];
  onAction?: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)]/75 bg-[color:var(--background)]/92 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
        AI recommendations
      </p>
      <ul className="mt-3 space-y-3">
        {items.map((r) => (
          <li
            key={r.id}
            className="rounded-xl border border-[color:var(--border)]/55 bg-[color:var(--card)]/90 p-3 shadow-[0_8px_22px_-20px_rgba(40,26,18,0.45)]"
          >
            <p className="text-sm font-semibold text-[color:var(--foreground)]">{r.action}</p>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--muted-foreground)]">{r.reason}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {r.platforms.map((p) => (
                <PlatformBadge key={p} platform={p} size="xs" />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-[color:var(--foreground)]">
              <span className="font-medium">Angle:</span> {r.angle}
            </p>
            <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
              <span className="font-medium text-[color:var(--foreground)]">Review:</span> {r.reviewNeed}
            </p>
            {r.ctaLabel ? (
              <button
                type="button"
                onClick={() => onAction?.(r.id)}
                className="mt-2 rounded-lg bg-[color:var(--foreground)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--background)] transition-opacity hover:opacity-90"
              >
                {r.ctaLabel}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
