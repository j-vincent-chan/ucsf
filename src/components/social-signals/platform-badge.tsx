import type { PublishPlatform } from "@/lib/social-signals/workspace-types";
import type { SocialPlatform } from "@/lib/social-signals/types";

type Plat = PublishPlatform | SocialPlatform;

export function PlatformBadge({
  platform,
  size = "sm",
}: {
  platform: Plat;
  /** `md` — larger pills for recommendation cards and prominent labels. */
  size?: "sm" | "xs" | "md";
}) {
  const isX = platform === "x";
  const label = isX ? "X" : "Bluesky";
  const cls = isX
    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
    : "bg-sky-600 text-white";
  const sz =
    size === "xs"
      ? "min-h-[1.125rem] px-1 py-0 text-[9px] rounded-md"
      : size === "md"
        ? "min-h-[1.25rem] px-2 py-0.5 text-[10px] rounded-md tracking-wide"
        : "min-h-[1.25rem] px-1.5 py-0.5 text-[10px] rounded-md";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-semibold uppercase ${cls} ${sz}`}
    >
      {label}
    </span>
  );
}
