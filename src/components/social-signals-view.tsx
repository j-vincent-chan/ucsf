import Link from "next/link";
import type { SocialFeedTab, SocialPost, SourceMeta } from "@/lib/social-signals/types";

function PlatformBadge({ platform }: { platform: SocialPost["platform"] }) {
  const label =
    platform === "x" ? "X" : platform === "bluesky" ? "Bluesky" : "LinkedIn";
  const cls =
    platform === "x"
      ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
      : platform === "bluesky"
        ? "bg-sky-600 text-white"
        : "bg-[#0A66C2] text-white";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

function SourceStatus({ meta, label }: { meta: { configured: boolean; detail?: string }; label: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--muted)]/35 px-3 py-2 text-xs leading-snug text-[color:var(--muted-foreground)]">
      <span className="font-medium text-[color:var(--foreground)]">{label}</span>
      {" · "}
      {meta.configured ? (
        <span className="text-emerald-700 dark:text-emerald-400">Connected</span>
      ) : (
        <span>Not configured</span>
      )}
      {meta.detail ? <span className="mt-1 block text-[11px] opacity-90">{meta.detail}</span> : null}
    </div>
  );
}

function tabClass(active: boolean) {
  if (active) {
    return "rounded-xl bg-[color:var(--muted)] px-4 py-2 text-sm font-medium text-[color:var(--foreground)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_85%,white)]";
  }
  return "rounded-xl px-4 py-2 text-sm font-medium text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/62 hover:text-[color:var(--foreground)]";
}

export function SocialSignalsView({
  tab,
  posts,
  sourceMeta,
}: {
  tab: SocialFeedTab;
  posts: SocialPost[];
  sourceMeta: SourceMeta;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-2">
        <h1 className="text-2xl font-semibold text-[color:var(--foreground)]">Social Signals</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--muted-foreground)]">
          Aggregated posts from X, Bluesky, and LinkedIn. The Following tab shows what the community
          account follows (Bluesky home timeline, X list). The Mentions tab shows posts that reference
          your community handles.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Feed type">
        <Link href="/social-signals?tab=following" className={tabClass(tab === "following")} role="tab" aria-selected={tab === "following"}>
          Following
        </Link>
        <Link href="/social-signals?tab=mentions" className={tabClass(tab === "mentions")} role="tab" aria-selected={tab === "mentions"}>
          Mentions
        </Link>
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        <SourceStatus meta={sourceMeta.x} label="X" />
        <SourceStatus meta={sourceMeta.bluesky} label="Bluesky" />
        <SourceStatus meta={sourceMeta.linkedin} label="LinkedIn" />
      </div>

      <ul className="mt-8 space-y-4">
        {posts.length === 0 ? (
          <li className="surface-card rounded-[1.25rem] p-6 text-sm text-[color:var(--muted-foreground)]">
            No posts yet. Configure API keys in{" "}
            <code className="rounded bg-[color:var(--muted)] px-1.5 py-0.5 text-xs">.env.local</code>{" "}
            (see <code className="rounded bg-[color:var(--muted)] px-1.5 py-0.5 text-xs">.env.example</code>
            ) and refresh this page.
          </li>
        ) : (
          posts.map((p) => (
            <li
              key={p.id}
              className="surface-card rounded-[1.25rem] p-4 transition-shadow hover:shadow-md/5"
            >
              <div className="flex flex-wrap items-center gap-2 gap-y-1">
                <PlatformBadge platform={p.platform} />
                <span className="text-sm font-medium text-[color:var(--foreground)]">{p.authorName}</span>
                <span className="text-xs text-[color:var(--muted-foreground)]">{p.authorHandle}</span>
                <span className="text-xs text-[color:var(--muted-foreground)]">
                  · {new Date(p.postedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--foreground)]">
                {p.text}
              </p>
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-xs font-medium text-[color:var(--foreground)] underline decoration-[color:var(--border)] underline-offset-4 hover:decoration-[color:var(--foreground)]"
              >
                Open post
              </a>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
