import type { SourceMeta } from "@/lib/social-signals/types";

export function ConnectedAccountsSummary({
  sourceMeta,
  syncedAt,
  accounts,
}: {
  sourceMeta: SourceMeta;
  syncedAt: string;
  accounts: { xDisplay?: string; blueskyDisplay?: string };
}) {
  const syncLabel = new Date(syncedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="rounded-2xl border border-[color:var(--border)]/75 bg-[color:var(--background)]/92 p-4 shadow-[0_10px_28px_-22px_rgba(35,22,16,0.65)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
        Connected accounts
      </p>
      <ul className="mt-3 space-y-2.5 text-sm">
        <li className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border)]/45 pb-2.5">
          <span className="font-semibold text-[color:var(--foreground)]">X</span>
          <span className="text-[color:var(--muted-foreground)]">
            {accounts.xDisplay ?? "—"}
          </span>
          <span className={sourceMeta.x.configured ? "text-emerald-700 dark:text-emerald-400" : "text-[color:var(--muted-foreground)]"}>
            {sourceMeta.x.configured ? "Connected" : "Not connected"}
          </span>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border)]/45 pb-2.5">
          <span className="font-semibold text-[color:var(--foreground)]">Bluesky</span>
          <span className="text-[color:var(--muted-foreground)] truncate max-w-[12rem]">
            {accounts.blueskyDisplay ?? "—"}
          </span>
          <span className={sourceMeta.bluesky.configured ? "text-emerald-700 dark:text-emerald-400" : "text-[color:var(--muted-foreground)]"}>
            {sourceMeta.bluesky.configured ? "Connected" : "Not connected"}
          </span>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <span className="font-semibold text-[color:var(--foreground)]">LinkedIn</span>
          <span className="text-xs text-[color:var(--muted-foreground)]">Coming soon</span>
          <span className="text-[color:var(--muted-foreground)]">
            {sourceMeta.linkedin.configured ? "Keys on file" : "Not configured"}
          </span>
        </li>
      </ul>
      <p className="mt-3 text-[11px] text-[color:var(--muted-foreground)]">
        Last ingest sync: <span className="font-medium text-[color:var(--foreground)]">{syncLabel}</span>
      </p>
      <p className="mt-2 text-[11px] leading-snug text-[color:var(--muted-foreground)]">
        {sourceMeta.x.detail ? <span className="block">X: {sourceMeta.x.detail}</span> : null}
        {sourceMeta.bluesky.detail ? <span className="block">Bluesky: {sourceMeta.bluesky.detail}</span> : null}
        {sourceMeta.linkedin.detail ? <span className="block">LinkedIn: {sourceMeta.linkedin.detail}</span> : null}
      </p>
      <p className="mt-3 text-xs leading-snug text-[color:var(--muted-foreground)]">
        Reconnect or rotate credentials via server environment variables (see{" "}
        <code className="rounded bg-[color:var(--muted)]/45 px-1 py-0.5 text-[11px]">.env.example</code>
        ). Deployments require a restart after changes.
      </p>
    </div>
  );
}
