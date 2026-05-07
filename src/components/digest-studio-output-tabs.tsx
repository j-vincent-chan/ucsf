"use client";

import type { ReactNode } from "react";
import type { SummaryStyle } from "@/types/database";

export type DigestStudioOutputTab = {
  style: SummaryStyle;
  label: string;
  selectable: boolean;
  /** Icon(s) before the label (e.g. channel logos). */
  leading?: ReactNode;
};

const TAB_ICON = "h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5";

/** X + Bluesky marks for the Social digest tab (brand colors; size bumps slightly on `sm+`). */
export function DigestStudioTabLeadingIcon({ style }: { style: SummaryStyle }) {
  if (style === "bluesky_x") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5" aria-hidden>
        <svg
          className={`${TAB_ICON} shrink-0 text-[#0f1419] dark:text-neutral-100`}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        {/* Official butterfly mark (Simple Icons path, matches Bluesky brand SVG). */}
        <svg className={`${TAB_ICON} shrink-0 text-[#0085ff]`} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026" />
        </svg>
      </span>
    );
  }
  if (style === "newsletter") {
    return (
      <svg
        className={`${TAB_ICON} shrink-0 text-[#a15c4c]`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    );
  }
  if (style === "linkedin") {
    return (
      <svg
        className={`${TAB_ICON} shrink-0 text-[#0a66c2]`}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
      >
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    );
  }
  return null;
}

export function DigestStudioOutputTabs({
  tabs,
  activeStyle,
  onSelectStyle,
  disabled,
  variant = "default",
  omitNavChrome = false,
}: {
  tabs: DigestStudioOutputTab[];
  activeStyle: SummaryStyle | null;
  onSelectStyle: (style: SummaryStyle) => void;
  /** Global disable (e.g. archiving); individual tabs are also disabled until text exists. */
  disabled?: boolean;
  /** Warm cream card + terracotta active accent (digest output preview). */
  variant?: "default" | "warm";
  /** No outer tab-strip border — use when a parent card already provides edges (avoids double lines). */
  omitNavChrome?: boolean;
}) {
  const warm = variant === "warm";
  const flatChrome = !warm && omitNavChrome;

  return (
    <nav
      className={
        warm
          ? "flex flex-wrap gap-x-2 gap-y-0 leading-none"
          : flatChrome
            ? "flex flex-wrap rounded-none border-0 bg-[color:var(--muted)]/10 px-0.5 pt-0.5"
            : "-mx-px flex flex-wrap rounded-t-lg border-x border-t border-[color:var(--border)]/65 bg-[color:var(--muted)]/14 px-0.5 pt-0.5 sm:mx-0"
      }
      role="tablist"
      aria-label="Digest outputs"
    >
      {tabs.map((tab) => {
        const isCurrent = activeStyle != null && activeStyle === tab.style;
        /** Can switch to this channel only once text exists; current channel stays focusable so you’re not stuck. */
        const canSwitchHere = tab.selectable || isCurrent;
        const tabDisabled = Boolean(disabled || !canSwitchHere);

        const labelWrap = (
          <span className="inline-flex items-center gap-2">
            {tab.leading ? <span className="flex shrink-0 items-center [&_svg]:block">{tab.leading}</span> : null}
            <span className="leading-none">{tab.label}</span>
          </span>
        );

        if (warm) {
          return (
            <button
              key={tab.style}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              aria-disabled={tabDisabled}
              disabled={tabDisabled}
              title={
                !tab.selectable && !isCurrent ? "Generate this output before you can open it here" : undefined
              }
              onClick={() => {
                if (!tabDisabled) onSelectStyle(tab.style);
              }}
              className={`flex min-h-12 shrink-0 items-center justify-start rounded-lg border px-3 py-3 text-left text-sm font-semibold tracking-tight transition-colors focus-visible:z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[#fcfaf8] ${
                tabDisabled
                  ? "cursor-not-allowed border-[#e5e1de]/80 text-[#7c6f64] opacity-45"
                  : isCurrent
                    ? "border border-[#e5e1de] bg-white text-[#3c3836] ring-1 ring-[color:var(--accent)]/20"
                    : "border-[#e5e1de] bg-transparent text-[#7c6f64] hover:border-[#d5cfc9] hover:bg-white/70 hover:text-[#3c3836]"
              } `}
            >
              {labelWrap}
            </button>
          );
        }

        return (
          <button
            key={tab.style}
            type="button"
            role="tab"
            aria-selected={isCurrent}
            aria-disabled={tabDisabled}
            disabled={tabDisabled}
            title={
              !tab.selectable && !isCurrent ? "Generate this output before you can open it here" : undefined
            }
            onClick={() => {
              if (!tabDisabled) onSelectStyle(tab.style);
            }}
            className={`flex min-h-11 shrink-0 items-center justify-start rounded-t-lg px-4 py-2.5 text-left text-sm font-semibold tracking-tight transition-colors focus-visible:z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[color:var(--background)] ${
              tabDisabled
                ? "mb-[-1px] cursor-not-allowed border border-transparent text-[color:var(--muted-foreground)] opacity-50"
                : isCurrent
                  ? flatChrome
                    ? "relative z-[1] mb-[-1px] border border-[color:var(--border)]/40 border-b-0 bg-[color:var(--card)] text-[color:var(--foreground)]"
                    : "relative z-[1] mb-[-1px] border border-[color:var(--border)]/70 border-b-0 bg-[color:var(--card)] text-[color:var(--foreground)] shadow-[0_-2px_12px_-4px_rgba(55,42,36,0.12)]"
                  : "mb-[-1px] border border-transparent text-[color:var(--muted-foreground)] hover:border-[color:var(--border)]/45 hover:bg-[color:var(--card)]/40 hover:text-[color:var(--foreground)]"
            } `}
          >
            {tab.leading ? labelWrap : <span className="leading-none">{tab.label}</span>}
          </button>
        );
      })}
    </nav>
  );
}
