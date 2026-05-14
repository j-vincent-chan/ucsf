"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  directoryHasPeopleRoster,
  type InvestigatorSocialDirectory,
} from "@/lib/social-signals/ai-companion/investigator-directory";
import type { SocialFeedTab, SocialPost } from "@/lib/social-signals/types";
import { createDefaultRecommendationPreferenceProfile } from "@/lib/social-signals/ai-companion/default-preferences";
import { loadPreferenceProfile, savePreferenceProfile } from "@/lib/social-signals/ai-companion/feedback-persistence";
import { generateSignalRecommendations, companionTypeBadgeStyle } from "@/lib/social-signals/ai-companion/engine";
import type { RecommendationPreferenceProfile } from "@/lib/social-signals/ai-companion/preferences-types";
import type {
  AICompanionOutput,
  RecommendationAction,
  RecommendationStatus,
  RecommendationType,
  SignalRecommendation,
} from "@/lib/social-signals/ai-companion/types";
import type { ConfidenceLabel } from "@/lib/social-signals/ai-companion/scoring-explanation-types";
import { PlatformBadge } from "./platform-badge";
import { useSocialBookmarksOptional } from "./social-bookmarks-context";

function oneLineSnippet(s: string, max = 120) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (!t) return "—";
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function formatRelativePostAge(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diffMs = Date.now() - t;
  if (diffMs < 0) return "";
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function SparkIcon({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l1.6 5.3L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.7L12 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l.9 2.6L22 18l-2.1.7L19 21l-.9-2.3L16 18l2.1-1.4L19 14z" />
    </svg>
  );
}

function MoreIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 12h.01M12 12h.01M18 12h.01"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBookmark({ className = "", filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  );
}

function IconShare({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
    </svg>
  );
}

function IconOpenExternal({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
    </svg>
  );
}

/** Heroicons 24/outline hand-thumb-up — MIT */
function IconHandThumbUp({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6.63257 10.25C7.43892 10.25 8.16648 9.80416 8.6641 9.16967C9.43726 8.18384 10.4117 7.3634 11.5255 6.77021C12.2477 6.38563 12.8743 5.81428 13.1781 5.05464C13.3908 4.5231 13.5 3.95587 13.5 3.38338V2.75C13.5 2.33579 13.8358 2 14.25 2C15.4926 2 16.5 3.00736 16.5 4.25C16.5 5.40163 16.2404 6.49263 15.7766 7.46771C15.511 8.02604 15.8836 8.75 16.5019 8.75M16.5019 8.75H19.6277C20.6544 8.75 21.5733 9.44399 21.682 10.4649C21.7269 10.8871 21.75 11.3158 21.75 11.75C21.75 14.5976 20.7581 17.2136 19.101 19.2712C18.7134 19.7525 18.1142 20 17.4962 20H13.4802C12.9966 20 12.5161 19.922 12.0572 19.7691L8.94278 18.7309C8.48393 18.578 8.00342 18.5 7.51975 18.5H5.90421M16.5019 8.75H14.25M5.90421 18.5C5.98702 18.7046 6.07713 18.9054 6.17423 19.1022C6.37137 19.5017 6.0962 20 5.65067 20H4.74289C3.85418 20 3.02991 19.482 2.77056 18.632C2.43208 17.5226 2.25 16.3451 2.25 15.125C2.25 13.5725 2.54481 12.0889 3.08149 10.7271C3.38655 9.95303 4.16733 9.5 4.99936 9.5H6.05212C6.52404 9.5 6.7973 10.0559 6.5523 10.4593C5.72588 11.8198 5.25 13.4168 5.25 15.125C5.25 16.3185 5.48232 17.4578 5.90421 18.5Z" />
    </svg>
  );
}

/** Heroicons 24/outline hand-thumb-down — MIT */
function IconHandThumbDown({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7.49809 15.25H4.37227C3.34564 15.25 2.4267 14.556 2.31801 13.5351C2.27306 13.1129 2.25 12.6841 2.25 12.25C2.25 9.40238 3.24188 6.78642 4.899 4.72878C5.2866 4.24749 5.88581 4 6.50377 4L10.5198 4C11.0034 4 11.4839 4.07798 11.9428 4.23093L15.0572 5.26908C15.5161 5.42203 15.9966 5.5 16.4803 5.5L17.7745 5.5M7.49809 15.25C8.11638 15.25 8.48896 15.974 8.22337 16.5323C7.75956 17.5074 7.5 18.5984 7.5 19.75C7.5 20.9926 8.50736 22 9.75 22C10.1642 22 10.5 21.6642 10.5 21.25V20.6166C10.5 20.0441 10.6092 19.4769 10.8219 18.9454C11.1257 18.1857 11.7523 17.6144 12.4745 17.2298C13.5883 16.6366 14.5627 15.8162 15.3359 14.8303C15.8335 14.1958 16.5611 13.75 17.3674 13.75H17.7511M7.49809 15.25H9.7M17.7745 5.5C17.7851 5.55001 17.802 5.59962 17.8258 5.6478C18.4175 6.84708 18.75 8.19721 18.75 9.625C18.75 11.1117 18.3895 12.5143 17.7511 13.75M17.7745 5.5C17.6975 5.13534 17.9575 4.75 18.3493 4.75H19.2571C20.1458 4.75 20.9701 5.26802 21.2294 6.11804C21.5679 7.22737 21.75 8.40492 21.75 9.625C21.75 11.1775 21.4552 12.6611 20.9185 14.0229C20.6135 14.797 19.8327 15.25 19.0006 15.25H17.9479C17.476 15.25 17.2027 14.6941 17.4477 14.2907C17.5548 14.1144 17.6561 13.934 17.7511 13.75" />
    </svg>
  );
}

function IconChevronUp({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 15l-6-6-6 6" />
    </svg>
  );
}

function IconChevronDown({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

function IconChevronRight({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
    </svg>
  );
}

function IconSliders({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M9 8h6M15 16h6M7 4h2" />
    </svg>
  );
}

function IconClock({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" d="M12 6v6l4 2" />
    </svg>
  );
}

function IconTrendUp({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M23 6l-9.5 9.5-5-5L1 18" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 6h6v6" />
    </svg>
  );
}

function IconFlame({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {/* Heroicons 24/outline Fire — MIT license */}
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z"
      />
    </svg>
  );
}

function IconBarChart({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  );
}

/** Heroicons 24/outline Signal — medium / on-the-radar priority */
function IconSignal({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.348 14.652a3.75 3.75 0 0 1 0-5.304m5.304 0a3.75 3.75 0 0 1 0 5.304m-7.425 2.121a6.75 6.75 0 0 1 0-9.546m9.546 0a6.75 6.75 0 0 1 0 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
      />
    </svg>
  );
}

/** Heroicons 24/outline Queue list — standard / routine queue */
function IconQueueList({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"
      />
    </svg>
  );
}

/** Heroicons 24/outline — MIT */
function IconChatBubbleLeftRight({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
      />
    </svg>
  );
}

/** Unified mark: thread + upward traction (Amplify & Respond). Thin strokes, optically centered, scaled in the viewBox. */
function IconAmplifyRespondMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <g
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(0.45 -0.95) translate(12 12) scale(1.14) translate(-12 -12)"
      >
        <path d="M5.25 8.75h10.5A1.75 1.75 0 0117.5 10.5v4.25A1.75 1.75 0 0115.75 16.5h-3.5l-2.25 2.25V16.5h-2A1.75 1.75 0 015.25 14.75v-4.25a1.75 1.75 0 011.75-1.75z" />
        <path d="M8 14.5l2-2 1.5 1 3.5-3.5 1.5 1.25" />
      </g>
    </svg>
  );
}

function IconShieldExclamation({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.25-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z"
      />
    </svg>
  );
}

function IconShieldOutline({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"
      />
    </svg>
  );
}

function IconBolt({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5 18 4.5l-6.75 6.75 2.25 9-8.25-6.75Z" />
    </svg>
  );
}

function IconUsers({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
      />
    </svg>
  );
}

function IconFlag({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5"
      />
    </svg>
  );
}

function IconBookmarkRibbon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
      />
    </svg>
  );
}

function IconDocumentText({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
      />
    </svg>
  );
}

function IconLightBulb({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
      />
    </svg>
  );
}

function IconPlayCircle({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.91 11.672a.375.375 0 0 1 0 .656l-5.603 3.113a.375.375 0 0 1-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112Z"
      />
    </svg>
  );
}

/** Line-art trophy (cup + handles + base); reads clearly on dark fills. */
function IconTrophy({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 22h16" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
    </svg>
  );
}

const recommendationTypeBadgeIconClass = "h-[18px] w-[18px] shrink-0 opacity-90";

function RecommendationTypeBadgeIcon({ type }: { type: RecommendationType }) {
  const c = recommendationTypeBadgeIconClass;
  switch (type) {
    case "Amplify":
      return <IconTrendUp className={c} />;
    case "Respond":
      return <IconChatBubbleLeftRight className={c} />;
    case "Amplify & Respond":
      return <IconAmplifyRespondMark className={c} />;
    case "Review Needed":
      return <IconShieldExclamation className={c} />;
    case "Link People":
      return <IconUsers className={c} />;
    case "Prioritize":
      return <IconFlag className={c} />;
    case "Add to Watchlist":
      return <IconBookmarkRibbon className={c} />;
    case "Convert to Content":
      return <IconDocumentText className={c} />;
    case "Fill Content Gap":
      return <IconLightBulb className={c} />;
    case "Next Action":
      return <IconPlayCircle className={c} />;
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      return <IconDocumentText className={c} />;
    }
  }
}

function titleGlyphCircleClass(rec: SignalRecommendation): string {
  const base =
    "flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-1 ring-[color:var(--border)]/40";
  if (rec.scoringExplanation?.signalArchetype === "award") {
    return `${base} bg-[#632a32] text-white ring-black/10 dark:bg-[#7a3a40] dark:ring-white/12`;
  }
  return `${base} bg-[color:var(--foreground)] text-[color:var(--background)]`;
}

const titleGlyphClass = "h-[22px] w-[22px] shrink-0";
/** Combined Amplify & Respond mark — hero circle (thinner SVG stroke + in-viewBox scale; size nudged up). */
const titleGlyphAmplifyRespondClass = "h-9 w-9 shrink-0";

function RecommendationTitleGlyph({ rec }: { rec: SignalRecommendation }) {
  const arch = rec.scoringExplanation?.signalArchetype;
  if (arch === "award") return <IconTrophy className={titleGlyphClass} />;
  if (rec.type === "Amplify & Respond") {
    return <IconAmplifyRespondMark className={titleGlyphAmplifyRespondClass} />;
  }
  if (rec.type === "Amplify") return <IconTrendUp className={titleGlyphClass} />;
  if (rec.type === "Respond") return <IconChatBubbleLeftRight className={titleGlyphClass} />;
  if (rec.type === "Review Needed") return <IconShieldExclamation className={titleGlyphClass} />;
  return <SparkIcon className={titleGlyphClass} />;
}

function IconPlusCircle({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" d="M12 8v8M8 12h8" />
    </svg>
  );
}

function formatFeedUpdatedLabel(ts: number | null): string {
  if (ts == null) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 50) return "Updated just now";
  if (s < 3600) return `Updated ${Math.floor(s / 60)}m ago`;
  return `Updated ${new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

/** Matches “Jump to post” / “Add signal” height for one toolbar row. Per-control hovers are applied at call sites. */
const companionToolbarBtnBase =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)]/95 text-[color:var(--foreground)] transition-[color,background-color,border-color,box-shadow,filter] disabled:cursor-not-allowed disabled:opacity-45";

const companionToolbarIconBtn = `${companionToolbarBtnBase} w-8`;

/** Outline text buttons in recommendation footer (Add signal, secondary actions). Add hover classes on each button. */
const companionFooterOutlineBtn =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--border)]/75 bg-[color:var(--background)]/95 px-3 text-xs font-semibold text-[color:var(--foreground)] transition-[color,background-color,border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-45";

function priorityPill(priority: SignalRecommendation["priority"]) {
  switch (priority) {
    case "high":
      return "bg-rose-500/16 text-rose-800 dark:text-rose-200";
    case "medium":
      return "bg-amber-500/14 text-amber-800 dark:text-amber-200";
    default:
      return "bg-[color:var(--muted)]/35 text-[color:var(--foreground)]/80";
  }
}

function priorityDisplayLabel(priority: SignalRecommendation["priority"]): string {
  switch (priority) {
    case "high":
      return "High priority";
    case "medium":
      return "Medium priority";
    default:
      return "Standard";
  }
}

const priorityBadgeIconClass = "h-[18px] w-[18px] shrink-0 opacity-90";

function PriorityBadgeIcon({ priority }: { priority: SignalRecommendation["priority"] }) {
  switch (priority) {
    case "high":
      return <IconFlame className={priorityBadgeIconClass} />;
    case "medium":
      return <IconSignal className={priorityBadgeIconClass} />;
    default:
      return <IconQueueList className={priorityBadgeIconClass} />;
  }
}

function confidenceLabel(conf: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, conf)) * 100);
  if (pct >= 85) return `Very high (${pct}%)`;
  if (pct >= 70) return `High (${pct}%)`;
  if (pct >= 55) return `Medium (${pct}%)`;
  return `Low (${pct}%)`;
}

function confidencePillDisplay(rec: SignalRecommendation): string {
  const internal = rec.scoringExplanation?.internalScore;
  if (internal != null && Number.isFinite(internal)) {
    const s = Math.round(Math.max(0, Math.min(100, internal)));
    return `${s}`;
  }
  const pct = Math.round(Math.max(0, Math.min(1, rec.confidence)) * 100);
  return `${pct}%`;
}

/** Hover copy for recommendation type pills (card header). */
function recommendationTypeBadgeTitle(t: RecommendationType): string {
  switch (t) {
    case "Amplify":
      return "Amplify — strong visibility moment: funding rounds, awards, deadlines, news-style reach, or standout traction worth boosting in-channel.";
    case "Respond":
      return "Respond — good moment for a short, substantive reply where you can add signal without flooding the thread.";
    case "Amplify & Respond":
      return "Amplify & respond — both a boost-worthy moment and a natural thread to join with a focused reply.";
    case "Review Needed":
      return "Review needed — check sourcing, tone, patient/outcome claims, or endorsement risk before wider amplification.";
    case "Link People":
      return "Link people — tie this post to investigators, trainees, or programs in your roster.";
    case "Prioritize":
      return "Prioritize — worth a closer look in your queue this week.";
    case "Add to Watchlist":
      return "Watchlist — keep tracking this account or topic for follow-up signals.";
    case "Convert to Content":
      return "Convert to content — turn this signal into a digest line, newsletter note, or outward-facing update.";
    case "Fill Content Gap":
      return "Content gap — touches a theme you care about that has been quiet in your feed.";
    case "Next Action":
      return "Next action — a concrete follow-up from your workflow.";
    default: {
      const _exhaustive: never = t;
      void _exhaustive;
      return String(t);
    }
  }
}

const amplifyMergedHeaderTooltip =
  "Amplify leg — visibility moment: awards, funding, deadlines, news-style reach, or traction worth boosting in-channel.";
const respondMergedHeaderTooltip =
  "Respond leg — timely thread or question where a short, substantive reply can add real signal.";

function priorityBadgeTitle(priority: SignalRecommendation["priority"]): string {
  switch (priority) {
    case "high":
      return "High priority — ranked first for this feed slice: strongest match to your goals, roster, and recent activity.";
    case "medium":
      return "Medium priority — still relevant; scan when you have bandwidth or widen the priority filter.";
    default:
      return "Standard priority — routine queue item. Use “All priorities” in the header to include medium and standard.";
  }
}

/** Tooltip: internal score is the rubric total; confidence label + listing weight when hybrid data exists. */
function confidencePillTitle(rec: SignalRecommendation): string {
  const confPct = Math.round(Math.max(0, Math.min(1, rec.confidence)) * 100);
  const internal = rec.scoringExplanation?.internalScore;
  const tier = rec.scoringExplanation?.category ?? rec.valueCategory;
  const tierNote = tier ? ` Suggested value band: ${tier}.` : "";
  const detailHint = rec.scoringExplanation ? " Open “Show details” below for rubric breakdown." : "";

  if (internal != null && Number.isFinite(internal)) {
    const s = Math.round(Math.max(0, Math.min(100, internal)));
    const confLabel = rec.scoringExplanation?.confidence;
    if (confLabel) {
      return `Internal score ${s} (rubric, 0–100). ${confLabel} Listing order blends this score with a ${confPct}% model-confidence weight.${tierNote}${detailHint}`;
    }
    return `Internal score ${s} (rubric, 0–100). ${confidenceLabel(rec.confidence)}.${tierNote}${detailHint}`;
  }
  return `${confidenceLabel(rec.confidence)}.${tierNote}${detailHint}`.replace(/\.\./g, ".").replace(/^\./, "");
}

function confidenceVisualStyles(label: ConfidenceLabel): { dot: string; text: string } {
  if (label === "High confidence") {
    return {
      dot: "bg-[color:color-mix(in_srgb,var(--accent-secondary)_42%,var(--background))] dark:bg-[color:color-mix(in_srgb,var(--accent-secondary)_36%,var(--muted))]",
      text: "text-[color:color-mix(in_srgb,var(--accent-secondary)_48%,var(--foreground))] dark:text-[color:color-mix(in_srgb,var(--accent-secondary)_58%,var(--foreground))]",
    };
  }
  if (label === "Medium confidence") {
    return { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-200" };
  }
  return { dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-200" };
}

function clampedInternalScore(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

function InternalScoreSegmentBar({ score }: { score: number }) {
  const s = clampedInternalScore(score);
  return (
    <div className="flex gap-0.5" role="img" aria-label={`${s} out of 100 on internal rubric`}>
      {Array.from({ length: 10 }, (_, i) => {
        const start = i * 10;
        const end = (i + 1) * 10;
        let fillPct = 0;
        if (s >= end) fillPct = 100;
        else if (s > start) fillPct = ((s - start) / 10) * 100;
        return (
          <div key={i} className="h-2 min-w-0 flex-1 overflow-hidden rounded-[2px] bg-[color:var(--muted)]/40">
            <div
              className="h-full rounded-[2px] bg-[color:color-mix(in_srgb,var(--accent-secondary)_38%,var(--background))] dark:bg-[color:color-mix(in_srgb,var(--accent-secondary)_30%,var(--card))]"
              style={{ width: `${fillPct}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

const SCORE_DRIVER_ROW_HOVER = {
  Community:
    "hover:bg-[color:color-mix(in_srgb,var(--accent-secondary)_12%,var(--background))] hover:border-[color:color-mix(in_srgb,var(--accent-secondary)_22%,var(--border))]",
  Signal: "hover:bg-violet-500/10 hover:border-violet-400/22",
  Action: "hover:bg-sky-500/10 hover:border-sky-400/25",
  Credibility: "hover:bg-blue-500/8 hover:border-blue-400/22",
  Timely: "hover:bg-cyan-500/9 hover:border-cyan-400/22",
  Risk: "hover:bg-rose-500/10 hover:border-rose-400/25",
} as const;

/** Larger chips in “Weights & modifiers” (internal score expand). */
const scoringModifierPillBase =
  "inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)]/65 bg-[color:var(--card)]/90 px-3 py-1.5 text-[11px] font-semibold tabular-nums tracking-tight text-[color:var(--foreground)]/90 shadow-sm transition-[background-color,border-color,box-shadow]";

type PanelMode = "embedded" | "overlay";

export function AICompanionPanel({
  mode = "embedded",
  title = "AI Companion",
  subtitle = "Personalized research actions surfaced from your feed and preferences.",
  posts,
  feedTab,
  investigatorDirectory,
  onPrimaryAction,
  onNavigateToFeedPost,
  onClose,
}: {
  mode?: PanelMode;
  title?: string;
  subtitle?: string;
  posts: SocialPost[] | null;
  /** Active Live listening tab — Investigators (`lists`) vs Mentions vs Others (`following`) shapes prioritization. */
  feedTab?: SocialFeedTab;
  /** Community investigator roster (handles + last names) for repost gating and authorship-weighted boosts. */
  investigatorDirectory?: InvestigatorSocialDirectory;
  onPrimaryAction?: (action: RecommendationAction, rec: SignalRecommendation) => void;
  /** Scroll Live listening to this post and highlight it (sidebar + mobile overlay). */
  onNavigateToFeedPost?: (postId: string) => void;
  onClose?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (menuOpenId == null) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      const root = document.querySelector(`[data-ai-companion-action-menu="${CSS.escape(menuOpenId)}"]`);
      if (root?.contains(target)) return;
      setMenuOpenId(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [menuOpenId]);

  const [statusById, setStatusById] = useState<Record<string, RecommendationStatus>>({});
  const [expandedRecId, setExpandedRecId] = useState<string | null>(null);
  const [whyScoredOpenId, setWhyScoredOpenId] = useState<string | null>(null);
  const [thumbVoteByRecId, setThumbVoteByRecId] = useState<Record<string, "up" | "down">>({});
  const [showAllPriorities, setShowAllPriorities] = useState(false);
  const [preferenceProfile, setPreferenceProfile] = useState<RecommendationPreferenceProfile>(() =>
    createDefaultRecommendationPreferenceProfile(),
  );
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [feedUpdatedAt, setFeedUpdatedAt] = useState<number | null>(null);
  const socialBookmarks = useSocialBookmarksOptional();
  const [watchlistLinkVerified, setWatchlistLinkVerified] = useState<Record<string, boolean> | undefined>(undefined);

  useEffect(() => {
    queueMicrotask(() => setPreferenceProfile(loadPreferenceProfile()));
  }, []);

  const postsRefreshKey = useMemo(
    () =>
      posts == null ? "null" : `${posts.length}:${posts[0]?.id ?? ""}:${posts[posts.length - 1]?.id ?? ""}`,
    [posts],
  );

  useEffect(() => {
    if (posts == null) {
      setFeedUpdatedAt(null);
      return;
    }
    setFeedUpdatedAt(Date.now());
  }, [postsRefreshKey]);

  const persistPreferenceProfile = useCallback((next: RecommendationPreferenceProfile) => {
    setPreferenceProfile(next);
    savePreferenceProfile(next);
  }, []);

  const recordArchetypeThumb = useCallback((rec: SignalRecommendation, useful: boolean) => {
    const arch = rec.scoringExplanation?.signalArchetype ?? "general";
    setThumbVoteByRecId((m) => ({ ...m, [rec.id]: useful ? "up" : "down" }));
    setPreferenceProfile((prev) => {
      const lf = { ...prev.learnedFeedback };
      if (useful) {
        lf.archetypeUsefulCounts = {
          ...lf.archetypeUsefulCounts,
          [arch]: (lf.archetypeUsefulCounts?.[arch] ?? 0) + 1,
        };
      } else {
        lf.archetypeNotUsefulCounts = {
          ...lf.archetypeNotUsefulCounts,
          [arch]: (lf.archetypeNotUsefulCounts?.[arch] ?? 0) + 1,
        };
      }
      const next = { ...prev, learnedFeedback: lf };
      savePreferenceProfile(next);
      return next;
    });
    if (useful) {
      toast.success("Thanks — we’ll favor suggestions like this over time.");
    } else {
      toast.message("Thanks — we’ll show fewer suggestions like this over time.");
    }
  }, []);

  const postById = useMemo(() => new Map((posts ?? []).map((p) => [p.id, p])), [posts]);

  useEffect(() => {
    if (!posts?.length) {
      queueMicrotask(() => setWatchlistLinkVerified(undefined));
      return;
    }
    if (!investigatorDirectory || !directoryHasPeopleRoster(investigatorDirectory)) {
      queueMicrotask(() => setWatchlistLinkVerified({}));
      return;
    }
    let cancelled = false;
    const payload = posts.map((p) => ({ id: p.id, text: p.text }));
    void (async () => {
      try {
        const res = await fetch("/api/social-signals/verify-watchlist-links", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ posts: payload }),
        });
        const data = (await res.json()) as { verified?: Record<string, boolean> };
        if (cancelled) return;
        setWatchlistLinkVerified(data.verified ?? {});
      } catch {
        if (!cancelled) setWatchlistLinkVerified({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [posts, investigatorDirectory]);

  const output: AICompanionOutput | null = useMemo(() => {
    if (!posts) return null;
    if (posts.length === 0) return { recommendations: [], themes: [], watchlist: [] };
    return generateSignalRecommendations(posts, {
      preferenceProfile,
      feedTab,
      investigatorDirectory,
      watchlistLinkVerified,
    });
  }, [posts, preferenceProfile, feedTab, investigatorDirectory, watchlistLinkVerified]);

  const recommendations = useMemo(() => {
    const base = output?.recommendations ?? [];
    const withStatus = base.map((r) => ({
      ...r,
      status: statusById[r.id] ?? r.status,
    }));
    return withStatus.filter((r) => r.status !== "dismissed" && r.status !== "completed");
  }, [output?.recommendations, statusById]);

  const visibleRecommendations = useMemo(() => {
    if (showAllPriorities) return recommendations;
    return recommendations.filter((r) => r.priority === "high");
  }, [recommendations, showAllPriorities]);

  const completed = useMemo(() => {
    const base = output?.recommendations ?? [];
    return base
      .map((r) => ({ ...r, status: statusById[r.id] ?? r.status }))
      .filter((r) => r.status === "completed")
      .slice(0, 6);
  }, [output?.recommendations, statusById]);

  useEffect(() => {
    if (mode !== "overlay") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, onClose]);

  const setStatus = useCallback((id: string, status: RecommendationStatus) => {
    setStatusById((m) => ({ ...m, [id]: status }));
  }, []);

  const doAction = useCallback(
    (action: RecommendationAction, rec: SignalRecommendation) => {
      if (action === "Save for Later") {
        setStatus(rec.id, "saved");
        toast.success("Saved");
        return;
      }
      if (action === "Ignore") {
        setStatus(rec.id, "dismissed");
        toast.message("Dismissed");
        return;
      }
      if (action === "Mark Complete") {
        setStatus(rec.id, "completed");
        toast.success("Completed");
        return;
      }
      if (action === "Mark High Priority") {
        toast.message("Marked high priority");
        return;
      }
      onPrimaryAction?.(action, rec);
      if (!onPrimaryAction) toast.message(`${action} (coming soon)`);
    },
    [onPrimaryAction, setStatus],
  );

  const openSignal = useCallback(
    (id: string) => {
      const p = postById.get(id);
      const url = p?.url;
      if (!url) {
        toast.message("Post not available (refresh feed)");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [postById],
  );

  const sharePost = useCallback(async (post: SocialPost) => {
    const url = post.url?.trim();
    if (!url) {
      toast.message("No link available for this post.");
      return;
    }
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          url,
          title: post.authorName?.trim() || post.authorHandle || "Post",
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch (e) {
      const err = e as { name?: string };
      if (err?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      } catch {
        toast.error("Could not share or copy link");
      }
    }
  }, []);

  const addPostToDigest = useCallback(async (post: SocialPost) => {
    try {
      const res = await fetch("/api/social-signals/add-to-digest", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        duplicate?: boolean;
        digestMonth?: string;
        digestMonthLabel?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Could not add to digest");
        return;
      }
      const label = data.digestMonthLabel ?? data.digestMonth ?? "digest";
      toast.success(data.duplicate ? `Already in ${label}` : `Added to ${label} digest`, {
        action:
          data.digestMonth != null && data.digestMonth.length > 0
            ? {
                label: "Open digest",
                onClick: () =>
                  window.open(`/digest/${data.digestMonth}`, "_blank", "noopener,noreferrer"),
              }
            : undefined,
      });
    } catch {
      toast.error("Network error");
    }
  }, []);

  const panelChrome =
    "min-w-0 rounded-2xl border border-[color:var(--border)]/75 bg-[color:var(--background)]/92 shadow-[var(--shadow-soft)]";

  const headerRight = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--border)]/70 bg-[color:var(--card)]/90 text-[color:var(--foreground)]/85 hover:bg-[color:var(--muted)]/18"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Expand AI Companion panel" : "Collapse AI Companion panel"}
        title={collapsed ? "Expand" : "Collapse"}
      >
        {collapsed ? <IconChevronDown className="h-[18px] w-[18px]" /> : <IconChevronUp className="h-[18px] w-[18px]" />}
      </button>
      {mode === "overlay" ? (
        <button
          type="button"
          className="rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--card)]/80 px-2.5 py-1 text-xs font-semibold text-[color:var(--foreground)]/85 hover:bg-[color:var(--muted)]/18"
          onClick={() => onClose?.()}
        >
          Close
        </button>
      ) : null}
    </div>
  );

  const body = (
    <div className={`${panelChrome} flex max-h-[min(86vh,58rem)] min-w-0 flex-col overflow-hidden`}>
      <div className="flex items-start justify-between gap-3 border-b border-[color:var(--border)]/60 px-4 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--muted)]/35 text-[color:var(--foreground)]">
              <SparkIcon />
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight text-[color:var(--foreground)]">{title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[color:var(--muted-foreground)]">{subtitle}</p>
            </div>
          </div>
        </div>
        {headerRight}
      </div>

      {collapsed ? (
        <div className="px-4 py-4 text-sm text-[color:var(--muted-foreground)]">
          {posts == null ? "AI Companion will begin scanning once signals load." : "Panel collapsed."}
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <section className="surface-card rounded-2xl px-3.5 py-3">
            <button
              type="button"
              className="flex w-full items-center gap-3 text-left"
              onClick={() => setPrefsOpen((o) => !o)}
              aria-expanded={prefsOpen}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--muted)]/45 text-[color:var(--foreground)]/90">
                <IconSliders className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[color:var(--foreground)]">Recommendation Preferences</p>
                <p className="mt-0.5 text-[11px] leading-snug text-[color:var(--muted-foreground)]">
                  Sources, signal types, priorities, and more
                </p>
              </div>
              <span className="shrink-0 text-[color:var(--muted-foreground)]" aria-hidden>
                {prefsOpen ? <IconChevronDown className="h-5 w-5" /> : <IconChevronRight className="h-5 w-5" />}
              </span>
            </button>
            {prefsOpen ? (
              <div className="mt-3 space-y-3 border-t border-[color:var(--border)]/50 pt-3">
                <p className="text-[11px] leading-snug text-[color:var(--muted-foreground)]">
                  Routine biomedical research language is not treated as sensitive by default. Review flags are reserved for
                  posts that may create reputational, privacy, endorsement, or scientific overstatement risk.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-[11px] font-medium text-[color:var(--foreground)]">
                    Review flag sensitivity
                    <select
                      className="mt-1 w-full rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)] px-2 py-1.5 text-xs"
                      value={preferenceProfile.reviewSensitivity}
                      onChange={(e) =>
                        persistPreferenceProfile({
                          ...preferenceProfile,
                          reviewSensitivity: e.target.value as RecommendationPreferenceProfile["reviewSensitivity"],
                        })
                      }
                    >
                      <option value="low">Low</option>
                      <option value="balanced">Balanced</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                  <label className="block text-[11px] font-medium text-[color:var(--foreground)]">
                    Amplification sensitivity
                    <select
                      className="mt-1 w-full rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)] px-2 py-1.5 text-xs"
                      value={preferenceProfile.amplifySensitivity}
                      onChange={(e) =>
                        persistPreferenceProfile({
                          ...preferenceProfile,
                          amplifySensitivity: e.target.value as RecommendationPreferenceProfile["amplifySensitivity"],
                        })
                      }
                    >
                      <option value="low">Low</option>
                      <option value="balanced">Balanced</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                  <label className="block text-[11px] font-medium text-[color:var(--foreground)]">
                    Response suggestion sensitivity
                    <select
                      className="mt-1 w-full rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)] px-2 py-1.5 text-xs"
                      value={preferenceProfile.respondSensitivity}
                      onChange={(e) =>
                        persistPreferenceProfile({
                          ...preferenceProfile,
                          respondSensitivity: e.target.value as RecommendationPreferenceProfile["respondSensitivity"],
                        })
                      }
                    >
                      <option value="low">Low</option>
                      <option value="balanced">Balanced</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                  <label className="block text-[11px] font-medium text-[color:var(--foreground)]">
                    Content conversion sensitivity
                    <select
                      className="mt-1 w-full rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)] px-2 py-1.5 text-xs"
                      value={preferenceProfile.contentConversionSensitivity}
                      onChange={(e) =>
                        persistPreferenceProfile({
                          ...preferenceProfile,
                          contentConversionSensitivity: e.target.value as RecommendationPreferenceProfile["contentConversionSensitivity"],
                        })
                      }
                    >
                      <option value="low">Low</option>
                      <option value="balanced">Balanced</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                </div>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[color:var(--border)]/55 bg-[color:var(--muted)]/10 px-3 py-2.5 text-[11px] text-[color:var(--foreground)]">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-[color:var(--border)]"
                    checked={preferenceProfile.prioritizeUcsfInvestigators}
                    onChange={(e) =>
                      persistPreferenceProfile({
                        ...preferenceProfile,
                        prioritizeUcsfInvestigators: e.target.checked,
                      })
                    }
                  />
                  <span>
                    <span className="font-medium">Prioritize UCSF-affiliated signals</span>
                    <span className="mt-0.5 block text-[10px] leading-snug text-[color:var(--muted-foreground)]">
                      When your investigator roster is loaded, stronger boosts apply when the poster matches tracked X/Bluesky
                      handles, or when copy ties a roster member to corresponding/co-corresponding authorship (plus UCSF cues).
                      Otherwise UCSF keywords receive a light nudge only.
                    </span>
                  </span>
                </label>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                  Review Needed flags
                </p>
                <div className="grid gap-2">
                  {(
                    [
                      ["inflammatoryClaimsAreSensitive", "Flag inflammatory language"],
                      ["controversialClaimsAreSensitive", "Flag controversial framing"],
                      ["unsupportedEfficacyClaimsAreSensitive", "Flag unsupported therapeutic claims"],
                      ["privacyConcernsAreSensitive", "Flag possible patient privacy issues"],
                      ["institutionalEndorsementRiskIsSensitive", "Flag institutional endorsement risks"],
                      ["medicalAdviceDirectedAtPatientsAreSensitive", "Flag clinical advice directed at patients"],
                      ["clinicalMentionsAreSensitive", "Flag routine clinical outcomes language (+5 when on)"],
                      ["patientMentionsAreSensitive", "Flag routine patient mentions (+5 when on)"],
                      ["therapeuticImplicationsAreSensitive", "Flag routine therapeutic implications (+5 when on)"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-start gap-2 text-[11px] text-[color:var(--foreground)]">
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-[color:var(--border)]"
                        checked={preferenceProfile.reviewNeededRules[key]}
                        onChange={(e) =>
                          persistPreferenceProfile({
                            ...preferenceProfile,
                            reviewNeededRules: {
                              ...preferenceProfile.reviewNeededRules,
                              [key]: e.target.checked,
                            },
                          })
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-[color:var(--muted-foreground)]">
                  Routine biomedical research language is not treated as sensitive by default. Review flags are reserved for posts
                  that may create reputational, privacy, endorsement, or scientific overstatement risk. Turn on the bottom three
                  only if you want patient/outcome/therapeutic keywords to add weight toward Review Needed.
                </p>
              </div>
            ) : null}
          </section>

          <section>
            <div className="flex flex-wrap items-start justify-between gap-3 gap-y-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--foreground)]/90">
                  Today’s recommended actions
                </p>
                <p className="mt-1 max-w-xl text-xs leading-snug text-[color:var(--muted-foreground)]">
                  High-impact opportunities tailored to your research goals and recent activity.{" "}
                  <span className="text-[color:var(--foreground)]/70">Only high-priority cards are listed by default.</span>{" "}
                  Use <span className="font-semibold">All priorities</span> to include medium and low.
                </p>
              </div>
              {posts != null ? (
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {recommendations.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllPriorities((v) => !v)}
                      className="inline-flex items-center rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)]/90 px-2.5 py-1 text-[11px] font-semibold text-[color:var(--foreground)]/90 transition-colors hover:bg-[color:var(--muted)]/18"
                      aria-pressed={showAllPriorities}
                    >
                      {showAllPriorities ? "High priority only" : "All priorities"}
                    </button>
                  ) : null}
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-[color:var(--muted-foreground)]">
                    <IconClock className="h-3.5 w-3.5 shrink-0 opacity-80" />
                    <span>{formatFeedUpdatedLabel(feedUpdatedAt)}</span>
                  </div>
                </div>
              ) : null}
            </div>

            {posts == null ? (
              <div className="mt-3 rounded-xl border border-dashed border-[color:var(--border)]/75 bg-[color:var(--card)]/60 px-4 py-6 text-sm text-[color:var(--muted-foreground)]">
                AI Companion will begin scanning once signals load.
              </div>
            ) : recommendations.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-[color:var(--border)]/75 bg-[color:var(--card)]/60 px-4 py-6 text-sm text-[color:var(--muted-foreground)]">
                Nothing to highlight from this feed slice yet. When new signals arrive, we’ll suggest amplify moments, replies,
                and review flags when there’s a meaningful risk signal.
              </div>
            ) : visibleRecommendations.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-[color:var(--border)]/75 bg-[color:var(--card)]/60 px-4 py-6 text-sm text-[color:var(--muted-foreground)]">
                <p>No high-priority recommendations in this slice right now.</p>
                <button
                  type="button"
                  onClick={() => setShowAllPriorities(true)}
                  className="mt-3 inline-flex items-center rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)]/90 px-3 py-1.5 text-xs font-semibold text-[color:var(--foreground)]/90 transition-colors hover:bg-[color:var(--muted)]/18"
                >
                  Show all priorities
                </button>
              </div>
            ) : (
              <ul className="mt-4 space-y-4">
                {visibleRecommendations.map((rec) => (
                  <li key={rec.id} className="surface-card min-w-0 rounded-2xl p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        {rec.type === "Amplify & Respond" ? (
                          <>
                            <span
                              title={amplifyMergedHeaderTooltip}
                              className={`inline-flex cursor-help items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${companionTypeBadgeStyle("Amplify").bg} ${companionTypeBadgeStyle("Amplify").fg}`}
                            >
                              <IconTrendUp className={recommendationTypeBadgeIconClass} />
                              Amplify
                            </span>
                            <span
                              title={respondMergedHeaderTooltip}
                              className={`inline-flex cursor-help items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${companionTypeBadgeStyle("Respond").bg} ${companionTypeBadgeStyle("Respond").fg}`}
                            >
                              <IconChatBubbleLeftRight className={recommendationTypeBadgeIconClass} />
                              Respond
                            </span>
                          </>
                        ) : (
                          (() => {
                            const s = companionTypeBadgeStyle(rec.type);
                            return (
                              <span
                                title={recommendationTypeBadgeTitle(rec.type)}
                                className={`inline-flex cursor-help items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.bg} ${s.fg}`}
                              >
                                <RecommendationTypeBadgeIcon type={rec.type} />
                                {rec.type}
                              </span>
                            );
                          })()
                        )}
                        <span
                          title={priorityBadgeTitle(rec.priority)}
                          className={`inline-flex cursor-help items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${priorityPill(rec.priority)}`}
                        >
                          <PriorityBadgeIcon priority={rec.priority} />
                          {priorityDisplayLabel(rec.priority)}
                        </span>
                        <span
                          className="inline-flex cursor-help items-center gap-1.5 rounded-full border border-[color:var(--border)]/55 bg-[color:var(--muted)]/35 px-2.5 py-1 text-[11px] font-semibold text-[color:var(--foreground)]/85"
                          title={confidencePillTitle(rec)}
                        >
                          <IconBarChart className="h-[18px] w-[18px] shrink-0 opacity-80" />
                          {confidencePillDisplay(rec)}
                        </span>
                      </div>
                      <div className="relative shrink-0" data-ai-companion-action-menu={rec.id}>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--border)]/70 bg-[color:var(--background)]/90 text-[color:var(--muted-foreground)] hover:bg-[color:var(--muted)]/18 hover:text-[color:var(--foreground)]"
                          aria-label="More actions"
                          onClick={() => setMenuOpenId((cur) => (cur === rec.id ? null : rec.id))}
                        >
                          <MoreIcon />
                        </button>

                        {menuOpenId === rec.id ? (
                          <div className="absolute right-0 top-10 z-20 w-44 overflow-hidden rounded-xl border border-[color:var(--border)]/70 bg-[color:var(--background)] shadow-[0_18px_48px_-30px_rgba(0,0,0,0.55)]">
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-xs font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--muted)]/25"
                              onClick={() => {
                                setMenuOpenId(null);
                                doAction("Mark Complete", rec);
                              }}
                            >
                              Mark Complete
                            </button>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-xs font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--muted)]/25"
                              onClick={() => {
                                setMenuOpenId(null);
                                setStatus(rec.id, "saved");
                                toast.success("Saved");
                              }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-xs font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--muted)]/25"
                              onClick={() => {
                                setMenuOpenId(null);
                                setStatus(rec.id, "dismissed");
                                toast.message("Dismissed");
                              }}
                            >
                              Dismiss
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 flex gap-3">
                      <div className={titleGlyphCircleClass(rec)} aria-hidden>
                        <RecommendationTitleGlyph rec={rec} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold leading-snug text-[color:var(--foreground)]">{rec.title}</p>
                        {(rec.whyItMatters ?? rec.rationale).trim() ? (
                          <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--muted-foreground)]">
                            {rec.whyItMatters ?? rec.rationale}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {/* Source post — inset panel so it reads as the live post, not card chrome */}
                    <div className="mt-4 rounded-xl border border-[color:var(--border)]/65 bg-[color:var(--muted)]/32 p-3.5 shadow-[0_1px_0_rgba(0,0,0,0.03),0_4px_14px_-6px_rgba(0,0,0,0.12)] dark:bg-[color:var(--muted)]/22 dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_6px_20px_-10px_rgba(0,0,0,0.55)]">
                      {rec.signalIds.length === 1 ? (
                        (() => {
                          const p = postById.get(rec.signalIds[0]!);
                          const postedAge = p?.postedAt ? formatRelativePostAge(p.postedAt) : "";
                          return (
                            <div className="flex min-w-0 gap-3">
                              {p?.authorAvatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={p.authorAvatarUrl}
                                  alt=""
                                  className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-[color:var(--border)]/60"
                                />
                              ) : (
                                <div
                                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--muted)]/55 text-[11px] font-bold text-[color:var(--muted-foreground)] ring-1 ring-[color:var(--border)]/50"
                                  aria-hidden
                                >
                                  {(p?.authorName ?? p?.authorHandle ?? "?").slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                    <span className="truncate text-xs font-semibold text-[color:var(--foreground)]">
                                      {p?.authorName ?? "Unknown"}
                                    </span>
                                    {p?.authorHandle ? (
                                      <span className="truncate text-xs text-[color:var(--muted-foreground)]">{p.authorHandle}</span>
                                    ) : null}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    {p?.platform ? <PlatformBadge platform={p.platform} size="xs" /> : null}
                                    {postedAge ? (
                                      <span className="text-[11px] font-medium tabular-nums text-[color:var(--muted-foreground)]">
                                        {postedAge}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
                                  {oneLineSnippet(p?.text ?? "", 280)}
                                </p>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-[color:var(--foreground)]">
                              Refers to {rec.signalIds.length} signals
                            </p>
                            <button
                              type="button"
                              className="text-xs font-semibold text-[color:var(--foreground)]/75 underline-offset-2 hover:underline"
                              onClick={() => setExpandedRecId((cur) => (cur === rec.id ? null : rec.id))}
                            >
                              {expandedRecId === rec.id ? "Hide" : "View"}
                            </button>
                          </div>
                          {expandedRecId === rec.id ? (
                            <ul className="mt-2 space-y-2">
                              {rec.signalIds.slice(0, 5).map((sid) => {
                                const p = postById.get(sid);
                                return (
                                  <li key={sid} className="min-w-0 rounded-lg bg-[color:var(--muted)]/18 px-2 py-1.5">
                                    <div className="flex min-w-0 items-center gap-2">
                                      {p?.platform ? <PlatformBadge platform={p.platform} size="xs" /> : null}
                                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[color:var(--foreground)]">
                                        {p?.authorHandle ?? p?.authorName ?? sid}
                                      </span>
                                      <button
                                        type="button"
                                        title="Open in new tab"
                                        aria-label="Open in new tab"
                                        disabled={!p?.url}
                                        onClick={() => openSignal(sid)}
                                        className={`${companionToolbarIconBtn} enabled:hover:border-violet-500/45 enabled:hover:bg-violet-500/12 dark:enabled:hover:bg-violet-400/14`}
                                      >
                                        <IconOpenExternal className="h-4 w-4" />
                                      </button>
                                    </div>
                                    <p className="mt-1 line-clamp-2 text-xs text-[color:var(--muted-foreground)]">
                                      {oneLineSnippet(p?.text ?? "", 140)}
                                    </p>
                                  </li>
                                );
                              })}
                              {rec.signalIds.length > 5 ? (
                                <li className="text-[11px] text-[color:var(--muted-foreground)]">
                                  +{rec.signalIds.length - 5} more…
                                </li>
                              ) : null}
                            </ul>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {rec.scoringExplanation?.riskReasons?.length ? (
                      <div className="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-2 text-[11px] font-medium leading-snug text-amber-950 dark:text-amber-100">
                        <span className="font-semibold">Risk / uncertainty: </span>
                        {rec.scoringExplanation.riskReasons[0]}
                      </div>
                    ) : null}

                    {rec.scoringExplanation ? (
                      <div
                        className={
                          rec.scoringExplanation.riskReasons?.length ? "mt-2" : "mt-4"
                        }
                      >
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-[color:var(--foreground)]/75 underline-offset-2 hover:text-[color:var(--foreground)] hover:underline"
                          onClick={() => setWhyScoredOpenId((cur) => (cur === rec.id ? null : rec.id))}
                          aria-expanded={whyScoredOpenId === rec.id}
                        >
                          {whyScoredOpenId === rec.id ? "Hide details" : "Show details"}
                        </button>
                        {whyScoredOpenId === rec.id ? (
                          <div className="mt-2 overflow-hidden rounded-xl border border-[color:var(--border)]/55 bg-[color:var(--card)]/70 text-[color:var(--foreground)] shadow-sm dark:bg-[color:var(--card)]/40">
                            {(() => {
                              const se = rec.scoringExplanation!;
                              const conf = confidenceVisualStyles(se.confidence);
                              const internalRounded = clampedInternalScore(se.internalScore);
                              const driverRows = [
                                {
                                  key: "Community" as const,
                                  label: "Community",
                                  value: se.deterministicScore.communityRelevance,
                                  max: 40,
                                  Icon: IconUsers,
                                },
                                {
                                  key: "Signal" as const,
                                  label: "Signal",
                                  value: se.deterministicScore.signalImportance,
                                  max: 30,
                                  Icon: IconSignal,
                                },
                                {
                                  key: "Action" as const,
                                  label: "Action",
                                  value: se.deterministicScore.actionability,
                                  max: 10,
                                  Icon: IconBolt,
                                },
                                {
                                  key: "Credibility" as const,
                                  label: "Credibility",
                                  value: se.deterministicScore.credibilityCompleteness,
                                  max: 10,
                                  Icon: IconShieldOutline,
                                },
                                {
                                  key: "Timely" as const,
                                  label: "Timely",
                                  value: se.deterministicScore.timelinessNovelty,
                                  max: 10,
                                  Icon: IconClock,
                                },
                                {
                                  key: "Risk" as const,
                                  label: "Risk",
                                  value: se.deterministicScore.riskPenalty,
                                  max: 30,
                                  Icon: IconShieldExclamation,
                                },
                              ];
                              const rw = se.rubricWeightsUsed;
                              const weightPills = [
                                { abbr: "CR", pct: rw.communityRelevance, Icon: IconBarChart },
                                { abbr: "SI", pct: rw.signalImportance, Icon: IconSignal },
                                { abbr: "Act", pct: rw.actionability, Icon: IconBolt },
                                { abbr: "Cred", pct: rw.credibilityCompleteness, Icon: IconShieldOutline },
                                { abbr: "Time", pct: rw.timelinessNovelty, Icon: IconClock },
                              ] as const;
                              return (
                                <>
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border)]/50 bg-[color:var(--muted)]/12 px-2.5 py-2 sm:px-3">
                                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
                                      Internal score
                                    </p>
                                    <button
                                      type="button"
                                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--foreground)]/80 transition-colors hover:bg-[color:var(--muted)]/25 hover:text-[color:var(--foreground)]"
                                      onClick={() => setWhyScoredOpenId(null)}
                                      aria-label="Hide scoring details"
                                    >
                                      Hide
                                      <IconChevronUp className="h-3.5 w-3.5 opacity-80" />
                                    </button>
                                  </div>

                                  <div className="px-2.5 pt-3 sm:px-3">
                                    <div className="flex flex-wrap items-end gap-3">
                                      <span className="text-3xl font-bold tabular-nums tracking-tight text-[color:color-mix(in_srgb,var(--accent-secondary)_50%,var(--foreground))] dark:text-[color:color-mix(in_srgb,var(--accent-secondary)_52%,var(--foreground))] sm:text-[2rem] leading-none">
                                        {internalRounded}
                                      </span>
                                      <div
                                        className="hidden h-9 w-px shrink-0 bg-[color:var(--border)]/70 sm:block"
                                        aria-hidden
                                      />
                                      <div className="flex min-w-0 items-center gap-2 pb-0.5">
                                        <span className={`h-2 w-2 shrink-0 rounded-full ${conf.dot}`} aria-hidden />
                                        <span className={`text-[11px] font-semibold leading-tight ${conf.text}`}>
                                          {se.confidence}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="mt-2.5">
                                      <InternalScoreSegmentBar score={se.internalScore} />
                                    </div>
                                  </div>

                                  {se.scoringNarrative?.trim() ? (
                                    <div className="mx-2.5 mt-3 flex gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.09] px-2.5 py-2 dark:bg-amber-500/10 sm:mx-3">
                                      <div
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/25 text-amber-800 dark:text-amber-100"
                                        aria-hidden
                                      >
                                        <IconLightBulb className="h-4 w-4" />
                                      </div>
                                      <p className="min-w-0 text-[11px] leading-snug text-[color:var(--foreground)]/90">
                                        {se.scoringNarrative.trim()}
                                      </p>
                                    </div>
                                  ) : null}

                                  <div className="grid grid-cols-1 gap-3 px-2.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-3 sm:gap-x-4">
                                    <div className="min-w-0">
                                      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
                                        Score drivers
                                      </p>
                                      <ul className="mt-2 space-y-2">
                                        {driverRows.map(({ key, label, value, max, Icon }) => {
                                          const isRisk = key === "Risk";
                                          const barPct = isRisk
                                            ? Math.min(
                                                100,
                                                Math.max(0, (-Math.min(0, value) / Math.max(1e-6, max)) * 100),
                                              )
                                            : Math.min(100, Math.max(0, (value / Math.max(1e-6, max)) * 100));
                                          const barFill =
                                            isRisk && value < 0
                                              ? "bg-[color:color-mix(in_srgb,#fb7185_34%,var(--background))] dark:bg-[color:color-mix(in_srgb,#fb7185_26%,var(--card))]"
                                              : isRisk
                                                ? "bg-[color:var(--muted)]/45"
                                                : "bg-[color:color-mix(in_srgb,var(--accent-secondary)_36%,var(--background))] dark:bg-[color:color-mix(in_srgb,var(--accent-secondary)_28%,var(--card))]";
                                          const rowHover = SCORE_DRIVER_ROW_HOVER[key];
                                          return (
                                            <li
                                              key={key}
                                              className={`group flex items-center gap-2 rounded-lg border border-transparent px-1.5 py-1 transition-[background-color,border-color] ${rowHover}`}
                                            >
                                              <Icon className="h-4 w-4 shrink-0 text-[color:var(--foreground)]/70 group-hover:text-[color:var(--foreground)]/90" />
                                              <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2 text-[10px]">
                                                  <span className="font-semibold text-[color:var(--foreground)]/85">
                                                    {label}
                                                  </span>
                                                  <span className="shrink-0 tabular-nums font-semibold text-[color:var(--foreground)]">
                                                    {value}
                                                  </span>
                                                </div>
                                                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[color:var(--muted)]/40">
                                                  <div
                                                    className={`h-full rounded-full transition-[width] ${barFill}`}
                                                    style={{ width: `${barPct}%` }}
                                                  />
                                                </div>
                                              </div>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    </div>

                                    <div className="flex flex-col gap-2 sm:items-end">
                                      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)] sm:text-right">
                                        Weights &amp; modifiers
                                      </p>
                                      <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
                                        <span
                                          className={`${scoringModifierPillBase} hover:border-[color:color-mix(in_srgb,var(--accent-secondary)_28%,var(--border))] hover:bg-[color:color-mix(in_srgb,var(--accent-secondary)_14%,var(--background))] dark:hover:bg-[color:color-mix(in_srgb,var(--accent-secondary)_12%,var(--card))]`}
                                        >
                                          <IconUsers className="h-4 w-4 shrink-0 opacity-85" aria-hidden />
                                          Ref {se.referenceOrgModifier >= 0 ? "+" : ""}
                                          {se.referenceOrgModifier}
                                        </span>
                                        <span
                                          className={`${scoringModifierPillBase} hover:border-violet-400/28 hover:bg-violet-500/10 dark:hover:bg-violet-400/10`}
                                        >
                                          <IconBookmarkRibbon className="h-4 w-4 shrink-0 opacity-85" aria-hidden />
                                          Learn {se.communityLearningModifier >= 0 ? "+" : ""}
                                          {se.communityLearningModifier}
                                        </span>
                                        {weightPills.map(({ abbr, pct, Icon }) => (
                                          <span
                                            key={abbr}
                                            className={`${scoringModifierPillBase} hover:bg-[color:var(--muted)]/35 hover:border-[color:var(--foreground)]/14`}
                                          >
                                            <Icon className="h-4 w-4 shrink-0 opacity-85" aria-hidden />
                                            {abbr} {(pct * 100).toFixed(0)}%
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  {se.hardCapsApplied.length ? (
                                    <div className="border-t border-[color:var(--border)]/45 px-2.5 py-2 sm:px-3">
                                      <p className="line-clamp-2 border-l-2 border-amber-500/55 pl-2 text-[9px] leading-tight text-amber-950 dark:text-amber-100">
                                        {se.hardCapsApplied.join(" · ")}
                                      </p>
                                    </div>
                                  ) : null}
                                </>
                              );
                            })()}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-[color:var(--border)]/55 pt-3">
                      {(() => {
                          const pid = rec.signalIds[0];
                          const srcPost = pid ? postById.get(pid) : undefined;
                          const bookmarked = pid ? socialBookmarks?.isBookmarked(pid) : false;
                          const secondaryActions = rec.suggestedActions
                            .filter((a) => a !== "Add to Digest" && a !== "Save for Later" && a !== "Mark Complete")
                            .slice(0, 4);
                          return (
                            <>
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  title="Useful suggestion"
                                  aria-label="Mark this suggestion as useful"
                                  aria-pressed={thumbVoteByRecId[rec.id] === "up"}
                                  className={`${companionToolbarIconBtn} enabled:hover:border-emerald-500/45 enabled:hover:bg-emerald-500/14 enabled:hover:text-emerald-700 dark:enabled:hover:text-emerald-300 ${thumbVoteByRecId[rec.id] === "up" ? "text-emerald-600 dark:text-emerald-400" : ""}`}
                                  onClick={() => recordArchetypeThumb(rec, true)}
                                >
                                  <IconHandThumbUp className="h-[18px] w-[18px]" />
                                </button>
                                <button
                                  type="button"
                                  title="Not useful"
                                  aria-label="Mark this suggestion as not useful"
                                  aria-pressed={thumbVoteByRecId[rec.id] === "down"}
                                  className={`${companionToolbarIconBtn} enabled:hover:border-rose-500/45 enabled:hover:bg-rose-500/14 enabled:hover:text-rose-700 dark:enabled:hover:text-rose-300 ${thumbVoteByRecId[rec.id] === "down" ? "text-rose-600 dark:text-rose-400" : ""}`}
                                  onClick={() => recordArchetypeThumb(rec, false)}
                                >
                                  <IconHandThumbDown className="h-[18px] w-[18px]" />
                                </button>
                                <button
                                  type="button"
                                  disabled={!srcPost || !onNavigateToFeedPost}
                                  aria-label="Open this post in the live feed"
                                  className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[color:var(--foreground)] px-3.5 text-xs font-semibold text-[color:var(--background)] transition-[filter,opacity,box-shadow] enabled:hover:brightness-110 enabled:hover:shadow-md enabled:hover:shadow-neutral-900/15 dark:enabled:hover:shadow-black/40 disabled:cursor-not-allowed disabled:opacity-45"
                                  onClick={() => {
                                    if (!srcPost || !onNavigateToFeedPost) {
                                      toast.message("Opening this post in the feed isn’t available.");
                                      return;
                                    }
                                    onNavigateToFeedPost(srcPost.id);
                                  }}
                                >
                                  <IconTrendUp className="h-4 w-4 shrink-0 opacity-95" aria-hidden />
                                  Amplify
                                </button>
                                <button
                                  type="button"
                                  disabled={!srcPost}
                                  className={`${companionFooterOutlineBtn} gap-1.5 enabled:hover:border-sky-500/45 enabled:hover:bg-sky-500/12 dark:enabled:hover:bg-sky-400/14`}
                                  onClick={() => {
                                    if (!srcPost) return;
                                    void addPostToDigest(srcPost);
                                  }}
                                >
                                  <IconPlusCircle className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                                  Add signal
                                </button>
                                {secondaryActions.map((a) => (
                                  <button
                                    key={`${rec.id}-footer-${a}`}
                                    type="button"
                                    onClick={() => doAction(a, rec)}
                                    className={`${companionFooterOutlineBtn} enabled:hover:border-[color:var(--foreground)]/22 enabled:hover:bg-[color:var(--muted)]/32`}
                                  >
                                    {a}
                                  </button>
                                ))}
                              </div>
                              <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
                                <button
                                  type="button"
                                  disabled={!srcPost || !socialBookmarks}
                                  title={bookmarked ? "Remove bookmark" : "Bookmark"}
                                  aria-label={bookmarked ? "Remove bookmark" : "Bookmark"}
                                  className={`${companionToolbarIconBtn} enabled:hover:border-amber-500/45 enabled:hover:bg-amber-500/14 dark:enabled:hover:bg-amber-400/14 ${bookmarked ? "text-[color:var(--accent)]" : ""}`}
                                  onClick={() => {
                                    if (!srcPost) return;
                                    if (!socialBookmarks) {
                                      toast.message("Bookmarks aren’t available here.");
                                      return;
                                    }
                                    void socialBookmarks.toggleBookmark(srcPost);
                                  }}
                                >
                                  <IconBookmark filled={bookmarked} className="h-[18px] w-[18px]" />
                                </button>
                                <button
                                  type="button"
                                  disabled={!srcPost?.url}
                                  title="Share"
                                  aria-label="Share"
                                  className={`${companionToolbarIconBtn} enabled:hover:border-[color:var(--accent)]/50 enabled:hover:bg-[color:var(--accent)]/14 enabled:hover:text-[color:var(--accent)]`}
                                  onClick={() => {
                                    if (!srcPost) return;
                                    void sharePost(srcPost);
                                  }}
                                >
                                  <IconShare className="h-[18px] w-[18px]" />
                                </button>
                                <button
                                  type="button"
                                  disabled={!srcPost?.url}
                                  title="Open in new tab"
                                  aria-label="Open in new tab"
                                  className={`${companionToolbarIconBtn} enabled:hover:border-violet-500/45 enabled:hover:bg-violet-500/12 dark:enabled:hover:bg-violet-400/14`}
                                  onClick={() => {
                                    if (!pid) return;
                                    openSignal(pid);
                                  }}
                                >
                                  <IconOpenExternal className="h-[18px] w-[18px]" />
                                </button>
                              </div>
                            </>
                          );
                        })()}
                    </div>

                    {rec.linkedPeople.length || rec.linkedPrograms.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {rec.linkedPeople.slice(0, 4).map((p) => (
                          <span
                            key={`${rec.id}-p-${p.label}`}
                            className="inline-flex items-center rounded-full border border-[color:var(--border)]/65 bg-[color:var(--background)]/85 px-2 py-0.5 text-[11px] font-semibold text-[color:var(--foreground)]/80"
                          >
                            {p.label}
                          </span>
                        ))}
                        {rec.linkedPrograms.slice(0, 3).map((p) => (
                          <span
                            key={`${rec.id}-pr-${p.label}`}
                            className="inline-flex items-center rounded-full border border-[color:var(--border)]/65 bg-[color:var(--background)]/85 px-2 py-0.5 text-[11px] font-semibold text-[color:var(--foreground)]/80"
                          >
                            {p.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {completed.length ? (
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
                Completed
              </p>
              <ul className="mt-2 space-y-2">
                {completed.map((r) => (
                  <li key={r.id} className="rounded-xl border border-[color:var(--border)]/55 bg-[color:var(--muted)]/18 px-3 py-2">
                    <p className="truncate text-xs font-semibold text-[color:var(--foreground)]/85">{r.title}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="text-[10px] leading-snug text-[color:var(--muted-foreground)]">
            {feedTab === "lists"
              ? "Investigator-list posts are prioritized; amplification suggestions favor publications and strong engagement from that cohort."
              : feedTab === "mentions"
                ? "Mentions are treated as high-intent alongside investigator priorities."
                : feedTab === "following"
                  ? "Accounts you follow use a higher bar: Amplify and Respond emphasize funding, deadlines, awards, news-style moments, or standout reach."
                  : ""}
          </p>
        </div>
      )}
    </div>
  );

  if (mode === "embedded") return body;

  // Overlay mode: mobile bottom sheet + tablet drawer
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 backdrop-blur-[2px] sm:items-stretch sm:justify-end sm:p-4"
      role="dialog"
      aria-modal
      aria-label="AI Companion"
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close AI Companion" onClick={onClose} />
      <div className="relative z-[1] w-full sm:w-[min(26rem,92vw)]">{body}</div>
    </div>
  );
}

