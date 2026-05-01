import type { SourceSignalType } from "@/lib/social-signals/workspace-types";

const LABELS: Record<SourceSignalType, string> = {
  paper: "Paper",
  news: "News",
  award: "Award",
  event: "Event",
  funding_opportunity: "Funding opportunity",
  program_update: "Program update",
};

export function SourceSignalTypeBadge({ type }: { type: SourceSignalType }) {
  return (
    <span className="rounded-md border border-[color:var(--border)]/60 bg-[color:var(--background)]/90 px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--muted-foreground)]">
      {LABELS[type]}
    </span>
  );
}
