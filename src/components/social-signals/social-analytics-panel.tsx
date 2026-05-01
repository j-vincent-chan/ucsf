import type { AnalyticsSummary } from "@/lib/social-signals/workspace-types";

function Metric({ label, value, suffix }: { label: string; value: string | number | null; suffix?: string }) {
  const display = value == null ? "—" : typeof value === "number" ? value.toLocaleString() : value;
  return (
    <div className="rounded-xl border border-[color:var(--border)]/60 bg-[color:var(--muted)]/15 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-[color:var(--foreground)]">
        {display}
        {suffix && value != null ? suffix : ""}
      </p>
    </div>
  );
}

export function SocialAnalyticsPanel({ data }: { data: AnalyticsSummary }) {
  return (
    <div className="space-y-6">
      {data.demoMetrics ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
          Demo metrics shown — wire analytics APIs to replace placeholders while preserving layout.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Published posts" value={data.publishedPosts} />
        <Metric label="Impressions / views" value={data.impressions} />
        <Metric label="Likes" value={data.likes} />
        <Metric label="Reposts" value={data.reposts} />
        <Metric label="Replies" value={data.replies} />
        <Metric label="Link clicks" value={data.linkClicks} />
        <Metric label="Engagement rate" value={data.engagementRate} suffix="%" />
        <Metric label="Follower growth" value={data.followerGrowth} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/90 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
            Best-performing X post
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--foreground)]">{data.bestPostX ?? "—"}</p>
        </div>
        <div className="rounded-2xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/90 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
            Best-performing Bluesky post
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--foreground)]">{data.bestPostBluesky ?? "—"}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[color:var(--border)]/70 bg-[color:var(--background)]/92 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
          Signal-linked insights
        </p>
        <ul className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <li>
            <span className="text-[color:var(--muted-foreground)]">Top topics:</span>{" "}
            <span className="text-[color:var(--foreground)]">{data.topTopics.join(", ")}</span>
          </li>
          <li>
            <span className="text-[color:var(--muted-foreground)]">Top investigators / programs:</span>{" "}
            <span className="text-[color:var(--foreground)]">{data.topInvestigators.join("; ")}</span>
          </li>
          <li>
            <span className="text-[color:var(--muted-foreground)]">Best content type:</span>{" "}
            <span className="text-[color:var(--foreground)]">{data.bestContentType}</span>
          </li>
          <li>
            <span className="text-[color:var(--muted-foreground)]">Best platform:</span>{" "}
            <span className="font-semibold capitalize text-[color:var(--foreground)]">{data.bestPlatform}</span>
          </li>
          <li>
            <span className="text-[color:var(--muted-foreground)]">Best visual style:</span>{" "}
            <span className="text-[color:var(--foreground)]">{data.bestVisualStyle}</span>
          </li>
          <li>
            <span className="text-[color:var(--muted-foreground)]">Audience fit:</span>{" "}
            <span className="text-[color:var(--foreground)]">{data.bestAudienceFit}</span>
          </li>
        </ul>
        <p className="mt-4 border-t border-[color:var(--border)]/45 pt-3 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
          Content-to-impact trail (Signal → post → engagement) will fill from tracked links and platform APIs.
        </p>
      </div>

      {data.suggestedNextAction ? (
        <div className="rounded-2xl border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 p-4 text-sm text-[color:var(--foreground)]">
          <span className="font-semibold">Suggested next action:</span> {data.suggestedNextAction}
        </div>
      ) : null}
    </div>
  );
}
