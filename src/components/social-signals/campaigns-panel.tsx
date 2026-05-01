import { INITIAL_CAMPAIGNS } from "@/lib/social-signals/workspace-demo-data";
import { CampaignCard } from "./campaign-card";

export function CampaignsPanel() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {INITIAL_CAMPAIGNS.map((c) => (
        <CampaignCard key={c.id} campaign={c} />
      ))}
    </div>
  );
}
