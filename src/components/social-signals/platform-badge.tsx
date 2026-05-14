import type { PublishPlatform } from "@/lib/social-signals/workspace-types";
import type { SocialPlatform } from "@/lib/social-signals/types";

type Plat = PublishPlatform | SocialPlatform;

/** Simple Icons–style paths, viewBox 0 0 24 24 */
const PATH_X =
  "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z";

const PATH_BLUESKY =
  "M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026";

export function PlatformBadge({
  platform,
  size = "sm",
}: {
  platform: Plat;
  /** `md` — larger marks for prominent labels (e.g. queue cards). */
  size?: "sm" | "xs" | "md";
}) {
  const isX = platform === "x";
  const label = isX ? "X" : "Bluesky";

  const box =
    size === "xs"
      ? "h-5 w-5 rounded-md p-[3px]"
      : size === "md"
        ? "h-8 w-8 rounded-lg p-1.5"
        : "h-6 w-6 rounded-[7px] p-[5px]";

  const shell = isX
    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
    : "bg-[#0085FF] text-white";

  const path = isX ? PATH_X : PATH_BLUESKY;

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center ${shell} ${box}`}
    >
      <svg viewBox="0 0 24 24" className="h-full w-full overflow-visible" aria-hidden>
        <path fill="currentColor" d={path} />
      </svg>
    </span>
  );
}
