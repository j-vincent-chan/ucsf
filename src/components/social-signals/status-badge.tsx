import type { PostStatus } from "@/lib/social-signals/workspace-types";

const LABELS: Record<PostStatus, string> = {
  draft: "Draft",
  needs_image: "Needs image",
  needs_review: "Needs review",
  changes_requested: "Changes requested",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
};

const STYLES: Record<PostStatus, string> = {
  draft: "border-[color:var(--border)]/70 bg-[color:var(--muted)]/40 text-[color:var(--muted-foreground)]",
  needs_image: "border-amber-600/35 bg-amber-500/12 text-amber-950 dark:text-amber-100",
  needs_review: "border-sky-600/35 bg-sky-500/12 text-sky-950 dark:text-sky-100",
  changes_requested: "border-orange-600/35 bg-orange-500/12 text-orange-950 dark:text-orange-100",
  approved: "border-emerald-600/35 bg-emerald-500/12 text-emerald-950 dark:text-emerald-100",
  scheduled: "border-violet-600/35 bg-violet-500/12 text-violet-950 dark:text-violet-100",
  published: "border-[color:var(--accent)]/40 bg-[color:var(--accent)]/14 text-[color:var(--foreground)]",
};

export function StatusBadge({ status }: { status: PostStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
