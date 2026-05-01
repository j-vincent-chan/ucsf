import type { RecentActivityItem } from "@/lib/social-signals/workspace-types";
import { PlatformBadge } from "./platform-badge";

export function RecentActivityPanel({ items }: { items: RecentActivityItem[] }) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)]/75 bg-[color:var(--background)]/92 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
        Recent activity
      </p>
      <ul className="mt-3 space-y-2.5">
        {items.map((a) => (
          <li key={a.id} className="flex gap-2 text-xs leading-snug">
            {a.platform ? (
              <span className="mt-0.5 shrink-0">
                <PlatformBadge platform={a.platform} size="xs" />
              </span>
            ) : (
              <span className="mt-0.5 h-4 w-4 shrink-0 rounded bg-[color:var(--muted)]/40" aria-hidden />
            )}
            <div>
              <p className="text-[color:var(--foreground)]">{a.summary}</p>
              <p className="text-[10px] text-[color:var(--muted-foreground)]">
                {new Date(a.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
