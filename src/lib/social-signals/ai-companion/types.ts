import type { SocialPlatform } from "@/lib/social-signals/types";
import type { ScoringExplanation } from "./scoring-explanation-types";

export type RecommendationType =
  | "Amplify"
  | "Respond"
  | "Amplify & Respond"
  | "Convert to Content"
  | "Link People"
  | "Prioritize"
  | "Review Needed"
  | "Add to Watchlist"
  | "Fill Content Gap"
  | "Next Action";

export type RecommendationPriority = "high" | "medium" | "low";

export type RecommendationStatus = "new" | "saved" | "dismissed" | "completed";

export type RecommendationAction =
  | "Add to Digest"
  | "Link Investigator"
  | "Confirm Links"
  | "Create Theme Summary"
  | "Add to Watchlist"
  | "Send for Review"
  | "Mark High Priority"
  | "Save for Later"
  | "Ignore"
  | "Mark Complete";

export type SignalRecommendation = {
  id: string;
  type: RecommendationType;
  priority: RecommendationPriority;
  confidence: number; // 0..1
  /** Hybrid rubric: user-facing value tier (not raw points). */
  valueCategory?: ScoringExplanation["category"];
  /** Editorial confidence label from hybrid scorer. */
  confidenceLabel?: ScoringExplanation["confidence"];
  /** Structured scoring for UI and learning. */
  scoringExplanation?: ScoringExplanation;
  title: string;
  rationale: string;
  /** Editorial “why it matters” for Amplify / Respond / merged cards (preferred over raw rationale in UI). */
  whyItMatters?: string;
  /** Editorial next action for the next-step callout (preferred over hybrid suggestedAction when set). */
  nextStepEditorial?: string;
  /** Calibration: why Review Needed fired (for feedback learning). */
  triggerReasonCodes?: string[];
  /** Raw review score before thresholds (Review Needed only). */
  reviewScore?: number;
  signalIds: string[];
  /** Optional: show which platforms contributed. */
  platforms?: SocialPlatform[];
  /** Optional: show source handles that triggered the rec. */
  sourceHandles?: string[];
  linkedPeople: { label: string; kind: "investigator" | "trainee" | "member" | "unknown" }[];
  linkedPrograms: { label: string }[];
  suggestedActions: RecommendationAction[];
  createdAt: string;
  status: RecommendationStatus;
};

export type ThemeCluster = {
  id: string;
  label: string;
  signalIds: string[];
  count: number;
  topPeople: string[];
  suggestedActions: ReadonlyArray<Extract<RecommendationAction, "Create Theme Summary" | "Add to Digest">>;
};

export type WatchlistSuggestion = {
  id: string;
  handle: string;
  displayName?: string;
  platform?: SocialPlatform;
  reason: string;
  confidence: number; // 0..1
  signalIds: string[];
};

export type AICompanionOutput = {
  recommendations: SignalRecommendation[];
  themes: ThemeCluster[];
  watchlist: WatchlistSuggestion[];
};

