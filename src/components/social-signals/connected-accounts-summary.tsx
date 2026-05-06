import type { AggregatedFeed, SourceMeta } from "@/lib/social-signals/types";

function AccountAvatar({
  url,
  fallbackLetter,
  ariaLabel,
}: {
  url?: string;
  fallbackLetter: string;
  ariaLabel: string;
}) {
  const letter = fallbackLetter.trim().charAt(0).toUpperCase() || "?";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote CDN URLs from X/Bluesky APIs
      <img
        src={url}
        alt=""
        aria-hidden
        className="h-8 w-8 shrink-0 rounded-full border border-[color:var(--border)]/55 object-cover"
      />
    );
  }
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--border)]/55 bg-[color:var(--muted)]/35 text-xs font-semibold text-[color:var(--foreground)]"
      aria-hidden
      title={ariaLabel}
    >
      {letter}
    </div>
  );
}

export function ConnectedAccountsSummary({
  sourceMeta,
  syncedAt,
  accounts,
}: {
  sourceMeta: SourceMeta;
  syncedAt: string;
  accounts: AggregatedFeed["accounts"];
}) {
  const syncLabel = new Date(syncedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const xFallback =
    accounts.xDisplay?.replace(/^@+/, "").charAt(0) ||
    accounts.xName?.charAt(0) ||
    "X";
  const bskyFallback =
    accounts.blueskyDisplay?.replace(/^@+/, "").replace(/\..*$/, "").charAt(0) ||
    accounts.blueskyName?.charAt(0) ||
    "B";

  return (
    <div className="rounded-2xl border border-[color:var(--border)]/75 bg-[color:var(--background)]/92 p-4 shadow-[0_10px_28px_-22px_rgba(35,22,16,0.65)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
        Connected accounts
      </p>
      <ul className="mt-3 space-y-2.5 text-sm">
        <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-[color:var(--border)]/45 pb-2.5">
          <span className="font-semibold text-[color:var(--foreground)]">X</span>
          <div className="flex min-w-0 items-center gap-2">
            <AccountAvatar
              url={accounts.xAvatarUrl}
              fallbackLetter={xFallback}
              ariaLabel={accounts.xDisplay ?? "X account"}
            />
            <span className="truncate text-[color:var(--muted-foreground)]">
              {accounts.xDisplay ?? "—"}
            </span>
          </div>
          <span className={sourceMeta.x.configured ? "text-emerald-700 dark:text-emerald-400" : "text-[color:var(--muted-foreground)]"}>
            {sourceMeta.x.configured ? "Connected" : "Not connected"}
          </span>
        </li>
        <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-[color:var(--foreground)]">Bluesky</span>
          <div className="flex min-w-0 items-center gap-2">
            <AccountAvatar
              url={accounts.blueskyAvatarUrl}
              fallbackLetter={bskyFallback}
              ariaLabel={accounts.blueskyDisplay ?? "Bluesky account"}
            />
            <span className="truncate text-[color:var(--muted-foreground)]">{accounts.blueskyDisplay ?? "—"}</span>
          </div>
          <span className={sourceMeta.bluesky.configured ? "text-emerald-700 dark:text-emerald-400" : "text-[color:var(--muted-foreground)]"}>
            {sourceMeta.bluesky.configured ? "Connected" : "Not connected"}
          </span>
        </li>
      </ul>
      <p className="mt-3 text-[11px] text-[color:var(--muted-foreground)]">
        Last ingest sync: <span className="font-medium text-[color:var(--foreground)]">{syncLabel}</span>
      </p>
      <p className="mt-2 text-[11px] leading-snug text-[color:var(--muted-foreground)]">
        {sourceMeta.x.detail ? <span className="block">X: {sourceMeta.x.detail}</span> : null}
        {sourceMeta.bluesky.detail ? <span className="block">Bluesky: {sourceMeta.bluesky.detail}</span> : null}
      </p>
    </div>
  );
}
