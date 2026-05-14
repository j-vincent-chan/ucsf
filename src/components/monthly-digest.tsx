"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { ItemCategory, Json, SourceType, Summary, SummaryStyle } from "@/types/database";
import { SummaryEditor } from "@/components/summary-editor";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CategoryTag, sourceTypeDisplayLabel, SourceTypeTag } from "@/app/(main)/items/queue-cell-tags";
import { ucsfProfilesUrl } from "@/lib/ucsf-profiles-url";
import {
  DIGEST_CATEGORY_FILTER_CHIPS,
  categoryDisplayLabel,
  digestCategoryChipLabel,
  matchesDigestCategoryChip,
  type DigestCategoryFilterChip,
} from "@/lib/item-category-ui";
import { formatYearMonthLabel } from "@/lib/digest-month";
import {
  DEFAULT_DIGEST_SUMMARY_TONE,
  DIGEST_SUMMARY_TONE_OPTIONS,
  type DigestSummaryTone,
} from "@/lib/digest-summary-tone";
import {
  DigestStudioOutputTabs,
  DigestStudioTabLeadingIcon,
  type DigestStudioOutputTab,
} from "@/components/digest-studio-output-tabs";
import { DigestIllustrationOverlays } from "@/components/digest-illustration-overlays";
import { LinkedInvestigatorsFacepile } from "@/components/linked-investigators-facepile";
import { WorkspaceHandleAvatarImg, type WorkspaceAccountAvatars } from "@/components/workspace-handle-avatar-img";
import {
  DIGEST_CONTENT_STUDIO_OUTPUT_OPTIONS,
  DIGEST_CONTENT_STUDIO_STYLES,
  digestSummaryHasGeneratedText,
  isDigestSocialOutputStyle,
  pickDefaultDigestOutputId,
  sortSummariesForDigestOutputs,
} from "@/lib/digest-output-styles";
import {
  isDigestStudioPlaceholderSummary,
  makeDigestStudioPlaceholderSummary,
} from "@/lib/digest-studio-placeholder-summary";
import { blurbCharRangeForStyle } from "@/lib/blurb-length-range";
import {
  type DigestCoverStore,
  type DigestVisualBundle,
  activeVisualImageDataUrl,
  digestCoverStoreHasHeroSelection,
  getActiveCandidate,
  getBundleForChannel,
  parseDigestCoverStoreFromDb,
  type DigestVisualChannelStyle,
} from "@/lib/digest-visual-types";
import { mergeWhyIntoBlurb, parseBlurbJson } from "@/lib/blurb-content";
import { BLUESKY_CHAR_LIMIT } from "@/lib/social-signals/workspace-types";
import { DigestVisualPanel, DIGEST_MEDIA_LIBRARY_SUBTITLE } from "@/components/digest-visual-panel";
import { digestHeroIllustrationOverlayLayout } from "@/lib/digest-illustration-overlay-layout";
import { isDigestVisualTransientFailure } from "@/lib/db-timeout-message";
import scimagoSjrLookupJson from "@/data/scimago-sjr-lookup.json";
import type { ScimagoSjrLookup } from "@/lib/scimago-sjr-lookup";
import {
  buildDigestItemSortMap,
  type ReferencePublicationsSortMode,
  sortOutputPreviewReferenceRows,
} from "@/lib/digest-reference-sort";
import type { LinkPreviewMeta } from "@/lib/fetch-link-preview-meta";
const SCIMAGO_SJR_LOOKUP = scimagoSjrLookupJson as ScimagoSjrLookup;

function CollapseChevron({ open, variant = "default" }: { open: boolean; variant?: "default" | "onAccent" }) {
  const tone =
    variant === "onAccent"
      ? "text-[color:var(--accent-foreground)]"
      : "text-[color:var(--muted-foreground)]";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${tone} transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function BrowseTypeSectionFilterIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-[color:var(--muted-foreground)] ${className}`}
      aria-hidden
    >
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  );
}

function BulkActionsSectionIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-[color:var(--muted-foreground)] ${className}`}
      aria-hidden
    >
      <path d="m3 17 2 2 4-4" />
      <path d="m3 7 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </svg>
  );
}

/** Sliders — pairs with “Output options” like BulkActionsSectionIcon + “Bulk actions”. */
function OutputOptionsSectionIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-[color:var(--muted-foreground)] ${className}`}
      aria-hidden
    >
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <path d="M2 14h4" />
      <path d="M10 8h4" />
      <path d="M18 16h4" />
    </svg>
  );
}

/** Shared shell: Active Drafts filter + References selection panels (photo 1 baseline). */
const DIGEST_WORKSPACE_PANEL_CLASS =
  "rounded-xl border-[color:var(--border)]/55 bg-[color:var(--background)]/75 p-3 shadow-[0_8px_28px_-22px_rgba(52,38,30,0.22)]";

function WorkspaceViewSummariesIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-[1.125rem] w-[1.125rem] shrink-0 sm:h-5 sm:w-5 ${className}`}
      aria-hidden
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <path d="M14 2v6h6" />
      <path d="M10 12h4" />
      <path d="M10 16h7" />
    </svg>
  );
}

function WorkspaceViewReferencesIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-[1.125rem] w-[1.125rem] shrink-0 sm:h-5 sm:w-5 ${className}`}
      aria-hidden
    >
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  );
}

function DigestQueueCategoryFilterIcon({
  chip,
  className = "",
}: {
  chip: DigestCategoryFilterChip;
  className?: string;
}) {
  const common = `h-3.5 w-3.5 shrink-0 stroke-[1.25] ${className}`.trim();
  switch (chip) {
    case "all":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={common}
          aria-hidden
        >
          <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
          <path d="m2 12 8.58 3.91a2 2 0 0 0 1.66 0L20 12" />
          <path d="m2 17 8.58 3.91a2 2 0 0 0 1.66 0L20 17" />
        </svg>
      );
    case "paper":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={common}
          aria-hidden
        >
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M10 9H8" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </svg>
      );
    case "funding":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={common}
          aria-hidden
        >
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="2" />
          <path d="M6 12h.01M18 12h.01" />
        </svg>
      );
    case "award":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={common}
          aria-hidden
        >
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      );
    case "news":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={common}
          aria-hidden
        >
          <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
          <path d="M18 14h-8" />
          <path d="M18 18h-8" />
          <path d="M10 6h8v8h-8z" />
        </svg>
      );
    case "other":
    default:
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={common}
          aria-hidden
        >
          <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.586 8.586a2 2 0 0 0 2.828 0l6.172-6.172a2 2 0 0 0 0-2.828Z" />
          <circle cx="7.5" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

/** Clipboard copy icon — explicit pixel size and shrink-0 so it stays visible in compact buttons. */
function ReferencesCopyIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`pointer-events-none shrink-0 text-[color:var(--foreground)] ${className}`}
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function DownloadIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function SendIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}

function ScheduleIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M8 2v3" />
      <path d="M16 2v3" />
      <path d="M3 7h18" />
      <path d="M5 5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      <path d="M12 11v5" />
      <path d="M9 13h3" />
    </svg>
  );
}

function ChevronDownMiniIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ToggleCheckMiniIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function PublishBarMoreIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

function DigestPublishBarXLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`block shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function DigestPublishBarBlueskyLogo({ className = "" }: { className?: string }) {
  return (
    <svg className={`block shrink-0 ${className}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026" />
    </svg>
  );
}

function StatusPill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-[color:var(--border)]/90 bg-[color:var(--muted)]/55 px-2.5 py-0.5 text-[11px] font-semibold text-[color:var(--muted-foreground)] ${className}`}
    >
      {children}
    </span>
  );
}

/** Publication / found date label for digest rows (matches former StatusPill date text). */
function digestItemSignalDateLabel(item: DigestItemPayload): string {
  return item.published_at
    ? new Date(item.published_at).toLocaleDateString()
    : `Found ${new Date(item.found_at).toLocaleDateString()} (no publish date)`;
}

const digestMetaPillClass =
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[color:var(--border)]/90 bg-[color:var(--muted)]/55 px-3 py-1 text-xs font-semibold tracking-tight text-[color:var(--muted-foreground)]";

function DigestMetaIconCalendar({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`shrink-0 opacity-90 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}

function DigestMetaIconCategory({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`shrink-0 opacity-90 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l6.59-6.59a1 1 0 0 0 0-1.41L12 2z" />
      <path d="M7 7h.01" />
    </svg>
  );
}

function DigestMetaSourceGlyph({ type, className = "" }: { type: SourceType; className?: string }) {
  const cn = `shrink-0 opacity-90 ${className}`;
  switch (type) {
    case "pubmed":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          />
          <polyline strokeLinecap="round" strokeLinejoin="round" points="14 2 14 8 20 8" />
          <line x1="16" x2="8" y1="13" y2="13" />
          <line x1="16" x2="8" y1="17" y2="17" />
        </svg>
      );
    case "web":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20" />
        </svg>
      );
    case "manual":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "lab_website":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinecap="round" strokeLinejoin="round" />
          <polyline strokeLinecap="round" strokeLinejoin="round" points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "reporter":
    default:
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 16l4-4 4 4 5-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

/** Top meta row: signal date, source, category — larger than legacy StatusPill, with leading icons. */
function DigestItemMetaStrip({
  item,
  className = "mb-2",
}: {
  item: DigestItemPayload;
  className?: string;
}) {
  const dateLabel = digestItemSignalDateLabel(item);
  const sourceLabel = sourceTypeDisplayLabel(item.source_type);
  const categoryLabel = categoryDisplayLabel(item.category);
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className={`${digestMetaPillClass} normal-case tracking-normal`} title="Publication or found date">
        <DigestMetaIconCalendar className="h-3.5 w-3.5" />
        {dateLabel}
      </span>
      <span className={`${digestMetaPillClass} normal-case`} title="Source">
        <DigestMetaSourceGlyph type={item.source_type} className="h-3.5 w-3.5" />
        {sourceLabel}
      </span>
      <span className={`${digestMetaPillClass} capitalize`} title="Category">
        <DigestMetaIconCategory className="h-3.5 w-3.5" />
        {categoryLabel}
      </span>
    </div>
  );
}

/** One row in the digest drafting workspace: title, optional status, expand/collapse. */
type BulkRefResult = {
  source_item_id: string;
  title: string;
  reference?: string;
  error?: string;
  paper_author_list_full?: string | null;
  paper_author_list_truncated?: string | null;
};

function extractJournalFromRawSummary(rawSummary: string | null): string | null {
  if (!rawSummary) return null;
  const part = rawSummary
    .split(" · ")
    .map((x) => x.trim())
    .find((x) => x.toLowerCase().startsWith("journal:"));
  if (!part) return null;
  const v = part.slice("journal:".length).trim();
  return v || null;
}

/** Swap paper author prefix for preview/copy; matches `reference-author-sort-key` title boundary. */
function applyPaperAuthorTruncateDisplay(
  reference: string,
  truncateAuthors: boolean,
  full?: string | null,
  trunc?: string | null,
): string {
  const f = full?.trim();
  const t = trunc?.trim();
  if (!f || !t || f === t) return reference;
  const text = reference.replace(/[\r\n\t]+/g, " ").trim();
  const m = /^(.+?)(\.\s+(?:["\u201c]))/.exec(text);
  if (!m) return reference;
  const chosen = truncateAuthors ? t : f;
  return `${chosen}${m[2]}${text.slice(m[0].length)}`;
}

function displayReferenceLine(r: BulkRefResult, truncatePaperAuthors: boolean): string | undefined {
  if (!r.reference) return undefined;
  return applyPaperAuthorTruncateDisplay(
    r.reference,
    truncatePaperAuthors,
    r.paper_author_list_full,
    r.paper_author_list_truncated,
  );
}

function formatBulkReferenceList(
  results: BulkRefResult[],
  opts: { numberedLines: boolean; monthLabel: string; truncatePaperAuthors: boolean },
): string {
  const header = `References — ${opts.monthLabel}`;
  const lines = formatReferenceLines(results, opts.numberedLines, opts.truncatePaperAuthors);
  return [header, "", ...lines].join("\n");
}

function formatReferenceLines(
  results: BulkRefResult[],
  numberedLines: boolean,
  truncatePaperAuthors: boolean,
): string[] {
  if (numberedLines) {
    return results.map((r, idx) => {
      const line = displayReferenceLine(r, truncatePaperAuthors);
      return line ? `${idx + 1}. ${line}` : `${idx + 1}. ${r.title} — [${r.error ?? "Failed"}]`;
    });
  }
  const ok = results.filter((r) => r.reference);
  const bad = results.filter((r) => r.error);
  const lines: string[] = [...ok.map((r) => displayReferenceLine(r, truncatePaperAuthors)!)];
  if (bad.length > 0) {
    lines.push("", "--- Could not generate ---");
    for (const r of bad) {
      lines.push(`${r.title}: ${r.error ?? "Failed"}`);
    }
  }
  return lines;
}

/** Relative time for the digest brief “Last saved” line in the expanded card footer. */
function formatDigestBriefLastSavedLabel(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 45) return "just now";
  if (sec < 120) return "1 min ago";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

type RefCategoryKey = "papers" | "funding";

/** Full headline + body for the collapsed-card output preview (not single-line clamped). */
function digestCardOutputPreview(summary: Summary | null): { headline: string; body: string } {
  if (!summary) return { headline: "No summary generated yet", body: "" };
  const raw = (summary.edited_text ?? summary.generated_text ?? "").trim();
  if (!raw) return { headline: "No summary generated yet", body: "" };
  const parsed = parseBlurbJson(raw);
  if (!parsed) return { headline: "Untitled summary", body: raw };
  const merged = mergeWhyIntoBlurb(parsed);
  const headline = merged.headline?.trim() || "Untitled summary";
  const body = merged.blurb?.trim() || raw;
  return { headline, body };
}

/** Collapsed digest card — empty summary column (matches visuals placeholder layout). */
function DigestOutputPreviewEmptySummary({ noChrome }: { noChrome?: boolean }) {
  const inner = (
    <>
      <svg
        className="mb-3 h-11 w-11 shrink-0 text-[#7c6f64]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" x2="8" y1="13" y2="13" />
        <line x1="16" x2="8" y1="17" y2="17" />
        <line x1="10" x2="8" y1="9" y2="9" />
      </svg>
      <p className="text-[15px] font-semibold text-[#3c3836]">No summary generated yet</p>
      <p className="mt-1.5 max-w-[15rem] text-sm leading-relaxed text-[#7c6f64]">
        Expand the card to draft copy.
      </p>
    </>
  );
  if (noChrome) {
    return (
      <div className="flex min-h-[10rem] flex-1 flex-col items-center justify-center bg-[color:var(--card)] px-4 py-8 text-center">
        {inner}
      </div>
    );
  }
  return (
    <div className="flex min-h-[10rem] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-[#e5e1de] bg-[#f3f0eb] px-4 py-8 text-center">
      {inner}
    </div>
  );
}

function DigestOutputPreviewEmptyVisuals({
  variant,
  noChrome,
}: {
  variant: "none" | "pending_load";
  noChrome?: boolean;
}) {
  const inner = (
    <>
      <svg
        className="mb-3 h-11 w-11 shrink-0 text-[#7c6f64]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
      <p className="text-[15px] font-semibold text-[#3c3836]">
        {variant === "pending_load" ? "Visual selected" : "No visuals selected yet"}
      </p>
      <p className="mt-1.5 max-w-[15rem] text-sm leading-relaxed text-[#7c6f64]">
        {variant === "pending_load"
          ? "Expand the card to load the selected visual."
          : "Generate or add visuals after expanding."}
      </p>
    </>
  );
  if (noChrome) {
    return (
      <div className="flex min-h-[10rem] flex-1 flex-col items-center justify-center bg-[color:var(--card)] px-4 py-8 text-center">
        {inner}
      </div>
    );
  }
  return (
    <div className="flex min-h-[10rem] flex-col items-center justify-center rounded-xl border border-dashed border-[#e5e1de] bg-[#f3f0eb] px-4 py-8 text-center">
      {inner}
    </div>
  );
}

function DigestOutputLinkPreviewCard({
  meta,
  status,
  sourceUrl,
}: {
  meta: LinkPreviewMeta | null;
  status: "idle" | "loading" | "ready" | "error";
  sourceUrl: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imgFailed = Boolean(failedUrl) && Boolean(meta?.imageUrl) && failedUrl === meta?.imageUrl;

  const domain = useMemo(() => {
    try {
      return new URL(sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return meta?.siteLabel?.trim() || "Link";
    }
  }, [sourceUrl, meta?.siteLabel]);

  const proxied =
    meta?.imageUrl && !imgFailed
      ? `/api/digest-visuals/proxy?url=${encodeURIComponent(meta.imageUrl)}`
      : null;

  if (status === "loading" || status === "idle") {
    return (
      <div
        className="min-h-[11rem] w-full rounded-xl border border-[color:var(--border)]/70 bg-[#faf6ef]/90 px-4 py-5"
        aria-busy={status === "loading"}
        aria-label="Loading article link preview"
      >
        <div className="h-3 w-2/5 animate-pulse rounded bg-[color:var(--muted)]/45" />
        <div className="mt-3 h-28 w-full animate-pulse rounded-lg bg-[color:var(--muted)]/35" />
        <div className="mt-3 space-y-2">
          <div className="h-3 w-[92%] animate-pulse rounded bg-[color:var(--muted)]/40" />
          <div className="h-3 w-[70%] animate-pulse rounded bg-[color:var(--muted)]/35" />
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-xl border border-[color:var(--border)]/70 bg-[#faf6ef]/90 px-4 py-5 text-center">
        <p className="text-xs font-semibold text-[color:var(--foreground)]">Link preview</p>
        <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
          Couldn&apos;t load page metadata from this URL. Platforms may still show a card after you publish.
        </p>
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-xs font-medium text-[color:var(--accent)] underline-offset-2 hover:underline"
        >
          Open source article
        </a>
      </div>
    );
  }

  return (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-xl border border-[color:var(--border)]/70 bg-[color:var(--card)] shadow-sm ring-1 ring-[color:var(--border)]/20"
      aria-label={`Open link preview: ${meta?.title ?? domain}`}
    >
      <div className="relative aspect-[16/9] w-full bg-[color:var(--muted)]/20">
        {proxied ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proxied}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center"
              onError={() => setFailedUrl(meta?.imageUrl ?? null)}
            />
            {/* Gradient scrim like X cards */}
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 via-black/25 to-transparent" aria-hidden />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[color:var(--muted)]/25 via-[color:var(--border)]/35 to-[color:var(--muted)]/15" />
        )}

        {/* Domain badge (bottom-right) */}
        <div className="absolute bottom-2 right-2 rounded-md bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/90 backdrop-blur-sm">
          {domain}
        </div>

        {/* Title overlay (bottom-left) */}
        <div className="absolute bottom-2 left-2 right-14">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.55)]">
            {meta?.title ?? "Untitled"}
          </p>
        </div>
      </div>

      {/* Secondary line (optional) */}
      {meta?.description?.trim() ? (
        <div className="border-t border-[color:var(--border)]/45 px-3 py-2.5">
          <p className="line-clamp-2 text-[11px] leading-snug text-[color:var(--muted-foreground)]">
            {meta.description}
          </p>
        </div>
      ) : null}
    </a>
  );
}

function digestItemHasVisual(item: DigestItemPayload): boolean {
  if (!item.digestCoverHasAsset) return false;
  // List queries often omit bundle JSON via `digest_cover_has_asset`; treat as visuals present until hydrated.
  if (item.digest_cover == null) return true;
  return digestCoverStoreHasHeroSelection(parseDigestCoverStoreFromDb(item.digest_cover));
}

type DigestRefCategory = {
  key: RefCategoryKey;
  title: string;
  description: string;
  items: DigestItemPayload[];
};

function DigestSignalRow({
  item,
  selected,
  disabled,
  onToggle,
  workspaceAccounts,
}: {
  item: DigestItemPayload;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  workspaceAccounts?: WorkspaceAccountAvatars | null;
}) {
  const paperJournal = item.category === "paper" ? extractJournalFromRawSummary(item.raw_summary) : null;
  const dateLabel = new Date(item.published_at ?? item.found_at).toLocaleDateString();
  const investigatorLabel =
    item.investigators.length > 0
      ? `${item.investigators[0]!.name}${item.investigators.length > 1 ? ` +${item.investigators.length - 1}` : ""}`
      : item.pi_name ?? "Unassigned";

  return (
    <li>
      <label
        className={`group flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-all ${
          selected
            ? "border-[color:var(--accent)]/65 bg-[color:var(--accent)]/14 shadow-[0_10px_28px_-20px_rgba(127,86,76,0.95)]"
            : "border-[color:var(--border)]/40 bg-[color:var(--background)]/92 hover:border-[color:var(--border)]/80 hover:bg-[color:var(--muted)]/18"
        }`}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          disabled={disabled}
          className="mt-1 shrink-0 rounded border-[color:var(--border)]"
        />
        <div className="mt-0.5 shrink-0 self-start">
          <WorkspaceHandleAvatarImg
            postToX
            postToBluesky
            accounts={workspaceAccounts}
            size="sm"
            hideWhenEmpty
          />
        </div>
        <span className="min-w-0 flex-1">
          <Link
            href={`/items/${item.id}`}
            className="line-clamp-2 text-[15px] font-semibold leading-snug text-[color:var(--foreground)] underline-offset-2 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {item.title}
          </Link>
          <span className="mt-1 block text-[11px] text-[color:var(--muted-foreground)]/95">
            {dateLabel}
            {paperJournal ? ` · ${paperJournal}` : ""}
            {investigatorLabel ? ` · ${investigatorLabel}` : ""}
          </span>
          <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11px]">
            <SourceTypeTag type={item.source_type} />
            <CategoryTag category={item.category} />
          </span>
          {item.investigators.length > 0 ? (
            <LinkedInvestigatorsFacepile variant="inline" investigators={item.investigators} maxVisible={3} />
          ) : null}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            selected
              ? "border border-[color:var(--accent)]/55 bg-[color:var(--accent)]/20 text-[color:var(--foreground)]"
              : "border border-[color:var(--border)]/60 bg-[color:var(--muted)]/40 text-[color:var(--muted-foreground)]"
          }`}
        >
          {selected ? "Included" : "Excluded"}
        </span>
      </label>
    </li>
  );
}

function DigestCategoryCard({
  category,
  expanded,
  generatedCount,
  selectedCount,
  running,
  selectedIds,
  onExpand,
  onToggleItem,
  onSelectAll,
  onSelectNone,
  onGenerateCategory,
  workspaceAccounts,
}: {
  category: DigestRefCategory;
  expanded: boolean;
  generatedCount: number;
  selectedCount: number;
  running: boolean;
  selectedIds: Set<string>;
  onExpand: () => void;
  onToggleItem: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onGenerateCategory: () => void;
  workspaceAccounts?: WorkspaceAccountAvatars | null;
}) {
  const allSelected = category.items.length > 0 && selectedCount === category.items.length;
  return (
    <Card className={`overflow-hidden rounded-2xl border shadow-sm transition-all ${
      expanded
        ? "border-[color:var(--accent)]/55 bg-[color:var(--background)]/92 shadow-[0_14px_34px_-24px_rgba(51,31,22,0.65)]"
        : "border-[color:var(--border)]/70 bg-[color:var(--background)]/80"
    }`}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onExpand();
        }}
        className={`flex w-full items-start justify-between gap-3 border-b px-4 py-3.5 text-left transition-colors ${
          expanded
            ? "border-[color:var(--accent)]/35 bg-[color:var(--accent)]/8"
            : "border-[color:var(--border)]/50 bg-[color:var(--muted)]/24 hover:bg-[color:var(--muted)]/34"
        }`}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-[color:var(--foreground)]">{category.title}</p>
          <p className="mt-0.5 text-[11px] text-[color:var(--muted-foreground)]">{category.description}</p>
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-1.5 text-[11px]">
          <StatusPill>{category.items.length} total</StatusPill>
          <StatusPill className="border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-[color:var(--foreground)]">
            {selectedCount} selected
          </StatusPill>
          <StatusPill className={generatedCount > 0 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : ""}>
            {generatedCount > 0 ? `${generatedCount} generated` : "Not generated"}
          </StatusPill>
          <CollapseChevron open={expanded} />
        </div>
      </button>
      {expanded ? (
        <div className="space-y-3.5 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--border)]/65 bg-[color:var(--muted)]/26 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs text-[color:var(--muted-foreground)]">
              <button
                type="button"
                onClick={onSelectAll}
                disabled={running || allSelected}
                className="rounded-md px-2 py-1 font-medium hover:bg-[color:var(--muted)]/50 disabled:opacity-40"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={onSelectNone}
                disabled={running || selectedCount === 0}
                className="rounded-md px-2 py-1 font-medium hover:bg-[color:var(--muted)]/50 disabled:opacity-40"
              >
                Select none
              </button>
              <span>{selectedCount} included</span>
            </div>
            <Button
              type="button"
              onClick={onGenerateCategory}
              disabled={running || selectedCount === 0}
              className="h-8 px-3 text-xs"
            >
              {running ? "Generating..." : "Generate References"}
            </Button>
          </div>
          {category.items.length > 0 ? (
            <ul className="max-h-[32rem] space-y-2.5 overflow-y-auto pr-1">
              {category.items.map((item) => (
                <DigestSignalRow
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  disabled={running}
                  onToggle={() => onToggleItem(item.id)}
                  workspaceAccounts={workspaceAccounts}
                />
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-[color:var(--border)]/70 px-3 py-6 text-center text-sm text-[color:var(--muted-foreground)]">
              No signals in this category for this month.
            </p>
          )}
        </div>
      ) : null}
    </Card>
  );
}

export type DigestItemPayload = {
  id: string;
  title: string;
  published_at: string | null;
  found_at: string;
  category: ItemCategory | null;
  source_type: SourceType;
  source_url: string | null;
  raw_summary: string | null;
  /** Primary + junction-linked watchlist investigators, sorted by name */
  investigators: {
    id: string;
    name: string;
    first_name: string;
    last_name: string;
    headshot_url: string | null;
    headshot_storage_path: string | null;
  }[];
  /** Primary `source_items.tracked_entity_id` (e.g. funding: contact / lead PI). */
  primary_tracked_entity_id: string | null;
  /** For papers, PubMed co–last / co–corresponding (second author from the end) when available. */
  penultimate_author_name: string | null;
  /** PubMed paper: full author list from eSummary (digest page); link roster overlap in UI. */
  paper_author_names: string[] | null;
  pi_name: string | null;
  /** Raw `digest_cover` jsonb when hydrated (list rows omit); may be v2 bundle or v3 multi-channel store. */
  digest_cover: Json | null;
  /** True when `digest_cover` JSON exists in DB (list page omits the JSON to avoid timeouts / huge RSC payloads). */
  digestCoverHasAsset: boolean;
  /** When true, hero is article link preview (matches digest_cover.linkPreviewOnly; no blob on list queries). */
  digest_link_preview_only: boolean;
  /** Set when editor marked this signal complete for the digest Completed Library. */
  digestMarkedCompleteAt: string | null;
  summaries: Summary[];
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether a PubMed-style author string corresponds to this Member / Watchlist investigator (profile link target). */
function pubmedAuthorLineMatchesInvestigator(
  authorLine: string,
  inv: { name: string; first_name: string; last_name: string },
): boolean {
  const line = authorLine.trim().toLowerCase();
  const last = inv.last_name.trim().toLowerCase();
  const first = inv.first_name.trim().toLowerCase();
  const roster = inv.name.trim().toLowerCase();
  if (!last || line.length < 2) return false;
  if (!line.includes(last)) return false;
  if (roster && line === roster) return true;
  if (first && line.includes(first)) return true;
  if (roster) {
    const r = roster.replace(/\s+/g, " ");
    if (line.includes(r)) return true;
  }
  const fi = first.charAt(0);
  if (
    fi &&
    new RegExp(
      `(^|[\\s,])${escapeRegExp(fi)}\\.?[a-z]?\\.?\\s*${escapeRegExp(last)}`,
      "i",
    ).test(authorLine.trim())
  ) {
    return true;
  }
  // "Krummel MF" / surname-first tail formats: surname plus short token(s), initials overlap roster first name.
  const stripped = line.replaceAll(last, "").replace(/\./g, "").trim();
  if (stripped.length > 0 && stripped.length <= 10 && fi && /[\s,]/.test(authorLine)) {
    const tailTok = stripped.split(/[\s,]+/).filter(Boolean);
    if (
      tailTok.some((t) => t.length <= 4 && t.startsWith(fi)) ||
      tailTok.some((t) => t.length === 1 && t === fi)
    ) {
      return true;
    }
  }
  return false;
}

function digestSummaryShareText(summary: Summary): string {
  const raw = summary.edited_text ?? summary.generated_text;
  const merged = mergeWhyIntoBlurb(
    parseBlurbJson(raw) ?? {
      headline: "",
      blurb: raw,
      why_it_matters: "",
      confidence_notes: "",
    },
  );
  return `${merged.headline}\n\n${merged.blurb?.trim() ?? ""}`.trim();
}

function DigestCompletedSignalCard({
  item,
  model,
  workspaceAccounts,
}: {
  item: DigestItemPayload;
  model: string;
  workspaceAccounts?: WorkspaceAccountAvatars | null;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const destLabels = useMemo(() => {
    const styles = new Set(
      item.summaries
        .filter((s) => DIGEST_CONTENT_STUDIO_STYLES.includes(s.style) && digestSummaryHasGeneratedText(s))
        .map((s) => s.style),
    );
    return DIGEST_CONTENT_STUDIO_OUTPUT_OPTIONS.filter((o) => styles.has(o.style)).map((o) => o.label);
  }, [item.summaries]);
  const completedAt = item.digestMarkedCompleteAt
    ? new Date(item.digestMarkedCompleteAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  async function reactivate() {
    setReactivating(true);
    try {
      const res = await fetch("/api/digest-workflow-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_item_id: item.id, complete: false }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not reactivate");
      toast.success("Returned to Active Drafts");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reactivate");
    } finally {
      setReactivating(false);
    }
  }

  if (expanded) {
    return (
      <li className="list-none">
        <DigestItemRow
          item={item}
          model={model}
          expanded={false}
          onToggleExpanded={() => {}}
          libraryPreviewMode={{
            onCollapse: () => setExpanded(false),
            onReactivate: () => void reactivate(),
            reactivating,
          }}
          workspaceAccounts={workspaceAccounts}
        />
      </li>
    );
  }

  return (
    <li className="list-none">
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="group w-full rounded-xl border border-[color:var(--border)]/50 bg-[color:var(--muted)]/10 px-3.5 py-3 text-left shadow-[0_6px_20px_-14px_rgba(45,35,28,0.45)] transition hover:border-[color:var(--border)]/80 hover:bg-[color:var(--muted)]/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="line-clamp-2 text-sm font-semibold leading-snug text-[color:var(--foreground)]">
              {item.title}
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <DigestItemMetaStrip item={item} className="mb-0" />
              <span className="rounded-md border border-[color:var(--border)]/55 bg-[color:var(--card)]/75 px-2.5 py-1 text-[11px] font-medium text-[color:var(--muted-foreground)]">
                Done {completedAt}
              </span>
              {item.investigators.length > 0 ? (
                <LinkedInvestigatorsFacepile
                  variant="inline"
                  investigators={item.investigators}
                  maxVisible={4}
                  className="min-w-0"
                />
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1">
              {destLabels.length ? (
                destLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-md bg-[color:var(--accent)]/12 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--foreground)]"
                  >
                    {label}
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-[color:var(--muted-foreground)]">No channel outputs yet</span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <WorkspaceHandleAvatarImg
              postToX
              postToBluesky
              accounts={workspaceAccounts}
              size="sm"
              hideWhenEmpty
            />
            <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-[color:var(--muted-foreground)] opacity-70 transition group-hover:opacity-100">
              Open
            </span>
          </div>
        </div>
      </button>
    </li>
  );
}

function DigestItemRow({
  item,
  model,
  expanded,
  onToggleExpanded,
  libraryPreviewMode,
  bulkSelect,
  workspaceAccounts,
}: {
  item: DigestItemPayload;
  model: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  libraryPreviewMode?: {
    onCollapse: () => void;
    onReactivate: () => void;
    reactivating: boolean;
  };
  /** When set, show a row checkbox for bulk “mark complete” in Active Drafts. */
  bulkSelect?: { selected: boolean; onToggle: () => void };
  workspaceAccounts?: WorkspaceAccountAvatars | null;
}) {
  const router = useRouter();
  const [summaries, setSummaries] = useState<Summary[]>(item.summaries);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(() =>
    pickDefaultDigestOutputId(
      item.summaries.filter((s) => DIGEST_CONTENT_STUDIO_STYLES.includes(s.style)),
    ),
  );
  /** Output channel chosen in Content studio that has no summary row yet (draft it next). */
  const [pendingChannelStyle, setPendingChannelStyle] = useState<SummaryStyle | null>(null);
  const [firstDraftStyle, setFirstDraftStyle] = useState<SummaryStyle>("newsletter");
  const [generating, setGenerating] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [illustrating, setIllustrating] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  /** Button strip (Open / Collapse / More) — excluded from “click outside” menu dismissal. */
  const actionsToolbarRef = useRef<HTMLDivElement | null>(null);
  const actionsMenuDropdownRef = useRef<HTMLDivElement | null>(null);
  /** Full `digest_cover` loaded on demand (month list omits JSON from the server). */
  const [fetchedDigestCoverStore, setFetchedDigestCoverStore] = useState<DigestCoverStore | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);
  const [postToX, setPostToX] = useState(true);
  const [postToBluesky, setPostToBluesky] = useState(true);
  const [digestStripPosting, setDigestStripPosting] = useState(false);
  const [digestStripSaving, setDigestStripSaving] = useState(false);
  const [publishStripMoreMenuOpen, setPublishStripMoreMenuOpen] = useState(false);
  const publishStripMoreDropdownRef = useRef<HTMLDivElement | null>(null);
  const [resetDigestBusy, setResetDigestBusy] = useState(false);
  /** Checklist “Save all changes” calls the active `SummaryEditor` save (single source of truth for form state). */
  const digestBriefSaveOutletRef = useRef<(() => Promise<void>) | null>(null);
  /** Content studio draft vs persisted `summaries` row (drives footer status + enablement). */
  const [digestBriefDirty, setDigestBriefDirty] = useState(false);
  /** After auto-collapse on save, scroll this card back into view so the list position isn’t disorienting. */
  const digestCardScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setSummaries(item.summaries);
  }, [item.id, item.summaries]);

  useEffect(() => {
    if (pendingChannelStyle) return;
    setSelectedOutputId((prev) => {
      if (prev && summaries.some((s) => s.id === prev)) return prev;
      return pickDefaultDigestOutputId(
        summaries.filter((s) => DIGEST_CONTENT_STUDIO_STYLES.includes(s.style)),
      );
    });
  }, [summaries, pendingChannelStyle]);

  const digestContentStudioSummaries = useMemo(
    () => summaries.filter((s) => DIGEST_CONTENT_STUDIO_STYLES.includes(s.style)),
    [summaries],
  );

  const showDigestPublishStrip = useMemo(
    () => digestContentStudioSummaries.some((s) => digestSummaryHasGeneratedText(s)),
    [digestContentStudioSummaries],
  );

  const studioOutputTabs = useMemo((): DigestStudioOutputTab[] => {
    return DIGEST_CONTENT_STUDIO_OUTPUT_OPTIONS.map((opt) => {
      const row = digestContentStudioSummaries.find((s) => s.style === opt.style);
      return {
        style: opt.style,
        label: opt.label,
        selectable: row ? digestSummaryHasGeneratedText(row) : false,
        leading: <DigestStudioTabLeadingIcon style={opt.style} />,
      };
    });
  }, [digestContentStudioSummaries]);

  /** Collapsed Output preview — same tab chrome as expanded Channel row (`DigestStudioOutputTabs` default). */
  const outputPreviewTabs = useMemo((): DigestStudioOutputTab[] => {
    return DIGEST_CONTENT_STUDIO_OUTPUT_OPTIONS.map((opt) => {
      const row = digestContentStudioSummaries.find((s) => s.style === opt.style);
      return {
        style: opt.style,
        label: opt.label,
        selectable: row ? digestSummaryHasGeneratedText(row) : false,
        leading: <DigestStudioTabLeadingIcon style={opt.style} />,
      };
    });
  }, [digestContentStudioSummaries]);

  const [outputPreviewStyle, setOutputPreviewStyle] = useState<SummaryStyle>(() => {
    const studio = sortSummariesForDigestOutputs(
      item.summaries.filter((s) => DIGEST_CONTENT_STUDIO_STYLES.includes(s.style)),
    );
    const first = studio.find((s) => digestSummaryHasGeneratedText(s)) ?? studio[0];
    return first?.style ?? "bluesky_x";
  });

  /** Natural pixel size of the Output preview hero image — positions schematic label overlays. */
  const [outputPreviewHeroNaturalDims, setOutputPreviewHeroNaturalDims] = useState<{ w: number; h: number } | null>(
    null,
  );

  const activeSummary = useMemo(() => {
    if (!selectedOutputId) return null;
    return summaries.find((s) => s.id === selectedOutputId) ?? null;
  }, [summaries, selectedOutputId]);

  const contentStudioEditorSummary = useMemo((): Summary => {
    const byId = selectedOutputId ? summaries.find((s) => s.id === selectedOutputId) : undefined;
    if (byId) return byId;

    if (pendingChannelStyle) {
      return makeDigestStudioPlaceholderSummary(item.id, pendingChannelStyle);
    }

    if (digestContentStudioSummaries.length === 0) {
      return makeDigestStudioPlaceholderSummary(item.id, firstDraftStyle);
    }

    const defaultId = pickDefaultDigestOutputId(digestContentStudioSummaries);
    const fallback =
      (defaultId ? digestContentStudioSummaries.find((s) => s.id === defaultId) : null) ??
      digestContentStudioSummaries[0];
    return fallback!;
  }, [
    selectedOutputId,
    summaries,
    pendingChannelStyle,
    digestContentStudioSummaries,
    firstDraftStyle,
    item.id,
  ]);

  useEffect(() => {
    if (!pendingChannelStyle) return;
    const row = summaries.find((s) => s.style === pendingChannelStyle);
    if (row) {
      setSelectedOutputId(row.id);
      setPendingChannelStyle(null);
    }
  }, [summaries, pendingChannelStyle]);

  const handleSelectChannelStyle = useCallback(
    (style: SummaryStyle) => {
      const row = summaries.find((s) => s.style === style);
      if (row) {
        setSelectedOutputId(row.id);
        setPendingChannelStyle(null);
      } else if (digestContentStudioSummaries.length === 0) {
        setSelectedOutputId(null);
        setPendingChannelStyle(null);
        setFirstDraftStyle(style);
      } else {
        setSelectedOutputId(null);
        setPendingChannelStyle(style);
      }
    },
    [summaries, digestContentStudioSummaries.length],
  );

  const handleSelectDigestOutputTab = useCallback(
    (style: SummaryStyle) => {
      const row = digestContentStudioSummaries.find((s) => s.style === style);
      if (!row || !digestSummaryHasGeneratedText(row)) return;
      setSelectedOutputId(row.id);
      setPendingChannelStyle(null);
    },
    [digestContentStudioSummaries],
  );

  useEffect(() => {
    const st = activeSummary?.style;
    if (st && DIGEST_CONTENT_STUDIO_STYLES.includes(st)) {
      setOutputPreviewStyle(st);
    }
  }, [selectedOutputId, activeSummary?.style]);

  const previewSummary = useMemo(() => {
    return digestContentStudioSummaries.find((s) => s.style === outputPreviewStyle) ?? null;
  }, [digestContentStudioSummaries, outputPreviewStyle]);

  /** Post / schedule / platform toggles only apply when Output preview is Social — not copy/download in “…”. */
  const socialPublishInteractive = outputPreviewStyle === "bluesky_x";
  const publishStripDisabledTitle = "Switch Output preview to Social to publish";
  const publishStripBusy =
    digestStripPosting || generating || archiving || illustrating;
  const socialPublishControlsDisabled = publishStripBusy || !socialPublishInteractive;
  /** More menu (copy text, download visual) is available for every output tab once the strip is shown. */
  const publishMoreMenuDisabled = publishStripBusy;

  const refreshSummaries = useCallback(async (): Promise<Summary[] | null> => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("summaries")
      .select("*")
      .eq("source_item_id", item.id)
      .order("updated_at", { ascending: false });
    if (!error && data) {
      const rows = data as Summary[];
      setSummaries(rows);
      return rows;
    }
    return null;
  }, [item.id]);

  /** Month list omits `digest_cover` JSON — load from Supabase for Output preview + Media column. */
  const refetchDigestCover = useCallback(async () => {
    setCoverLoading(true);
    try {
      const supabase = createClient();
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const { data, error } = await supabase
          .from("source_items")
          .select("digest_cover")
          .eq("id", item.id)
          .maybeSingle();
        if (!error && data?.digest_cover != null) {
          setFetchedDigestCoverStore(parseDigestCoverStoreFromDb(data.digest_cover));
          return;
        }
        if (!error && (data == null || data.digest_cover == null)) {
          setFetchedDigestCoverStore(null);
          return;
        }
        const msg = error?.message ?? "";
        if (attempt < maxAttempts && isDigestVisualTransientFailure(msg, 0)) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        setFetchedDigestCoverStore(null);
        return;
      }
    } finally {
      setCoverLoading(false);
    }
  }, [item.id]);

  /** Rapid hero/media clicks fire many completions — debounce full route refresh to reduce DB load. */
  const digestVisualRouterRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleDigestVisualRouterRefresh = useCallback(() => {
    if (digestVisualRouterRefreshTimerRef.current) {
      clearTimeout(digestVisualRouterRefreshTimerRef.current);
    }
    digestVisualRouterRefreshTimerRef.current = setTimeout(() => {
      digestVisualRouterRefreshTimerRef.current = null;
      router.refresh();
    }, 750);
  }, [router]);

  useEffect(() => {
    return () => {
      if (digestVisualRouterRefreshTimerRef.current) {
        clearTimeout(digestVisualRouterRefreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setPostToX(true);
    setPostToBluesky(true);
  }, [activeSummary?.id, contentStudioEditorSummary.style]);

  const digestStripPost = useCallback(async () => {
    const s = activeSummary;
    if (!s || !isDigestSocialOutputStyle(s.style)) return;
    if (outputPreviewStyle !== "bluesky_x") return;
    const text = digestSummaryShareText(s);
    if (!text.trim()) {
      toast.error("Nothing to post yet");
      return;
    }
    if (!postToX && !postToBluesky) {
      toast.error("Select X and/or Bluesky");
      return;
    }
    setDigestStripPosting(true);
    const results: string[] = [];
    const errors: string[] = [];
    try {
      const publishPayload: Record<string, unknown> = {
        text,
        source_item_id: s.source_item_id,
        attachment: "digest_visual",
      };
      if (postToX) {
        const res = await fetch("/api/x/post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(publishPayload),
        });
        const data = (await res.json()) as {
          error?: string;
          url?: string;
          posted_without_media?: boolean;
        };
        if (!res.ok) errors.push(`X: ${data.error ?? res.statusText}`);
        else if (data.url) {
          results.push(
            data.posted_without_media
              ? `X: ${data.url} (text only — X rejected the image attachment)`
              : `X: ${data.url}`,
          );
        } else results.push("X: posted");
      }
      if (postToBluesky) {
        const res = await fetch("/api/bsky/post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(publishPayload),
        });
        const data = (await res.json()) as { error?: string; url?: string; truncated?: boolean };
        if (!res.ok) errors.push(`Bluesky: ${data.error ?? res.statusText}`);
        else if (data.url) {
          results.push(
            data.truncated
              ? `Bluesky: ${data.url} (shortened to ${BLUESKY_CHAR_LIMIT} characters)`
              : `Bluesky: ${data.url}`,
          );
        } else results.push("Bluesky: posted");
      }
      if (results.length) toast.success(results.join(" · "));
      if (errors.length) toast.error(errors.join(" · "));
    } catch {
      toast.error("Publish request failed");
    } finally {
      setDigestStripPosting(false);
    }
  }, [activeSummary, outputPreviewStyle, postToX, postToBluesky]);

  const collapseExpandedCardIfNeeded = useCallback(() => {
    if (!expanded) return;
    onToggleExpanded();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        digestCardScrollRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
      });
    });
  }, [expanded, onToggleExpanded]);

  const resetDigestOutput = useCallback(async () => {
    const row = contentStudioEditorSummary;
    if (isDigestStudioPlaceholderSummary(row)) {
      toast.message("Nothing to reset.");
      return;
    }
    const label =
      DIGEST_CONTENT_STUDIO_OUTPUT_OPTIONS.find((o) => o.style === row.style)?.label ?? row.style;
    if (!confirm(`Remove the ${label} output for this signal? This cannot be undone.`)) {
      return;
    }
    setResetDigestBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("summaries").delete().eq("id", row.id);
      if (error) throw new Error(error.message);
      toast.success("Output removed");
      await refreshSummaries();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove output");
    } finally {
      setResetDigestBusy(false);
    }
  }, [contentStudioEditorSummary, refreshSummaries, router]);

  const digestStripCopy = useCallback(async () => {
    const s = previewSummary;
    if (!s) {
      toast.error("Nothing to copy yet.");
      return;
    }
    const text = digestSummaryShareText(s);
    if (!text.trim()) {
      toast.error("Nothing to copy yet.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  }, [previewSummary]);

  async function generateSummary(opts?: {
    style?: SummaryStyle;
    targetBlurbChars?: number;
    refinement?: string;
    tone?: DigestSummaryTone;
  }) {
    setGenerating(true);
    const hadExisting = summaries.length > 0;
    const targetStyle = opts?.style ?? contentStudioEditorSummary.style;
    const range = blurbCharRangeForStyle(targetStyle);
    const targetBlurbChars = opts?.targetBlurbChars ?? range.default;
    const refinement = opts?.refinement?.trim() ?? "";
    const tone =
      opts?.tone ??
      (contentStudioEditorSummary.digest_tone &&
      DIGEST_SUMMARY_TONE_OPTIONS.some((o) => o.id === contentStudioEditorSummary.digest_tone)
        ? (contentStudioEditorSummary.digest_tone as DigestSummaryTone)
        : DEFAULT_DIGEST_SUMMARY_TONE);
    try {
      const res = await fetch("/api/generate-blurb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_item_id: item.id,
          style: targetStyle,
          tone,
          model: model || undefined,
          target_blurb_chars: targetBlurbChars,
          refinement_instruction: refinement || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; record?: Summary };
      if (!res.ok) {
        throw new Error(data.error ?? "Request failed");
      }
      toast.success(hadExisting ? "Summary generated" : "Summary drafted");
      const list = await refreshSummaries();
      const row = list?.find((s) => s.style === targetStyle);
      if (row) setSelectedOutputId(row.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function archiveSignal() {
    if (!confirm("Archive this signal? You can still view it later in Signals with status = Archived.")) {
      return;
    }
    setArchiving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("source_items")
        .update({ status: "archived", archive_reason: "other" })
        .eq("id", item.id);
      if (error) throw error;
      toast.success("Signal archived");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not archive item");
    } finally {
      setArchiving(false);
    }
  }

  async function markDigestWorkflowComplete() {
    setMarkingComplete(true);
    try {
      const res = await fetch("/api/digest-workflow-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_item_id: item.id, complete: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not update");
      toast.success("Moved to Completed Library");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark complete");
    } finally {
      setMarkingComplete(false);
    }
  }

  const piListedSeparately =
    Boolean(item.pi_name) &&
    item.investigators.length > 0 &&
    !item.investigators.some(
      (inv) => inv.name.trim().toLowerCase() === (item.pi_name ?? "").trim().toLowerCase(),
    );

  async function copySignalLink() {
    try {
      const link = item.source_url ?? `${window.location.origin}/items/${item.id}`;
      await navigator.clipboard.writeText(link);
      toast.success("Source link copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const t = event.target as Node;
      if (actionsMenuDropdownRef.current?.contains(t)) return;
      if (actionsToolbarRef.current?.contains(t)) return;
      setActionsMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionsMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [actionsMenuOpen]);

  useEffect(() => {
    setFetchedDigestCoverStore(null);
  }, [item.id]);

  useEffect(() => {
    if (!item.digestCoverHasAsset) {
      setFetchedDigestCoverStore(null);
      setCoverLoading(false);
      return;
    }
    void refetchDigestCover();
  }, [item.digestCoverHasAsset, item.id, refetchDigestCover]);

  const digestCoverStore = useMemo((): DigestCoverStore => {
    if (fetchedDigestCoverStore != null) return fetchedDigestCoverStore;
    return parseDigestCoverStoreFromDb(item.digest_cover);
  }, [fetchedDigestCoverStore, item.digest_cover]);

  const visualBundle = useMemo((): DigestVisualBundle | null => {
    return getBundleForChannel(digestCoverStore, outputPreviewStyle as DigestVisualChannelStyle);
  }, [digestCoverStore, outputPreviewStyle]);

  const outputPreviewActiveCandidate = useMemo(() => getActiveCandidate(visualBundle), [visualBundle]);

  const outputPreviewOverlayLayout = useMemo(
    () =>
      digestHeroIllustrationOverlayLayout(
        outputPreviewHeroNaturalDims?.w ?? 0,
        outputPreviewHeroNaturalDims?.h ?? 0,
        outputPreviewActiveCandidate,
        outputPreviewActiveCandidate?.illustrationTextLayers ?? [],
      ),
    [outputPreviewActiveCandidate, outputPreviewHeroNaturalDims],
  );

  const outputCard = useMemo(() => digestCardOutputPreview(previewSummary), [previewSummary]);
  const showOutputPreviewSummaryEmpty = useMemo(() => {
    if (outputCard.body.trim()) return false;
    return (
      !previewSummary ||
      !(String(previewSummary.edited_text ?? previewSummary.generated_text ?? "").trim())
    );
  }, [outputCard, previewSummary]);

  /** Collapsed card: single hero image — the selected digest visual only (not the whole library grid). */
  const selectedPreviewImageUrl = useMemo(() => {
    const b = visualBundle;
    if (!b?.candidates?.length) return null;
    const active = getActiveCandidate(b);
    return activeVisualImageDataUrl(active);
  }, [visualBundle]);

  useEffect(() => {
    setOutputPreviewHeroNaturalDims(null);
  }, [selectedPreviewImageUrl]);

  const linkPreviewHero =
    Boolean(item.digest_link_preview_only) || Boolean(visualBundle?.linkPreviewOnly);

  const [linkPreviewMeta, setLinkPreviewMeta] = useState<LinkPreviewMeta | null>(null);
  const [linkPreviewStatus, setLinkPreviewStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  /** Load OG data when the bundle is link-only (article link card in output preview). */
  const needsArticleLinkPreview = Boolean(
    item.source_url?.trim().startsWith("http") && linkPreviewHero,
  );

  useEffect(() => {
    const url = item.source_url?.trim();
    if (!needsArticleLinkPreview || !url?.startsWith("http")) {
      setLinkPreviewMeta(null);
      setLinkPreviewStatus("idle");
      return;
    }
    let cancelled = false;
    setLinkPreviewStatus("loading");
    setLinkPreviewMeta(null);
    void (async () => {
      try {
        const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
        const data = (await res.json()) as LinkPreviewMeta & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setLinkPreviewStatus("error");
          return;
        }
        setLinkPreviewMeta({
          title: data.title ?? "Link",
          description: data.description ?? "",
          imageUrl: data.imageUrl ?? null,
          siteLabel: data.siteLabel ?? "",
        });
        setLinkPreviewStatus("ready");
      } catch {
        if (!cancelled) setLinkPreviewStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsArticleLinkPreview, item.source_url]);

  /** Social tab + “Article link” attachment shows OG/link-preview card instead of the digest thumbnail. */
  const socialPreviewUsesArticleLink = false;
  const hasHttpSourceUrl = Boolean(item.source_url?.trim().startsWith("http"));
  const showDigestHeroImage =
    !socialPreviewUsesArticleLink && Boolean(selectedPreviewImageUrl);
  const showArticleLinkPreviewCard =
    hasHttpSourceUrl &&
    (socialPreviewUsesArticleLink || (!selectedPreviewImageUrl && linkPreviewHero));

  /** Single dashed frame for both placeholders — avoids double bottom borders side by side. */
  const mergedOutputPreviewEmptyPlaceholders = useMemo(
    () =>
      showOutputPreviewSummaryEmpty &&
      !showDigestHeroImage &&
      !showArticleLinkPreviewCard &&
      !((socialPreviewUsesArticleLink || linkPreviewHero) && !hasHttpSourceUrl),
    [
      showOutputPreviewSummaryEmpty,
      showDigestHeroImage,
      showArticleLinkPreviewCard,
      socialPreviewUsesArticleLink,
      linkPreviewHero,
      hasHttpSourceUrl,
    ],
  );

  const canDownloadDigestHero = Boolean(selectedPreviewImageUrl) && !socialPreviewUsesArticleLink && !linkPreviewHero;

  const digestStripDownloadImage = useCallback(async () => {
    if (!selectedPreviewImageUrl) return;
    try {
      // data: URLs can be downloaded directly.
      if (selectedPreviewImageUrl.startsWith("data:")) {
        const a = document.createElement("a");
        a.href = selectedPreviewImageUrl;
        a.download = "digest-visual.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }

      const res = await fetch(selectedPreviewImageUrl, { mode: "cors" });
      if (!res.ok) throw new Error("Could not download image");
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = "digest-visual";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  }, [selectedPreviewImageUrl]);

  const digestStripSchedule = useCallback(async () => {
    const s = activeSummary;
    if (!s || !isDigestSocialOutputStyle(s.style)) return;
    if (outputPreviewStyle !== "bluesky_x") return;
    const text = digestSummaryShareText(s);
    if (!text.trim()) {
      toast.error("Nothing to schedule yet");
      return;
    }
    if (!postToX && !postToBluesky) {
      toast.error("Select X and/or Bluesky");
      return;
    }

    setDigestStripPosting(true);
    try {
      const res = await fetch("/api/social-signals/review-queue/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_item_id: s.source_item_id,
          text,
          platforms: [
            ...(postToX ? ["x"] : []),
            ...(postToBluesky ? ["bluesky"] : []),
          ],
          attachment: "digest_visual",
          image_url: canDownloadDigestHero ? selectedPreviewImageUrl : null,
          source_url: item.source_url ?? null,
        }),
      });
      const data = (await res.json()) as { error?: string; created?: number };
      if (!res.ok) throw new Error(data.error ?? "Schedule request failed");
      toast.success(`Draft${data.created === 1 ? "" : "s"} added to Social Signals · Scheduler`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Schedule failed");
    } finally {
      setDigestStripPosting(false);
    }
  }, [
    activeSummary,
    outputPreviewStyle,
    postToX,
    postToBluesky,
    canDownloadDigestHero,
    selectedPreviewImageUrl,
    item.source_url,
  ]);

  const digestPublishPlatforms = useMemo(
    () =>
      isDigestSocialOutputStyle(contentStudioEditorSummary.style) &&
      !isDigestStudioPlaceholderSummary(contentStudioEditorSummary)
        ? {
            postToX,
            postToBluesky,
            onPostToXChange: setPostToX,
            onPostToBlueskyChange: setPostToBluesky,
            attachmentMode: "digest_visual" as const,
            onAttachmentModeChange: () => {},
          }
        : undefined,
    [contentStudioEditorSummary, postToX, postToBluesky],
  );

  useEffect(() => {
    if (!publishStripMoreMenuOpen) return;
    const onDown = (event: MouseEvent) => {
      const t = event.target as Node;
      if (publishStripMoreDropdownRef.current?.contains(t)) return;
      setPublishStripMoreMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [publishStripMoreMenuOpen]);

  return (
    <div ref={digestCardScrollRef} className="min-w-0 scroll-mt-4">
      <Card
        className={`min-w-0 overflow-visible border transition-all ${
          expanded
            ? "border-[color:var(--accent)]/55 bg-[color:var(--background)]/98 shadow-[0_18px_48px_-32px_rgba(67,42,33,0.45)]"
            : "border-[#e8e2dc]/90 bg-gradient-to-b from-[#fdfcfa] via-[#fcfbf9] to-[#faf8f5] shadow-[0_16px_42px_-32px_rgba(52,38,30,0.28)] ring-1 ring-[#ebe6df]/45"
        }`}
      >
      <div className="space-y-3.5 p-4 sm:p-[1.125rem]">
        <div className="flex gap-2.5 sm:gap-3">
          {bulkSelect ? (
            <label className="mt-1 flex shrink-0 cursor-pointer items-start pt-0.5 sm:mt-1.5">
              <input
                type="checkbox"
                checked={bulkSelect.selected}
                onChange={(e) => {
                  e.stopPropagation();
                  bulkSelect.onToggle();
                }}
                onClick={(e) => e.stopPropagation()}
                className="h-4 w-4 shrink-0 rounded border-[color:var(--border)] accent-[color:var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)]"
                aria-label={`Select for bulk actions: ${item.title}`}
              />
            </label>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <DigestItemMetaStrip item={item} className="mb-0" />
              {item.investigators.length > 0 ? (
                <LinkedInvestigatorsFacepile
                  variant="inline"
                  investigators={item.investigators}
                  maxVisible={4}
                  className="min-w-0"
                />
              ) : null}
            </div>
          <h3 className="text-xl font-semibold leading-snug tracking-tight text-[color:var(--foreground)]">
            <Link href={`/items/${item.id}`} className="hover:underline">
              {item.title}
            </Link>
          </h3>
          <p className="mt-1.5 text-sm leading-snug text-[color:var(--muted-foreground)]">
            {item.paper_author_names && item.paper_author_names.length > 0 ? (
              <>
                {item.paper_author_names.map((authLine, i) => {
                  const inv = item.investigators.find((x) => pubmedAuthorLineMatchesInvestigator(authLine, x));
                  const profileUrl = inv ? ucsfProfilesUrl(inv.first_name, inv.last_name) : null;
                  return (
                    <Fragment key={`${i}-${authLine.slice(0, 48)}`}>
                      {i > 0 ? (
                        <span className="text-[color:var(--muted-foreground)]/45">, </span>
                      ) : null}
                      {profileUrl ? (
                        <a
                          href={profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 transition-colors hover:text-[color:var(--foreground)]"
                        >
                          {authLine}
                        </a>
                      ) : (
                        <span>{authLine}</span>
                      )}
                    </Fragment>
                  );
                })}
              </>
            ) : item.investigators.length > 0 ? (
              <>
                {item.investigators.map((inv, i) => {
                  const profileUrl = ucsfProfilesUrl(inv.first_name, inv.last_name);
                  return (
                    <Fragment key={inv.id}>
                      {i > 0 ? (
                        <span className="text-[color:var(--muted-foreground)]/45">, </span>
                      ) : null}
                      {profileUrl ? (
                        <a
                          href={profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 transition-colors hover:text-[color:var(--foreground)]"
                        >
                          {inv.name}
                        </a>
                      ) : (
                        <span>{inv.name}</span>
                      )}
                    </Fragment>
                  );
                })}
                {piListedSeparately ? (
                  <>
                    <span className="text-[color:var(--muted-foreground)]/50"> · </span>
                    <span className="text-[color:var(--muted-foreground)]/90">
                      Last author: {item.pi_name}
                    </span>
                  </>
                ) : null}
              </>
            ) : item.pi_name ? (
              <span>{item.pi_name}</span>
            ) : (
              <span>Unassigned</span>
            )}
          </p>
          </div>
          <div className="relative z-20 flex shrink-0 flex-wrap items-center justify-end gap-2">
            <WorkspaceHandleAvatarImg
              postToX
              postToBluesky
              accounts={workspaceAccounts}
              size="sm"
              hideWhenEmpty
            />
            {libraryPreviewMode ? (
              <Button
                type="button"
                variant="secondary"
                className="h-10 min-h-10 px-4 text-sm font-semibold"
                disabled={libraryPreviewMode.reactivating}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void libraryPreviewMode.onReactivate();
                }}
              >
                {libraryPreviewMode.reactivating ? "Restoring…" : "Reactivate"}
              </Button>
            ) : null}
            <div
              ref={actionsToolbarRef}
              className="flex min-h-10 overflow-hidden rounded-xl shadow-[0_14px_30px_-18px_rgba(141,86,64,0.45)]"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActionsMenuOpen(false);
                  if (libraryPreviewMode) libraryPreviewMode.onCollapse();
                  else onToggleExpanded();
                }}
                aria-expanded={libraryPreviewMode ? false : expanded}
                title={
                  libraryPreviewMode ? "Collapse preview" : expanded ? "Collapse" : "Expand"
                }
                aria-label={
                  libraryPreviewMode ? "Collapse preview" : expanded ? "Collapse details" : "Expand details"
                }
                className="inline-flex min-h-10 items-center gap-2 bg-[color:var(--accent)] px-4 text-sm font-semibold text-[color:var(--accent-foreground)] transition-[filter] hover:brightness-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)]"
              >
                <CollapseChevron open={libraryPreviewMode ? false : expanded} variant="onAccent" />
                <span className="hidden sm:inline">
                  {libraryPreviewMode ? "Collapse" : expanded ? "Collapse" : "Expand"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActionsMenuOpen((v) => !v)}
                aria-expanded={actionsMenuOpen}
                aria-haspopup="menu"
                title="Open link and more actions"
                aria-label="Open link and more actions"
                className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center border-l border-[color:var(--accent-foreground)]/25 bg-[color:var(--accent)] text-[color:var(--accent-foreground)] transition-[filter] hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)]"
              >
                <ChevronDownMiniIcon />
              </button>
            </div>
            {actionsMenuOpen ? (
              <div
                ref={actionsMenuDropdownRef}
                role="menu"
                aria-label="Signal actions"
                className="absolute right-0 top-full z-30 mt-1.5 min-w-[14rem] overflow-hidden rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--background)]/98 p-1.5 shadow-[0_18px_30px_-20px_rgba(49,31,24,0.7)]"
              >
                {item.source_url ? (
                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noreferrer"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-[color:var(--foreground)]/90 transition-colors hover:bg-[color:var(--muted)]/35"
                    onClick={() => setActionsMenuOpen(false)}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M15 3h6v6" />
                      <path d="M10 14 21 3" />
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    </svg>
                    Open source article
                  </a>
                ) : (
                  <Link
                    href={`/items/${item.id}`}
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-[color:var(--foreground)]/90 transition-colors hover:bg-[color:var(--muted)]/35"
                    onClick={() => setActionsMenuOpen(false)}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M14 3h7v7" />
                      <path d="M10 14 21 3" />
                      <path d="M5 5v14h14" />
                    </svg>
                    Open signal record
                  </Link>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionsMenuOpen(false);
                    void copySignalLink();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[color:var(--foreground)]/90 transition-colors hover:bg-[color:var(--muted)]/35"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l2.12-2.12a5 5 0 0 0-7.07-7.07L11.3 5.64" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54L4.34 12.6a5 5 0 1 0 7.07 7.07l1.27-1.27" />
                  </svg>
                  Copy source link
                </button>
                {libraryPreviewMode ? null : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      void archiveSignal();
                    }}
                    disabled={archiving || generating || illustrating}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[#8f4d45] transition-colors hover:bg-[#f2dfd9] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                    Archive signal
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
        </div>
      </div>

      {!expanded ? (
        <div className="px-4 pb-6 sm:px-5 sm:pb-6">
          <div className="rounded-2xl border border-[#e8e2dc]/85 bg-[#fcfaf8] p-4 shadow-[0_18px_52px_-36px_rgba(58,44,34,0.22)] sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7c6f64]">
              Output preview
            </p>
            <div className="-mx-4 mt-3 sm:-mx-5">
              <DigestStudioOutputTabs
                omitNavChrome
                tabs={outputPreviewTabs}
                activeStyle={outputPreviewStyle}
                onSelectStyle={setOutputPreviewStyle}
                disabled={generating || archiving || illustrating}
              />
            </div>
            <div className="-mx-4 flex flex-col gap-5 border-t border-[color:var(--border)]/35 bg-[color:var(--card)] px-4 pb-4 pt-4 sm:-mx-5 sm:px-5 md:grid md:grid-cols-[minmax(0,1fr)_minmax(12rem,42%)] md:items-stretch md:gap-6">
              {mergedOutputPreviewEmptyPlaceholders ? (
                <div className="min-w-0 md:col-span-2">
                  <div className="flex min-h-[10rem] flex-col divide-y divide-dashed divide-[#e5e1de]/90 overflow-hidden rounded-xl border border-dashed border-[#e5e1de] bg-[color:var(--card)] md:flex-row md:divide-x md:divide-y-0">
                    <div className="flex min-h-0 min-w-0 flex-1 bg-[color:var(--card)]">
                      <DigestOutputPreviewEmptySummary noChrome />
                    </div>
                    <div className="flex min-h-0 min-w-0 flex-1 bg-[color:var(--card)]">
                      <DigestOutputPreviewEmptyVisuals
                        noChrome
                        variant={digestItemHasVisual(item) ? "pending_load" : "none"}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
              <div
                className={`min-w-0 space-y-2 ${showOutputPreviewSummaryEmpty ? "md:flex md:min-h-0 md:flex-col md:h-full" : ""}`}
              >
                {showOutputPreviewSummaryEmpty ? (
                  <DigestOutputPreviewEmptySummary />
                ) : (
                  <>
                    <p className="text-base font-semibold leading-snug tracking-tight text-[#3c3836] sm:text-lg">
                      {outputCard.headline}
                    </p>
                    <div className="max-h-[min(28rem,52vh)] overflow-y-auto text-sm leading-relaxed text-[#3c3836]/95 [overflow-wrap:anywhere] whitespace-pre-wrap">
                      {outputCard.body}
                    </div>
                  </>
                )}
              </div>
              <div className="min-w-0 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7c6f64] md:sr-only">
                  Visuals
                </p>
                {showDigestHeroImage ? (
                  <div className="relative w-full min-w-0 overflow-hidden rounded-2xl border border-[#e8e2dc]/90 bg-[#faf6ef] p-3 shadow-[0_14px_44px_-30px_rgba(58,44,34,0.22)] ring-1 ring-[#ebe6df]/45 sm:p-4">
                    <div className="flex w-full min-h-0 max-h-[min(42rem,52vh)] justify-center overflow-auto">
                      <div className="relative mx-auto max-w-full inline-block align-top">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={selectedPreviewImageUrl ?? ""}
                          alt={
                            outputPreviewActiveCandidate?.caption?.trim()
                              ? outputPreviewActiveCandidate.caption.trim().slice(0, 220)
                              : ""
                          }
                          className="box-border h-auto max-h-[min(42rem,52vh)] w-auto max-w-full rounded-xl object-contain object-center shadow-[0_8px_32px_-16px_rgba(48,36,28,0.35)] ring-1 ring-black/[0.07]"
                          decoding="async"
                          onLoad={(e) => {
                            const i = e.currentTarget;
                            if (i.naturalWidth > 0 && i.naturalHeight > 0) {
                              setOutputPreviewHeroNaturalDims({ w: i.naturalWidth, h: i.naturalHeight });
                            }
                          }}
                        />
                        {outputPreviewActiveCandidate?.type === "schematic" ? (
                          <DigestIllustrationOverlays
                            layers={outputPreviewActiveCandidate.illustrationTextLayers ?? []}
                            naturalSize={outputPreviewOverlayLayout.naturalSize}
                            cropNatural={outputPreviewOverlayLayout.cropNatural}
                            layoutBoxPx={outputPreviewOverlayLayout.layoutBoxPx}
                            layoutCoordinateSpace={outputPreviewOverlayLayout.layoutCoordinateSpace}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : showArticleLinkPreviewCard ? (
                  <DigestOutputLinkPreviewCard
                    meta={linkPreviewMeta}
                    status={linkPreviewStatus === "idle" ? "loading" : linkPreviewStatus}
                    sourceUrl={item.source_url!.trim()}
                  />
                ) : (socialPreviewUsesArticleLink || linkPreviewHero) && !hasHttpSourceUrl ? (
                  <div className="relative flex min-h-[9rem] w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-[#e5e1de] bg-[#faf8f5] px-3 text-center">
                    <p className="text-xs font-semibold text-[#3c3836]">Link preview</p>
                    <p className="mt-2 text-xs font-medium leading-snug text-[#7c6f64]">
                      Add a valid article URL on this signal to preview how platforms may render the card.
                    </p>
                  </div>
                ) : digestItemHasVisual(item) ? (
                  <DigestOutputPreviewEmptyVisuals variant="pending_load" />
                ) : (
                  <DigestOutputPreviewEmptyVisuals variant="none" />
                )}
              </div>
                </>
              )}
            </div>
          </div>
          {!libraryPreviewMode ? (
            showDigestPublishStrip ? (
            <div className="relative z-10 mt-3 overflow-visible rounded-xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/85 p-4 pb-5 shadow-sm">
              <div className="flex flex-col gap-3 overflow-visible">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--foreground)]">
                    Publish
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
                    {socialPublishInteractive
                      ? "Select where to post this signal."
                      : "Copy this channel’s text or download the hero visual. Switch Output preview to Social to post."}
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 overflow-visible">
                  <button
                    type="button"
                    aria-pressed={postToX}
                    disabled={socialPublishControlsDisabled}
                    title={
                      socialPublishInteractive
                        ? postToX
                          ? "Posting to X"
                          : "Skip X"
                        : publishStripDisabledTitle
                    }
                    onClick={() => setPostToX((v) => !v)}
                    className={`inline-flex h-11 min-h-11 items-center gap-1.5 rounded-lg border px-3 text-[color:var(--foreground)] transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                      postToX
                        ? "border-[color:var(--accent)]/45 bg-[color:var(--card)] shadow-sm"
                        : "border-[color:var(--border)]/70 bg-[color:var(--card)]/95 hover:bg-[color:var(--muted)]/25"
                    }`}
                  >
                    <DigestPublishBarXLogo className="h-5 w-5 text-[#0f1419] dark:text-neutral-100" />
                    {postToX ? (
                      <ToggleCheckMiniIcon className="shrink-0 text-[color:var(--accent)]" />
                    ) : (
                      <span className="w-3.5 shrink-0" aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-pressed={postToBluesky}
                    disabled={socialPublishControlsDisabled}
                    title={
                      socialPublishInteractive
                        ? postToBluesky
                          ? "Posting to Bluesky"
                          : "Skip Bluesky"
                        : publishStripDisabledTitle
                    }
                    onClick={() => setPostToBluesky((v) => !v)}
                    className={`inline-flex h-11 min-h-11 items-center gap-1.5 rounded-lg border px-3 text-[color:var(--foreground)] transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                      postToBluesky
                        ? "border-[color:var(--accent)]/45 bg-[color:var(--card)] shadow-sm"
                        : "border-[color:var(--border)]/70 bg-[color:var(--card)]/95 hover:bg-[color:var(--muted)]/25"
                    }`}
                  >
                    <DigestPublishBarBlueskyLogo className="h-5 w-5 text-[#0085ff]" />
                    {postToBluesky ? (
                      <ToggleCheckMiniIcon className="shrink-0 text-[color:var(--accent)]" />
                    ) : (
                      <span className="w-3.5 shrink-0" aria-hidden />
                    )}
                  </button>

                  <button
                    type="button"
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[color:var(--accent)] px-4 text-sm font-semibold text-[color:var(--accent-foreground)] shadow-[0_14px_30px_-18px_rgba(141,86,64,0.45)] transition-[filter] hover:brightness-[1.03] disabled:pointer-events-none disabled:opacity-50"
                    disabled={socialPublishControlsDisabled || (!postToX && !postToBluesky)}
                    title={socialPublishInteractive ? undefined : publishStripDisabledTitle}
                    onClick={() => void digestStripPost()}
                  >
                    <SendIcon className="h-4 w-4 shrink-0 opacity-95" />
                    {digestStripPosting ? "Posting…" : "Post now"}
                  </button>

                  <button
                    type="button"
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[color:var(--border)]/80 bg-[color:var(--card)]/95 px-4 text-sm font-semibold text-[color:var(--foreground)] shadow-[0_12px_24px_-20px_rgba(89,67,52,0.45)] transition-colors hover:bg-[color:var(--muted)]/45 disabled:pointer-events-none disabled:opacity-50"
                    disabled={socialPublishControlsDisabled || (!postToX && !postToBluesky)}
                    title={socialPublishInteractive ? undefined : publishStripDisabledTitle}
                    onClick={() => void digestStripSchedule()}
                  >
                    <ScheduleIcon className="h-4 w-4 shrink-0 opacity-90" />
                    {digestStripPosting ? "Scheduling…" : "Schedule"}
                  </button>

                  <div ref={publishStripMoreDropdownRef} className="relative">
                    <button
                      type="button"
                      className="inline-flex h-10 min-h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--card)]/95 text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--muted)]/30 hover:text-[color:var(--foreground)] disabled:pointer-events-none disabled:opacity-50"
                      disabled={publishMoreMenuDisabled}
                      title={publishMoreMenuDisabled ? undefined : "Copy text or download visual"}
                      aria-expanded={publishStripMoreMenuOpen}
                      aria-haspopup="menu"
                      aria-label="More publish actions"
                      onClick={() => setPublishStripMoreMenuOpen((o) => !o)}
                    >
                      <PublishBarMoreIcon className="text-[color:var(--muted-foreground)]" />
                    </button>
                    {publishStripMoreMenuOpen ? (
                      <div
                        className="absolute right-0 top-full z-50 mt-1.5 min-w-[14rem] rounded-lg border border-[color:var(--border)]/85 bg-[color:var(--card)] py-1 shadow-lg"
                        role="menu"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--foreground)] hover:bg-[color:var(--muted)]/45"
                          onClick={() => {
                            setPublishStripMoreMenuOpen(false);
                            void digestStripCopy();
                          }}
                        >
                          <ReferencesCopyIcon className="h-4 w-4 shrink-0 opacity-80" />
                          Copy text
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={!canDownloadDigestHero}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--foreground)] hover:bg-[color:var(--muted)]/45 disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={() => {
                            setPublishStripMoreMenuOpen(false);
                            void digestStripDownloadImage();
                          }}
                        >
                          <DownloadIcon className="h-4 w-4 shrink-0 opacity-80" />
                          Download visual
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex w-full shrink-0 justify-end pt-0.5 sm:w-auto sm:pl-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-10 min-h-10 whitespace-nowrap px-4 text-sm font-semibold"
                    disabled={markingComplete || archiving || generating || illustrating}
                    onClick={() => void markDigestWorkflowComplete()}
                  >
                    {markingComplete ? "Saving…" : "Mark complete"}
                  </Button>
                </div>
                </div>
              </div>
            </div>
            ) : (
            <div className="relative z-10 mt-3 rounded-xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/85 p-4 shadow-sm">
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 min-h-10 whitespace-nowrap px-4 text-sm font-semibold"
                  disabled={markingComplete || archiving || generating || illustrating}
                  onClick={() => void markDigestWorkflowComplete()}
                >
                  {markingComplete ? "Saving…" : "Mark complete"}
                </Button>
              </div>
            </div>
            )
          ) : null}
        </div>
      ) : null}

      {expanded && !libraryPreviewMode ? (
        <div className="border-t border-[color:var(--border)]/45 bg-[color:var(--muted)]/6">
          <div className="border-b border-[color:var(--border)]/40 px-4 pb-0 pt-4 sm:px-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
              Channel
            </p>
            <div className="-mx-1 mt-2 sm:mx-0">
              <DigestStudioOutputTabs
                tabs={studioOutputTabs}
                activeStyle={contentStudioEditorSummary.style}
                onSelectStyle={handleSelectDigestOutputTab}
                disabled={generating || archiving || illustrating || resetDigestBusy}
              />
            </div>
          </div>
          <div className="grid isolate items-stretch gap-6 px-4 py-4 sm:px-5 lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] xl:gap-8">
            <div className="relative z-10 flex h-full min-h-0 min-w-0 flex-col gap-5">
              <header className="shrink-0 space-y-1">
                <p className="text-sm font-semibold text-[color:var(--foreground)]">Content studio</p>
                <p className="text-xs leading-relaxed text-[color:var(--muted-foreground)]">
                  Create and manage text for the selected channel.
                </p>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-4">
                <SummaryEditor
                  key={
                    isDigestStudioPlaceholderSummary(contentStudioEditorSummary)
                      ? `digest-ph-${contentStudioEditorSummary.style}`
                      : contentStudioEditorSummary.id
                  }
                  summary={contentStudioEditorSummary}
                  onSaved={async () => {
                    await refreshSummaries();
                  }}
                  variant="embedded"
                  omitPublishChrome={isDigestSocialOutputStyle(contentStudioEditorSummary.style)}
                  publishPlatforms={digestPublishPlatforms}
                  sourceUrl={item.source_url}
                  digestBriefSaveOutletRef={digestBriefSaveOutletRef}
                  onBriefSaveBusyChange={setDigestStripSaving}
                  onDigestBriefDraftChange={({ dirty }) => setDigestBriefDirty(dirty)}
                  onAfterSuccessfulBriefSave={collapseExpandedCardIfNeeded}
                  omitDigestOutputTabs
                  digestWorkflow={{
                    channelOptions: DIGEST_CONTENT_STUDIO_OUTPUT_OPTIONS,
                    selectedChannelStyle: contentStudioEditorSummary.style,
                    onSelectChannelStyle: handleSelectChannelStyle,
                    outputTabs: studioOutputTabs,
                    activeTabStyle: contentStudioEditorSummary.style,
                    onSelectOutputTab: handleSelectDigestOutputTab,
                    onRegenerate: generateSummary,
                    regenerateBusy: generating,
                    onResetDigestOutput: resetDigestOutput,
                    resetDigestBusy,
                    disableActions: archiving || illustrating || resetDigestBusy,
                  }}
                />
              </div>
            </div>
            <div className="relative z-0 flex h-full min-h-0 min-w-0 flex-col gap-5 xl:border-l xl:border-[color:var(--border)]/40 xl:pl-6">
              <header className="shrink-0 space-y-1 xl:pl-0">
                <p className="text-sm font-semibold text-[color:var(--foreground)]">Media library</p>
                <p className="text-xs leading-relaxed text-[color:var(--muted-foreground)]">
                  {DIGEST_MEDIA_LIBRARY_SUBTITLE}
                </p>
              </header>
              {item.digestCoverHasAsset && coverLoading && fetchedDigestCoverStore === null ? (
                <div className="flex min-h-[8rem] flex-1 flex-col items-center justify-center rounded-xl border border-[color:var(--border)]/50 bg-[color:var(--muted)]/15 px-3 py-6 text-center text-sm text-[color:var(--muted-foreground)]">
                  Loading visuals…
                </div>
              ) : (
                <DigestVisualPanel
                  key={`${item.id}-${outputPreviewStyle}`}
                  digestQueueLayout
                  sourceItemId={item.id}
                  outputStyle={outputPreviewStyle}
                  bundle={visualBundle}
                  articleUrl={item.source_url}
                  busy={illustrating}
                  onStarted={() => setIllustrating(true)}
                  onDigestCoverStorePersisted={(store) => setFetchedDigestCoverStore(store)}
                  onComplete={() => {
                    setIllustrating(false);
                    scheduleDigestVisualRouterRefresh();
                  }}
                  disabled={generating || archiving}
                />
              )}
            </div>
          </div>
          <div className="mt-6 border-t border-[color:var(--border)]/35 pt-4">
            <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--border)]/55 bg-[color:var(--card)]/60 px-3 py-3 shadow-[0_12px_28px_-22px_rgba(55,42,36,0.18)] sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4">
              <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--border)]/70 bg-[color:var(--muted)]/25 text-[color:var(--muted-foreground)]"
                  aria-hidden
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 12V6.8" strokeLinecap="round" />
                    <path d="M12 12l4.8 2.2" strokeLinecap="round" />
                  </svg>
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="text-sm font-semibold text-[color:var(--foreground)]">
                    {digestBriefDirty ? "Unsaved changes" : "All changes saved"}
                  </p>
                  <p className="mt-0.5 text-xs text-[color:var(--muted-foreground)]">
                    Last saved{" "}
                    {formatDigestBriefLastSavedLabel(
                      contentStudioEditorSummary.updated_at ?? contentStudioEditorSummary.created_at,
                    )}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="primary"
                  className="h-10 min-h-10 px-5 text-sm font-semibold"
                  disabled={
                    generating ||
                    archiving ||
                    illustrating ||
                    resetDigestBusy ||
                    digestStripSaving ||
                    (!digestBriefDirty && !isDigestStudioPlaceholderSummary(contentStudioEditorSummary))
                  }
                  onClick={() => void digestBriefSaveOutletRef.current?.()}
                >
                  {digestStripSaving ? "Saving…" : "Save all changes"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 min-h-10 px-4 text-sm font-semibold"
                  disabled={digestStripSaving}
                  onClick={() => onToggleExpanded()}
                >
                  Cancel and collapse
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 min-h-10 whitespace-nowrap px-4 text-sm font-semibold"
                  disabled={markingComplete || archiving || generating || illustrating || digestStripSaving}
                  onClick={() => void markDigestWorkflowComplete()}
                >
                  {markingComplete ? "Saving…" : "Mark complete"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
    </div>
  );
}

const digestWorkspaceSegmentedClass =
  "flex w-full min-w-0 gap-1 rounded-xl border border-[color:var(--border)]/90 bg-[color:var(--card)]/95 p-1.5 shadow-[inset_0_1px_3px_rgba(67,54,45,0.07)] sm:inline-flex sm:w-max sm:max-w-none dark:shadow-[inset_0_1px_3px_rgba(0,0,0,0.22)]";

/**
 * Hydration-safe workspace tabs: SSR + first client paint render an inert shell; tablist attaches
 * after mount so Turbo/HMR cannot mismatch older server HTML vs current client markup.
 */
function DigestWorkspaceViewSwitch({
  activeTab,
  onActiveTabChange,
}: {
  activeTab: "copy_illustrator" | "references";
  onActiveTabChange: (tab: "copy_illustrator" | "references") => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  return (
    <div className="w-full space-y-2 sm:w-fit">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--foreground)]">
        View
      </p>
      {mounted ? (
        <div
          className="flex w-full flex-col gap-2 sm:w-fit"
          role="tablist"
          aria-label="Digest workspaces"
        >
          <div className={digestWorkspaceSegmentedClass}>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "copy_illustrator"}
              onClick={() => onActiveTabChange("copy_illustrator")}
              className={`inline-flex min-h-[2.75rem] min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)] sm:flex-initial sm:px-5 ${
                activeTab === "copy_illustrator"
                  ? "bg-[color:var(--accent)] text-[color:var(--accent-foreground)] shadow-[0_2px_8px_-2px_rgba(89,67,52,0.35)] ring-1 ring-[color:var(--accent-foreground)]/25"
                  : "text-[color:var(--foreground)] hover:bg-[color:var(--muted)]/65"
              }`}
            >
              <WorkspaceViewSummariesIcon
                className={
                  activeTab === "copy_illustrator"
                    ? "text-[color:var(--accent-foreground)]"
                    : "text-[color:var(--foreground)]"
                }
              />
              Summaries
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "references"}
              onClick={() => onActiveTabChange("references")}
              className={`inline-flex min-h-[2.75rem] min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)] sm:flex-initial sm:px-5 ${
                activeTab === "references"
                  ? "bg-[color:var(--accent)] text-[color:var(--accent-foreground)] shadow-[0_2px_8px_-2px_rgba(89,67,52,0.35)] ring-1 ring-[color:var(--accent-foreground)]/25"
                  : "text-[color:var(--foreground)] hover:bg-[color:var(--muted)]/65"
              }`}
            >
              <WorkspaceViewReferencesIcon
                className={
                  activeTab === "references"
                    ? "text-[color:var(--accent-foreground)]"
                    : "text-[color:var(--foreground)]"
                }
              />
              References
            </button>
          </div>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-2 sm:w-fit" aria-hidden>
          <div className={`${digestWorkspaceSegmentedClass} min-h-[2.75rem]`} />
        </div>
      )}
    </div>
  );
}

export function MonthlyDigestView({
  monthLabel,
  items,
  selectedMonth,
  minMonth,
  maxMonth,
  workspaceAccounts,
}: {
  monthLabel: string;
  items: DigestItemPayload[];
  selectedMonth?: string;
  minMonth?: string;
  maxMonth?: string;
  /** Connected X / Bluesky avatars for digest signal cards (X prioritized). */
  workspaceAccounts?: WorkspaceAccountAvatars | null;
}) {
  const router = useRouter();
  const [monthInput, setMonthInput] = useState(selectedMonth ?? "");
  const [activeTab, setActiveTab] = useState<"copy_illustrator" | "references">(
    "copy_illustrator",
  );
  const [queueFilter, setQueueFilter] = useState<DigestCategoryFilterChip>("all");
  const [activeDraftSortMode, setActiveDraftSortMode] = useState<"category" | "recent">("category");
  const [expandedDigestItemIds, setExpandedDigestItemIds] = useState<Set<string>>(() => {
    const first = items.find((i) => i.digestMarkedCompleteAt == null);
    return first ? new Set([first.id]) : new Set();
  });
  const [bulkSelectedDigestIds, setBulkSelectedDigestIds] = useState<Set<string>>(() => new Set());
  const [bulkMarkingComplete, setBulkMarkingComplete] = useState(false);
  const bulkSelectAllInViewRef = useRef<HTMLInputElement>(null);
  const [numberedLines, setNumberedLines] = useState(true);
  /** When true, paper references show first 3 authors + et al.; when false, full PubMed author list. */
  const [truncatePaperAuthors, setTruncatePaperAuthors] = useState(true);
  const [referenceSortMode, setReferenceSortMode] = useState<ReferencePublicationsSortMode>("impact");
  const [expandedCategories, setExpandedCategories] = useState<Set<RefCategoryKey>>(
    () => new Set<RefCategoryKey>(["papers", "funding"]),
  );
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<RefCategoryKey | "all">("all");
  const [runningCategory, setRunningCategory] = useState<RefCategoryKey | null>(null);
  const [statusLine, setStatusLine] = useState("");
  const paperItems = useMemo(() => items.filter((item) => item.category === "paper"), [items]);
  const fundingItems = useMemo(() => items.filter((item) => item.category === "funding"), [items]);
  const activeDigestItems = useMemo(
    () => items.filter((item) => item.digestMarkedCompleteAt == null),
    [items],
  );
  const sortedActiveDigestItems = useMemo(() => {
    const rank = (cat: ItemCategory | null): number => {
      // Default Active Drafts sort (top → bottom): News, Awards, Funding, Papers, Other/Unknown.
      if (cat === "media") return 0; // News
      if (cat === "award") return 1; // Awards
      if (cat === "funding") return 2; // Funding
      if (cat === "paper") return 3; // Papers
      return 4;
    };
    const ts = (item: DigestItemPayload): number => {
      const iso = item.published_at ?? item.found_at;
      const d = new Date(iso);
      const t = d.getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    const arr = [...activeDigestItems];
    arr.sort((a, b) => {
      if (activeDraftSortMode === "recent") {
        return ts(b) - ts(a);
      }
      const ra = rank(a.category);
      const rb = rank(b.category);
      if (ra !== rb) return ra - rb;
      // Within a category, keep most recent first.
      const dt = ts(b) - ts(a);
      if (dt !== 0) return dt;
      return a.title.localeCompare(b.title);
    });
    return arr;
  }, [activeDigestItems, activeDraftSortMode]);
  const completedDigestItems = useMemo(() => {
    const done = items.filter((item) => item.digestMarkedCompleteAt != null);
    done.sort(
      (a, b) =>
        new Date(b.digestMarkedCompleteAt!).getTime() -
        new Date(a.digestMarkedCompleteAt!).getTime(),
    );
    return done;
  }, [items]);
  const categories = useMemo<DigestRefCategory[]>(
    () => [
      {
        key: "papers",
        title: "Papers",
        description: "Curate publication references and generate citation-ready lines.",
        items: paperItems,
      },
      {
        key: "funding",
        title: "Funding",
        description: "Curate grants and awards for digest references.",
        items: fundingItems,
      },
    ],
    [paperItems, fundingItems],
  );
  const [selectedByCategory, setSelectedByCategory] = useState<Record<RefCategoryKey, Set<string>>>({
    papers: new Set(),
    funding: new Set(),
  });
  const [resultsByCategory, setResultsByCategory] = useState<Record<RefCategoryKey, BulkRefResult[]>>({
    papers: [],
    funding: [],
  });
  const referencesLeftColRef = useRef<HTMLDivElement>(null);
  /** Preview scroll cap follows Papers height when both columns show; Funding accordion does not stretch the preview. */
  const referencesPapersCardWrapRef = useRef<HTMLDivElement>(null);
  const referencesFundingCardWrapRef = useRef<HTMLDivElement>(null);
  const referencesPreviewScrollRef = useRef<HTMLDivElement>(null);
  const sourceDiscoveryAttemptedIdsRef = useRef<Set<string>>(new Set());
  const sourceDiscoveryRunningRef = useRef(false);
  /** Max height (px) for the scrollable reference list — only applied while/after generation so empty preview stays compact. */
  const [referencesPreviewScrollMaxHeightPx, setReferencesPreviewScrollMaxHeightPx] = useState<number | null>(null);

  useEffect(() => {
    if (selectedMonth) setMonthInput(selectedMonth);
  }, [selectedMonth]);
  useEffect(() => {
    setSelectedByCategory({
      papers: new Set(paperItems.map((item) => item.id)),
      funding: new Set(fundingItems.map((item) => item.id)),
    });
    setResultsByCategory({ papers: [], funding: [] });
    setStatusLine("");
  }, [paperItems, fundingItems]);

  const totalSelectedCount = selectedByCategory.papers.size + selectedByCategory.funding.size;
  const totalGeneratedCount = resultsByCategory.papers.length + resultsByCategory.funding.length;
  const digestActiveCategoryCounts = useMemo(() => {
    const m = new Map<DigestCategoryFilterChip, number>();
    for (const k of DIGEST_CATEGORY_FILTER_CHIPS) {
      if (k !== "all") m.set(k, 0);
    }
    for (const item of activeDigestItems) {
      const c = item.category;
      if (c === "media") m.set("news", (m.get("news") ?? 0) + 1);
      else if (c === "paper") m.set("paper", (m.get("paper") ?? 0) + 1);
      else if (c === "award") m.set("award", (m.get("award") ?? 0) + 1);
      else if (c === "funding") m.set("funding", (m.get("funding") ?? 0) + 1);
      else m.set("other", (m.get("other") ?? 0) + 1);
    }
    return m;
  }, [activeDigestItems]);

  const filteredDigestItems = useMemo(
    () =>
      sortedActiveDigestItems.filter((item) => matchesDigestCategoryChip(item.category, queueFilter)),
    [sortedActiveDigestItems, queueFilter],
  );

  const filteredDigestItemIds = useMemo(
    () => filteredDigestItems.map((i) => i.id),
    [filteredDigestItems],
  );

  const bulkSelectedInViewCount = useMemo(() => {
    let n = 0;
    for (const id of filteredDigestItemIds) {
      if (bulkSelectedDigestIds.has(id)) n++;
    }
    return n;
  }, [filteredDigestItemIds, bulkSelectedDigestIds]);

  const allFilteredSelected =
    filteredDigestItemIds.length > 0 && bulkSelectedInViewCount === filteredDigestItemIds.length;

  useEffect(() => {
    const visible = new Set(filteredDigestItemIds);
    setBulkSelectedDigestIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [filteredDigestItemIds]);

  useEffect(() => {
    const el = bulkSelectAllInViewRef.current;
    if (!el) return;
    el.indeterminate =
      bulkSelectedInViewCount > 0 && bulkSelectedInViewCount < filteredDigestItemIds.length;
  }, [bulkSelectedInViewCount, filteredDigestItemIds.length]);

  const toggleSelectAllInView = useCallback(() => {
    startTransition(() => {
      setBulkSelectedDigestIds((prev) => {
        const visible = filteredDigestItemIds;
        const every = visible.length > 0 && visible.every((id) => prev.has(id));
        const next = new Set(prev);
        if (every) {
          for (const id of visible) next.delete(id);
        } else {
          for (const id of visible) next.add(id);
        }
        return next;
      });
    });
  }, [filteredDigestItemIds]);

  const markBulkSelectedComplete = useCallback(async () => {
    const ids = [...new Set(filteredDigestItemIds.filter((id) => bulkSelectedDigestIds.has(id)))];
    if (ids.length === 0) return;
    setBulkMarkingComplete(true);
    try {
      const res = await fetch("/api/digest-workflow-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ source_item_ids: ids, complete: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        updated?: number;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Bulk update failed");
        return;
      }
      const n = typeof data.updated === "number" ? data.updated : ids.length;
      toast.success(`Marked ${n} ${n === 1 ? "signal" : "signals"} complete`);
      setBulkSelectedDigestIds(new Set());
      startTransition(() => router.refresh());
    } finally {
      setBulkMarkingComplete(false);
    }
  }, [bulkSelectedDigestIds, filteredDigestItemIds, router]);

  useEffect(() => {
    const visibleIds = new Set(filteredDigestItems.map((i) => i.id));
    setExpandedDigestItemIds((prev) => {
      if (filteredDigestItems.length === 0) {
        return prev.size === 0 ? prev : new Set<string>();
      }
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      if (next.size === prev.size && [...prev].every((id) => visibleIds.has(id))) {
        return prev;
      }
      // If every expanded card dropped out of the filter, reopen the first visible row (match prior single-card behavior).
      if (next.size === 0 && prev.size > 0) {
        return new Set([filteredDigestItems[0]!.id]);
      }
      return next;
    });
  }, [filteredDigestItems]);

  useEffect(() => {
    if (activeTab !== "copy_illustrator") return;
    if (sourceDiscoveryRunningRef.current) return;
    const pending = items.filter(
      (item) =>
        item.digestMarkedCompleteAt == null &&
        !sourceDiscoveryAttemptedIdsRef.current.has(item.id) &&
        !item.digestCoverHasAsset,
    );
    if (pending.length === 0) return;

    sourceDiscoveryRunningRef.current = true;
    let cancelled = false;

    void (async () => {
      let shouldRefresh = false;
      for (const item of pending) {
        sourceDiscoveryAttemptedIdsRef.current.add(item.id);
        try {
          const res = await fetch("/api/digest-visuals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "discover_source",
              source_item_id: item.id,
            }),
          });
          if (res.ok) shouldRefresh = true;
        } catch {
          // Keep silent for background auto-discovery.
        }
        if (cancelled) break;
      }
      sourceDiscoveryRunningRef.current = false;
      if (!cancelled && shouldRefresh) router.refresh();
    })();

    return () => {
      cancelled = true;
      sourceDiscoveryRunningRef.current = false;
    };
  }, [activeTab, items, router]);
  /** Cap scroll region to Papers card bottom (or Funding-only when filtered) while generating or after any references exist. */
  const shouldCapReferencesPreviewScroll = useMemo(
    () => runningCategory !== null || totalGeneratedCount > 0,
    [runningCategory, totalGeneratedCount],
  );

  useLayoutEffect(() => {
    if (activeTab !== "references") {
      setReferencesPreviewScrollMaxHeightPx(null);
      return;
    }
    if (typeof ResizeObserver === "undefined") return;

    const leftEl = referencesLeftColRef.current;
    if (!leftEl) return;

    function measurePreviewScrollMax() {
      if (typeof window === "undefined") return;
      const xl = window.matchMedia("(min-width: 1280px)");
      if (!xl.matches || !shouldCapReferencesPreviewScroll) {
        setReferencesPreviewScrollMaxHeightPx(null);
        return;
      }
      const scrollEl = referencesPreviewScrollRef.current;
      const leftNode = referencesLeftColRef.current;
      if (!scrollEl || !leftNode) {
        setReferencesPreviewScrollMaxHeightPx(null);
        return;
      }
      const scrollRect = scrollEl.getBoundingClientRect();
      const paperWrap = referencesPapersCardWrapRef.current;
      const fundingWrap = referencesFundingCardWrapRef.current;
      let capBottom: number;
      if (activeCategoryFilter === "funding") {
        capBottom = (fundingWrap ?? leftNode).getBoundingClientRect().bottom;
      } else {
        /** Papers card only: Funding accordion height does not change the preview cap. */
        capBottom = (paperWrap ?? leftNode).getBoundingClientRect().bottom;
      }
      /** Extra room below the anchor so the scroll region feels less cramped (still page-scrolls if needed). */
      const previewMaxHeightBonusPx = 737;
      const maxList = Math.floor(capBottom - scrollRect.top + previewMaxHeightBonusPx);
      setReferencesPreviewScrollMaxHeightPx(Math.max(200, maxList));
    }

    const ro = new ResizeObserver(() => measurePreviewScrollMax());
    ro.observe(leftEl);
    window.addEventListener("resize", measurePreviewScrollMax);
    measurePreviewScrollMax();
    const scrollForObserve = referencesPreviewScrollRef.current;
    const cardForObserve = scrollForObserve?.parentElement ?? null;
    if (cardForObserve) ro.observe(cardForObserve);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measurePreviewScrollMax);
    };
  }, [
    activeTab,
    expandedCategories,
    activeCategoryFilter,
    paperItems.length,
    fundingItems.length,
    totalGeneratedCount,
    runningCategory,
    shouldCapReferencesPreviewScroll,
  ]);
  const visibleCategories =
    activeCategoryFilter === "all"
      ? categories
      : categories.filter((category) => category.key === activeCategoryFilter);

  function toggleSelected(categoryKey: RefCategoryKey, itemId: string) {
    setSelectedByCategory((prev) => {
      const next = new Set(prev[categoryKey]);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return { ...prev, [categoryKey]: next };
    });
  }

  function selectAll(categoryKey: RefCategoryKey) {
    const category = categories.find((c) => c.key === categoryKey);
    if (!category) return;
    setSelectedByCategory((prev) => ({
      ...prev,
      [categoryKey]: new Set(category.items.map((item) => item.id)),
    }));
  }

  function selectNone(categoryKey: RefCategoryKey) {
    setSelectedByCategory((prev) => ({ ...prev, [categoryKey]: new Set() }));
  }

  async function runCategoryGeneration(categoryKey: RefCategoryKey) {
    const category = categories.find((c) => c.key === categoryKey);
    if (!category) return;
    const selectedItems = category.items.filter((item) => selectedByCategory[categoryKey].has(item.id));
    if (selectedItems.length === 0) {
      toast.error(`Select at least one ${category.title.toLowerCase()} signal.`);
      return;
    }

    setRunningCategory(categoryKey);
    const out: BulkRefResult[] = [];
    for (let i = 0; i < selectedItems.length; i++) {
      const item = selectedItems[i]!;
      const short = item.title.length > 58 ? `${item.title.slice(0, 58)}…` : item.title;
      setStatusLine(`${category.title}: ${i + 1} / ${selectedItems.length} — ${short}`);
      try {
        const res = await fetch("/api/draft-reference", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_item_id: item.id,
            model: undefined,
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          reference?: string;
          paper_author_list_full?: string | null;
          paper_author_list_truncated?: string | null;
        };
        if (!res.ok || !data.reference) throw new Error(data.error ?? "Request failed");
        out.push({
          source_item_id: item.id,
          title: item.title,
          reference: data.reference,
          paper_author_list_full: data.paper_author_list_full,
          paper_author_list_truncated: data.paper_author_list_truncated,
        });
      } catch (e) {
        out.push({
          source_item_id: item.id,
          title: item.title,
          error: e instanceof Error ? e.message : "Failed",
        });
      }
      setResultsByCategory((prev) => ({ ...prev, [categoryKey]: [...out] }));
    }
    setRunningCategory(null);
    setStatusLine("");
    const ok = out.filter((r) => r.reference).length;
    const bad = out.filter((r) => r.error).length;
    toast.success(`${category.title}: ${ok} generated${bad ? `, ${bad} failed` : ""}.`);
  }

  async function runGenerateAllSelectedCategories() {
    const keys = categories
      .filter((category) => selectedByCategory[category.key].size > 0)
      .map((category) => category.key);
    if (keys.length === 0) {
      toast.error("Select at least one signal before generating.");
      return;
    }
    for (const key of keys) {
      await runCategoryGeneration(key);
    }
  }

  function clearGeneratedOutput() {
    setResultsByCategory({ papers: [], funding: [] });
    setStatusLine("");
  }

  const itemSortById = useMemo(() => buildDigestItemSortMap(items), [items]);
  const orderedResultsByCategory = useMemo(
    () =>
      ({
        papers: sortOutputPreviewReferenceRows(
          resultsByCategory.papers,
          "papers",
          itemSortById,
          referenceSortMode,
          SCIMAGO_SJR_LOOKUP,
        ),
        funding: sortOutputPreviewReferenceRows(
          resultsByCategory.funding,
          "funding",
          itemSortById,
          referenceSortMode,
          SCIMAGO_SJR_LOOKUP,
        ),
      }) as const,
    [itemSortById, referenceSortMode, resultsByCategory.papers, resultsByCategory.funding],
  );
  const combinedOutputText = useMemo(() => {
    const lines: string[] = [`References — ${monthLabel}`, ""];
    for (const category of categories) {
      const results = orderedResultsByCategory[category.key];
      if (results.length === 0) continue;
      lines.push(`${category.title}`);
      lines.push(...formatReferenceLines(results, numberedLines, truncatePaperAuthors));
      lines.push("");
    }
    return lines.join("\n").trim();
  }, [categories, orderedResultsByCategory, numberedLines, truncatePaperAuthors, monthLabel]);

  async function copyText(text: string, successMsg: string) {
    if (!text.trim()) {
      toast.error("Nothing to copy yet.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMsg);
    } catch {
      toast.error("Copy failed — select text and copy manually.");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Digest for {monthLabel}</h1>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
            Curate, generate, review, and publish from one monthly editorial workflow.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!monthInput) return;
            router.push(`/digest/${monthInput}`);
          }}
          className="surface-subtle flex w-full max-w-sm items-end gap-2 rounded-2xl p-2.5 sm:w-auto sm:min-w-[320px]"
        >
          <label className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
            Month
            <div className="relative mt-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] normal-case">
              <span
                className="pointer-events-none absolute left-3 top-1/2 z-0 max-w-[calc(100%-2.75rem)] -translate-y-1/2 truncate text-base font-normal tracking-[-0.012em] text-[color:var(--foreground)]"
                aria-hidden
              >
                {monthInput ? formatYearMonthLabel(monthInput) : "Select month"}
              </span>
              <input
                type="month"
                name="month"
                value={monthInput}
                onChange={(e) => setMonthInput(e.target.value)}
                min={minMonth}
                max={maxMonth}
                className="relative z-10 mt-0 w-full cursor-pointer rounded-xl border-0 bg-transparent px-3 py-2 text-base text-transparent caret-transparent outline-none focus:ring-0 normal-case"
              />
            </div>
          </label>
          <Button type="submit" className="shrink-0 whitespace-nowrap px-4">
            Go
          </Button>
        </form>
      </div>
      <DigestWorkspaceViewSwitch activeTab={activeTab} onActiveTabChange={setActiveTab} />
      {items.length === 0 ? (
        <Card>
          <CardTitle>No approved items this month</CardTitle>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
            Approve items in Signals (or adjust published/found dates) so they appear here for this
            month.
          </p>
        </Card>
      ) : (
        <>
          {activeTab === "copy_illustrator" ? (
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
                  Active Drafts
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[color:var(--muted-foreground)]">
                  Signals still being shaped, reviewed, edited, or prepared for release. Mark complete to tuck it into the Completed Library.
                </p>
              </div>
              {activeDigestItems.length > 0 ? (
                <Card className={DIGEST_WORKSPACE_PANEL_CLASS}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-snug">
                    <BrowseTypeSectionFilterIcon />
                    <span className="font-semibold uppercase tracking-[0.1em] text-[color:var(--muted-foreground)]">
                      Filter by type
                    </span>
                    <span
                      className="hidden h-3 w-px bg-[color:var(--border)]/80 sm:block"
                      aria-hidden
                    />
                    <span className="text-[color:var(--muted-foreground)]">
                      Click a category to filter draft signals.
                    </span>
                  </div>
                  <div
                    className="mt-3 flex flex-wrap gap-2.5"
                    role="group"
                    aria-label="Filter draft signals by category"
                  >
                    {DIGEST_CATEGORY_FILTER_CHIPS.map((f) => {
                      const count =
                        f === "all"
                          ? activeDigestItems.length
                          : digestActiveCategoryCounts.get(f) ?? 0;
                      const isEmpty = f !== "all" && count === 0;
                      const selected = queueFilter === f;
                      const label =
                        f === "all" ? "Total" : digestCategoryChipLabel(f);
                      const iconTone = isEmpty
                        ? "text-[color:var(--muted-foreground)]/45"
                        : selected
                          ? "text-[color:var(--foreground)]"
                          : "text-[color:var(--muted-foreground)]";
                      const labelTone = isEmpty
                        ? "text-[color:var(--muted-foreground)]/45"
                        : selected
                          ? "text-[color:var(--foreground)]"
                          : "text-[color:var(--muted-foreground)]";
                      const countTone = isEmpty
                        ? "text-[color:var(--muted-foreground)]/45"
                        : "text-[color:var(--foreground)]";
                      return (
                        <button
                          key={f}
                          type="button"
                          disabled={isEmpty}
                          aria-pressed={selected}
                          title={
                            isEmpty
                              ? `No signals in ${digestCategoryChipLabel(f)} for Active Drafts this month`
                              : undefined
                          }
                          onClick={() => {
                            if (!isEmpty) setQueueFilter(f);
                          }}
                          className={`flex min-h-[3.625rem] min-w-[6.5rem] max-w-[14rem] flex-col justify-between gap-0.5 rounded-xl border px-2 py-1.5 transition-[border-color,background-color,box-shadow] duration-150 ease-out ${
                            isEmpty
                              ? "cursor-not-allowed border-[color:var(--border)]/30 bg-[color:var(--muted)]/6"
                              : selected
                                ? "border-[color:var(--accent)]/65 bg-[color:var(--accent)]/16 shadow-[0_1px_2px_rgba(52,38,30,0.06)] ring-1 ring-[color:var(--accent)]/20"
                                : "border-[color:var(--border)]/55 bg-[color:var(--card)]/80 hover:border-[color:var(--border)]/75 hover:bg-[color:var(--muted)]/10"
                          }`}
                        >
                          <div className="flex w-full items-center gap-1.5">
                            <span
                              className={`inline-flex shrink-0 rounded-md p-0.5 ${
                                !isEmpty && selected ? "bg-[color:var(--accent)]/18" : ""
                              }`}
                              aria-hidden
                            >
                              <DigestQueueCategoryFilterIcon chip={f} className={iconTone} />
                            </span>
                            <p
                              className={`min-w-0 flex-1 text-left text-[10px] font-semibold uppercase leading-none tracking-[0.09em] ${labelTone}`}
                            >
                              {label}
                            </p>
                          </div>
                          <p
                            className={`w-full text-center text-lg font-semibold tabular-nums leading-none tracking-tight ${countTone}`}
                          >
                            {count}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  {filteredDigestItems.length > 0 ? (
                    <div className="mt-3 border-t border-[color:var(--border)]/45 pt-3">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span className="inline-flex items-center gap-x-2 text-[11px] leading-snug">
                          <BulkActionsSectionIcon />
                          <span className="font-semibold uppercase tracking-[0.1em] text-[color:var(--muted-foreground)]">
                            Bulk actions
                          </span>
                        </span>
                        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                          <input
                            ref={bulkSelectAllInViewRef}
                            type="checkbox"
                            checked={allFilteredSelected}
                            onChange={toggleSelectAllInView}
                            className="h-4 w-4 rounded border-[color:var(--border)] accent-[color:var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)]"
                          />
                          Select all
                        </label>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={bulkSelectedInViewCount === 0 || bulkMarkingComplete}
                          className="h-9 px-3 text-sm font-semibold"
                          onClick={() => void markBulkSelectedComplete()}
                        >
                          {bulkMarkingComplete
                            ? "Marking complete…"
                            : "Mark selected complete"}
                        </Button>
                        <div className="ml-auto mr-2 flex w-max max-w-full shrink-0 items-center gap-2 sm:mr-3">
                          <label
                            htmlFor="active-draft-sort"
                            className="shrink-0 whitespace-nowrap text-xs font-semibold text-[color:var(--foreground)]/90"
                          >
                            Sort
                          </label>
                          <Select
                            id="active-draft-sort"
                            value={activeDraftSortMode}
                            onChange={(e) => setActiveDraftSortMode(e.target.value as "category" | "recent")}
                            className="!w-[min(100%,8rem)] max-w-full shrink-0 cursor-pointer py-2.5 text-sm leading-normal"
                            aria-label="Sort Active Drafts"
                          >
                            <option value="category">Category</option>
                            <option value="recent">Most recent</option>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </Card>
              ) : null}
              {activeDigestItems.length === 0 ? (
                <Card className="rounded-2xl border-dashed border-[color:var(--border)]/70 bg-[color:var(--background)]/65 p-6 text-center">
                  <p className="text-sm text-[color:var(--muted-foreground)]">
                    No active drafts for this month. When you mark signals complete, they appear in the Completed Library
                    below.
                  </p>
                </Card>
              ) : filteredDigestItems.length === 0 ? (
                <Card className="rounded-2xl border-dashed border-[color:var(--border)]/70 bg-[color:var(--background)]/65 p-6 text-center">
                  <p className="text-sm text-[color:var(--muted-foreground)]">
                    No highlights match this filter for the selected month.
                  </p>
                </Card>
              ) : (
                <ul className="space-y-4">
                  {filteredDigestItems.map((item) => (
                    <li key={item.id}>
                      <DigestItemRow
                        item={item}
                        model=""
                        expanded={expandedDigestItemIds.has(item.id)}
                        onToggleExpanded={() =>
                          setExpandedDigestItemIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          })
                        }
                        bulkSelect={{
                          selected: bulkSelectedDigestIds.has(item.id),
                          onToggle: () =>
                            setBulkSelectedDigestIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            }),
                        }}
                        workspaceAccounts={workspaceAccounts}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {completedDigestItems.length > 0 ? (
                <details
                  className="scroll-mt-6 rounded-2xl border border-[color:var(--border)]/50 bg-[color:var(--background)]/70 open:border-[color:var(--border)]/65 open:shadow-[0_14px_44px_-32px_rgba(52,38,30,0.38)]"
                  open
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors hover:bg-[color:var(--muted)]/12 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
                        Completed Library
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-[color:var(--muted-foreground)]">
                        Finished outputs — browse compact rows here; open one for output preview or reactivate to edit again.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-[color:var(--border)]/55 bg-[color:var(--card)]/85 px-2.5 py-1 text-xs font-semibold tabular-nums text-[color:var(--foreground)]">
                      {completedDigestItems.length}
                    </span>
                  </summary>
                  <div className="border-t border-[color:var(--border)]/45 px-3 pb-4 pt-3">
                    <ul className="space-y-2">
                      {completedDigestItems.map((item) => (
                        <DigestCompletedSignalCard key={item.id} item={item} model="" workspaceAccounts={workspaceAccounts} />
                      ))}
                    </ul>
                  </div>
                </details>
              ) : null}
            </div>
          ) : (
            <div className="space-y-5">
              <Card className={DIGEST_WORKSPACE_PANEL_CLASS}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-snug">
                  <WorkspaceViewReferencesIcon className="!h-4 !w-4 shrink-0 text-[color:var(--muted-foreground)] sm:!h-4 sm:!w-4" />
                  <span className="font-semibold uppercase tracking-[0.1em] text-[color:var(--muted-foreground)]">
                    Selection summary
                  </span>
                  <span
                    className="hidden h-3 w-px bg-[color:var(--border)]/80 sm:block"
                    aria-hidden
                  />
                  <span className="text-[color:var(--muted-foreground)]">
                    Choose a category to expand signals and generate references.
                  </span>
                </div>
                <div
                  className="mt-3 flex flex-wrap gap-2.5"
                  role="group"
                  aria-label="Reference categories and selection totals"
                >
                  <button
                    type="button"
                    onClick={() => setActiveCategoryFilter("all")}
                    className={`flex min-h-[3.625rem] min-w-[6.5rem] max-w-[14rem] flex-col justify-between gap-0.5 rounded-xl border px-2 py-1.5 text-left transition-[border-color,background-color,box-shadow] duration-150 ease-out ${
                      activeCategoryFilter === "all"
                        ? "border-[color:var(--accent)]/65 bg-[color:var(--accent)]/16 shadow-[0_1px_2px_rgba(52,38,30,0.06)] ring-1 ring-[color:var(--accent)]/20"
                        : "border-[color:var(--border)]/55 bg-[color:var(--card)]/80 hover:border-[color:var(--border)]/75 hover:bg-[color:var(--muted)]/10"
                    }`}
                  >
                    <div className="flex w-full items-center gap-1.5">
                      <span
                        className={`inline-flex shrink-0 rounded-md p-0.5 ${
                          activeCategoryFilter === "all" ? "bg-[color:var(--accent)]/18" : ""
                        }`}
                        aria-hidden
                      >
                        <DigestQueueCategoryFilterIcon
                          chip="all"
                          className={
                            activeCategoryFilter === "all"
                              ? "text-[color:var(--foreground)]"
                              : "text-[color:var(--muted-foreground)]"
                          }
                        />
                      </span>
                      <p
                        className={`min-w-0 flex-1 text-[10px] font-semibold leading-none tracking-[0.02em] ${
                          activeCategoryFilter === "all"
                            ? "text-[color:var(--foreground)]"
                            : "text-[color:var(--muted-foreground)]"
                        }`}
                      >
                        Selected
                      </p>
                    </div>
                    <p
                      className={`w-full text-center text-lg font-semibold tabular-nums leading-none tracking-tight ${
                        activeCategoryFilter === "all"
                          ? "text-[color:var(--foreground)]"
                          : "text-[color:var(--muted-foreground)]"
                      }`}
                    >
                      {totalSelectedCount}
                    </p>
                  </button>
                  {categories.map((category) => {
                    const selected = activeCategoryFilter === category.key;
                    const filterChip: DigestCategoryFilterChip =
                      category.key === "papers" ? "paper" : "funding";
                    const iconTone = selected
                      ? "text-[color:var(--foreground)]"
                      : "text-[color:var(--muted-foreground)]";
                    const labelTone = iconTone;
                    const countTone = selected
                      ? "text-[color:var(--foreground)]"
                      : "text-[color:var(--muted-foreground)]";
                    return (
                      <button
                        key={category.key}
                        type="button"
                        onClick={() => {
                          setActiveCategoryFilter(category.key);
                          setExpandedCategories((prev) => new Set(prev).add(category.key));
                        }}
                        className={`flex min-h-[3.625rem] min-w-[6.5rem] max-w-[14rem] flex-col justify-between gap-0.5 rounded-xl border px-2 py-1.5 text-left transition-[border-color,background-color,box-shadow] duration-150 ease-out ${
                          selected
                            ? "border-[color:var(--accent)]/65 bg-[color:var(--accent)]/16 shadow-[0_1px_2px_rgba(52,38,30,0.06)] ring-1 ring-[color:var(--accent)]/20"
                            : "border-[color:var(--border)]/55 bg-[color:var(--card)]/80 hover:border-[color:var(--border)]/75 hover:bg-[color:var(--muted)]/10"
                        }`}
                      >
                        <div className="flex w-full items-center gap-1.5">
                          <span
                            className={`inline-flex shrink-0 rounded-md p-0.5 ${
                              selected ? "bg-[color:var(--accent)]/18" : ""
                            }`}
                            aria-hidden
                          >
                            <DigestQueueCategoryFilterIcon chip={filterChip} className={iconTone} />
                          </span>
                          <p
                            className={`min-w-0 flex-1 text-[10px] font-semibold uppercase leading-none tracking-[0.09em] ${labelTone}`}
                          >
                            {category.title}
                          </p>
                        </div>
                        <p
                          className={`w-full text-center text-lg font-semibold tabular-nums leading-none tracking-tight ${countTone}`}
                        >
                          {selectedByCategory[category.key].size}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 border-t border-[color:var(--border)]/45 pt-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="inline-flex items-center gap-x-2 text-[11px] leading-snug">
                      <OutputOptionsSectionIcon />
                      <span className="font-semibold uppercase tracking-[0.1em] text-[color:var(--muted-foreground)]">
                        Output options
                      </span>
                    </span>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                      <input
                        type="checkbox"
                        checked={numberedLines}
                        onChange={(e) => setNumberedLines(e.target.checked)}
                        className="h-4 w-4 rounded border-[color:var(--border)] accent-[color:var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)]"
                      />
                      Numbered lines
                    </label>
                    <label
                      className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[color:var(--foreground)]"
                      title="Papers: on = first 3 authors + et al.; off = full author list (requires generated references from updated API)."
                    >
                      <input
                        type="checkbox"
                        checked={truncatePaperAuthors}
                        onChange={(e) => setTruncatePaperAuthors(e.target.checked)}
                        className="h-4 w-4 rounded border-[color:var(--border)] accent-[color:var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)]"
                        aria-label="Format: truncate paper authors to three plus et al."
                      />
                      Format: Truncate
                    </label>
                    <div className="ml-auto mr-2 flex w-max max-w-full shrink-0 items-center gap-2 sm:mr-3">
                      <label
                        htmlFor="reference-sort-output"
                        className="shrink-0 whitespace-nowrap text-xs font-semibold text-[color:var(--foreground)]/90"
                      >
                        Sort
                      </label>
                      <Select
                        id="reference-sort-output"
                        value={referenceSortMode}
                        onChange={(e) =>
                          setReferenceSortMode(e.target.value as ReferencePublicationsSortMode)
                        }
                        className="!w-[min(100%,17rem)] max-w-full shrink-0 cursor-pointer py-2.5 text-sm leading-normal"
                        aria-label="Sort order: papers use journal impact (SCImago); funding uses award amount when available"
                      >
                        <option value="impact">Journal impact · Funding amount</option>
                        <option value="recent">Most recent</option>
                        <option value="alphabetical">Alphabetical (1st author)</option>
                      </Select>
                    </div>
                  </div>
                </div>
              </Card>
              <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)]">
                <div ref={referencesLeftColRef} className="min-w-0 space-y-4">
                  {visibleCategories.map((category) => (
                    <div
                      key={category.key}
                      ref={
                        category.key === "papers"
                          ? referencesPapersCardWrapRef
                          : category.key === "funding"
                            ? referencesFundingCardWrapRef
                            : undefined
                      }
                      className="min-w-0"
                    >
                      <DigestCategoryCard
                        category={category}
                        expanded={expandedCategories.has(category.key)}
                        generatedCount={resultsByCategory[category.key].filter((r) => r.reference).length}
                        selectedCount={selectedByCategory[category.key].size}
                        running={runningCategory === category.key}
                        selectedIds={selectedByCategory[category.key]}
                        workspaceAccounts={workspaceAccounts}
                        onExpand={() => {
                          setExpandedCategories((prev) => {
                            const next = new Set(prev);
                            if (next.has(category.key)) next.delete(category.key);
                            else next.add(category.key);
                            return next;
                          });
                        }}
                        onToggleItem={(id) => toggleSelected(category.key, id)}
                        onSelectAll={() => selectAll(category.key)}
                        onSelectNone={() => selectNone(category.key)}
                        onGenerateCategory={() => void runCategoryGeneration(category.key)}
                      />
                    </div>
                  ))}
                </div>
                <div className="min-w-0 h-fit xl:min-h-0">
                  <Card className="h-fit min-w-0 rounded-2xl border-[color:var(--border)]/75 bg-[color:var(--background)]/92 p-5 shadow-[0_20px_40px_-30px_rgba(43,27,21,0.75)]">
                  <div className="shrink-0 flex flex-wrap items-start justify-between gap-2 border-b border-[color:var(--border)]/55 pb-3.5">
                    <div>
                      <p className="text-base font-semibold tracking-tight text-[color:var(--foreground)]">Output preview</p>
                      <p className="text-xs leading-relaxed text-[color:var(--muted-foreground)]">
                        Review digest-ready references before copy/export.
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void runGenerateAllSelectedCategories()}
                        disabled={Boolean(runningCategory) || totalSelectedCount === 0}
                        className="h-10 shrink-0 px-3 text-xs font-semibold"
                      >
                        Generate all categories
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={clearGeneratedOutput}
                        disabled={totalGeneratedCount === 0 || Boolean(runningCategory)}
                        className="h-10 shrink-0 px-3 text-xs text-[color:var(--muted-foreground)] hover:!bg-transparent disabled:hover:!bg-transparent"
                      >
                        Clear
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void copyText(combinedOutputText, "Combined references copied")}
                        disabled={!combinedOutputText}
                        className="h-10 min-h-10 w-10 min-w-10 shrink-0 overflow-visible p-0 leading-none"
                        aria-label="Copy all references"
                        title="Copy all references"
                      >
                        <ReferencesCopyIcon />
                        <span className="sr-only">Copy all references</span>
                      </Button>
                    </div>
                  </div>
                  <div
                    ref={referencesPreviewScrollRef}
                    className={`mt-4 overflow-y-auto pr-1 ${
                      shouldCapReferencesPreviewScroll && referencesPreviewScrollMaxHeightPx != null
                        ? "max-xl:max-h-[min(44rem,88vh)] xl:max-h-none"
                        : shouldCapReferencesPreviewScroll
                          ? "max-h-[min(44rem,88vh)]"
                          : ""
                    }`}
                    style={
                      shouldCapReferencesPreviewScroll && referencesPreviewScrollMaxHeightPx != null
                        ? { maxHeight: referencesPreviewScrollMaxHeightPx }
                        : undefined
                    }
                  >
                    {categories.map((category) => {
                      const lines = formatReferenceLines(
                        orderedResultsByCategory[category.key],
                        numberedLines,
                        truncatePaperAuthors,
                      );
                      if (lines.length === 0) return null;
                      return (
                        <section key={category.key} className="border-b border-[color:var(--border)]/45 py-4 first:pt-0 last:border-b-0 last:pb-0">
                          <div className="mb-2.5 flex items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold tracking-tight text-[color:var(--foreground)]">{category.title}</h3>
                            <button
                              type="button"
                              onClick={() =>
                                void copyText(
                                  formatBulkReferenceList(orderedResultsByCategory[category.key], {
                                    numberedLines,
                                    monthLabel,
                                    truncatePaperAuthors,
                                  }),
                                  `${category.title} references copied`,
                                )
                              }
                              className="inline-flex h-9 min-h-9 w-9 min-w-9 shrink-0 items-center justify-center overflow-visible rounded-md border border-[color:var(--border)]/70 bg-[color:var(--background)]/85 leading-none text-[color:var(--foreground)] transition-colors hover:text-[color:var(--foreground)]"
                              aria-label={`Copy ${category.title} references`}
                              title={`Copy ${category.title} references`}
                            >
                              <ReferencesCopyIcon />
                            </button>
                          </div>
                          <ol className="space-y-2.5 text-sm leading-relaxed text-[color:var(--foreground)]">
                            {lines.map((line, index) => (
                              <li key={`${category.key}-${index}`} className="break-words rounded-lg border border-[color:var(--border)]/45 bg-[color:var(--background)]/96 px-3 py-2.5 font-mono text-[13px] leading-relaxed text-[color:var(--foreground)]/95">
                                {line}
                              </li>
                            ))}
                          </ol>
                        </section>
                      );
                    })}
                    {totalGeneratedCount === 0 ? (
                      <p className="rounded-xl border border-dashed border-[color:var(--border)]/75 bg-[color:var(--muted)]/12 px-3 py-8 text-center text-sm text-[color:var(--muted-foreground)]">
                        Generate one or more categories to populate the preview.
                      </p>
                    ) : null}
                  </div>
                  </Card>
                </div>
              </div>
              {statusLine ? (
                <p className="rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--muted)]/22 px-3 py-2 text-xs text-[color:var(--muted-foreground)]" aria-live="polite">
                  {statusLine}
                </p>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
