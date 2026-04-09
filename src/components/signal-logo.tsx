import Image from "next/image";

/** Shared product tagline (nav, login, metadata). */
export const SIGNAL_SUBTITLE = "Research Intelligence";

/** Red pill — `em` sizing; pair with `[vertical-align:super]` for true superscript. */
const alphaPillSm =
  "inline-block rounded border border-red-800/35 bg-red-600 px-[0.18em] py-[0.04em] text-[0.4em] font-bold uppercase leading-none tracking-wide text-white shadow-sm ring-1 ring-inset ring-white/15 dark:border-red-900/50 dark:bg-red-600 dark:text-white";

const alphaPillMd =
  "inline-block rounded-md border border-red-800/35 bg-red-600 px-[0.2em] py-[0.05em] text-[0.34em] font-bold uppercase leading-none tracking-wide text-white shadow-sm ring-1 ring-inset ring-white/15 dark:border-red-900/50 dark:bg-red-600 dark:text-white";

function AlphaMark({ size }: { size: "sm" | "md" }) {
  return (
    <span
      className={`ms-0.5 font-sans leading-[1] [vertical-align:super] ${
        size === "md" ? alphaPillMd : alphaPillSm
      }`}
    >
      alpha
    </span>
  );
}

type HeadingTag = "div" | "h1" | "h2";

/**
 * Text-only lockup: Signal + subtitle. Use on auth screens (stacked title / tagline).
 */
export function SignalWordmark({
  className = "",
  showSubtitle = true,
  size = "sm",
  as: TitleTag = "div",
}: {
  className?: string;
  showSubtitle?: boolean;
  size?: "sm" | "md";
  as?: HeadingTag;
}) {
  const title =
    size === "md"
      ? "text-5xl font-bold tracking-[-0.04em] sm:text-6xl sm:tracking-[-0.045em]"
      : "text-2xl font-bold tracking-[-0.035em]";
  const subtitle =
    size === "md"
      ? "text-base font-medium leading-none tracking-normal text-neutral-500 dark:text-neutral-400 sm:text-lg"
      : "text-sm font-medium leading-none tracking-[0.01em] text-neutral-500 dark:text-neutral-500";

  const stackGap = size === "md" ? "gap-1 sm:gap-1.5" : "gap-0.5";

  return (
    <div className={`flex min-w-0 flex-col ${stackGap} ${className}`.trim()}>
      <TitleTag
        className={`leading-none text-neutral-900 dark:text-neutral-50 ${title}`}
      >
        <span className="inline-block whitespace-nowrap">
          Signal
          <AlphaMark size={size} />
        </span>
      </TitleTag>
      {showSubtitle ? (
        <p className={subtitle}>{SIGNAL_SUBTITLE}</p>
      ) : null}
    </div>
  );
}

/** Brand mark + wordmark. Subtitle sits under icon + “Signal” for a clear vertical flow. */
export function SignalLogo({
  className = "",
  showSubtitle = true,
}: {
  className?: string;
  showSubtitle?: boolean;
}) {
  return (
    <div
      className={`grid w-full min-w-0 grid-cols-[auto_1fr] gap-x-2.5 ${showSubtitle ? "gap-y-0" : "items-center"} ${className}`.trim()}
      aria-label={`Signal alpha ${SIGNAL_SUBTITLE}`}
    >
      <div
        className={
          showSubtitle
            ? "row-span-2 flex items-center justify-start"
            : "flex items-center"
        }
      >
        <Image
          src="/signal-logo.png"
          alt=""
          width={332}
          height={279}
          className="h-12 w-auto shrink-0"
          priority
        />
      </div>
      <div className="min-w-0 self-start leading-none overflow-visible">
        <span className="inline-block whitespace-nowrap text-2xl font-bold tracking-[-0.035em] text-neutral-900 dark:text-neutral-50">
          Signal
          <AlphaMark size="sm" />
        </span>
      </div>
      {showSubtitle ? (
        <p className="col-start-2 -mt-1 min-w-0 text-[11px] font-medium leading-none tracking-[0.02em] text-neutral-500 dark:text-neutral-500">
          {SIGNAL_SUBTITLE}
        </p>
      ) : null}
    </div>
  );
}
