import type { PublishPlatform } from "@/lib/social-signals/workspace-types";
import type { SocialPlatform } from "@/lib/social-signals/types";

type Plat = PublishPlatform | SocialPlatform;

export function PlatformBadge({ platform, size = "sm" }: { platform: Plat; size?: "sm" | "xs" }) {
  const isX = platform === "x";
  const label = isX ? "X" : "Bluesky";
  const cls = isX
    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
    : "bg-sky-600 text-white";
  const sz = size === "xs" ? "px-1 py-0 text-[9px]" : "px-1.5 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md font-semibold uppercase tracking-wide ${cls} ${sz}`}
    >
      {label}
    </span>
  );
}
