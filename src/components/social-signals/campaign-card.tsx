import type { Campaign } from "@/lib/social-signals/workspace-types";
import { PlatformBadge } from "./platform-badge";

const AUDIENCE_LABEL: Record<Campaign["audience"], string> = {
  public: "Public",
  scientific: "Scientific",
  donor_facing: "Donor-facing",
  internal: "Internal",
  trainee: "Trainee",
};

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  return (
    <article className="rounded-2xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/92 p-4 shadow-[0_12px_30px_-24px_rgba(38,24,17,0.55)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-[color:var(--foreground)]">{campaign.name}</h3>
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">{campaign.goal}</p>
        </div>
        <span className="rounded-lg border border-[color:var(--border)]/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
          {campaign.status}
        </span>
      </div>
      <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">Audience: {AUDIENCE_LABEL[campaign.audience]}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {campaign.platforms.map((p) => (
          <PlatformBadge key={p} platform={p} size="xs" />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-lg bg-[color:var(--muted)]/20 px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase text-[color:var(--muted-foreground)]">Planned</p>
          <p className="font-bold text-[color:var(--foreground)]">{campaign.plannedPosts}</p>
        </div>
        <div className="rounded-lg bg-[color:var(--muted)]/20 px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase text-[color:var(--muted-foreground)]">Upcoming</p>
          <p className="font-bold text-[color:var(--foreground)]">{campaign.upcomingCount}</p>
        </div>
        {campaign.impressionsDemo != null ? (
          <div className="rounded-lg bg-[color:var(--muted)]/20 px-2 py-1.5">
            <p className="text-[10px] font-semibold uppercase text-[color:var(--muted-foreground)]">Impr. (demo)</p>
            <p className="font-bold text-[color:var(--foreground)]">{campaign.impressionsDemo.toLocaleString()}</p>
          </div>
        ) : null}
      </div>
    </article>
  );
}
