import type { RecommendationType } from "./types";

export type RecommendationSensitivity = "low" | "balanced" | "high";

/** Reason codes used for scoring muting and rationale. */
export type ReviewReasonCode =
  | "patient_identifiable"
  | "medical_advice_public"
  | "unsupported_efficacy_or_cure"
  | "inflammatory_language"
  | "controversial_or_political_framing"
  | "institutional_endorsement_risk"
  | "reputational_risk_named"
  | "unpublished_or_confidential"
  | "overgeneralized_clinical_claim"
  | "privacy_concern_general"
  | "misinformation_or_conspiracy"
  | "routine_patient_mention"
  | "routine_clinical_outcome"
  | "routine_therapeutic_implication";

/** Bounded rubric weights for hybrid scoring (sum to 1). Community relevance stays dominant. */
export type LearnedRubricWeights = {
  communityRelevance: number;
  signalImportance: number;
  actionability: number;
  credibilityCompleteness: number;
  timelinessNovelty: number;
};

export type RecommendationFeedbackSummary = {
  reviewNeededTooSensitiveCount: number;
  reviewNeededHelpfulCount: number;
  commonlyDismissedReasons: string[];
  commonlyHelpfulReasons: string[];
  /** Per-type score multiplier adjustments */
  adjustedThresholds: Partial<Record<RecommendationType, number>>;
  /** Per reason: count of "too_sensitive" for that reason */
  tooSensitiveByReason: Record<string, number>;
  /** Overall too_sensitive on Review Needed */
  reviewNeededTooSensitiveTotal: number;
  /** Reason weight multipliers (0.5 after repeated too_sensitive) */
  reasonWeightMultipliers: Record<string, number>;
  /** Per-type confidence display multiplier (bounded hybrid scoring). */
  typeConfidenceMultiplier: Partial<Record<RecommendationType, number>>;
  /** Learned rubric weights (community-specific). */
  learnedRubricWeights?: LearnedRubricWeights;
  /** Archetype tallies used for hybrid scoring adjustments (publication, award, …). */
  archetypeNotUsefulCounts?: Record<string, number>;
  archetypeUsefulCounts?: Record<string, number>;
  /** Counts by signal archetype for hybrid rubric tuning. */
  archetypePublishedCounts?: Record<string, number>;
};

export type RecommendationPreferenceProfile = {
  userId?: string;
  reviewSensitivity: RecommendationSensitivity;
  amplifySensitivity: RecommendationSensitivity;
  respondSensitivity: RecommendationSensitivity;
  contentConversionSensitivity: RecommendationSensitivity;
  /** Boost ranking when post text/handle suggests UCSF affiliation (keywords + ucsf.edu). */
  prioritizeUcsfInvestigators: boolean;
  mutedRecommendationReasons: string[];
  boostedRecommendationReasons: string[];
  mutedKeywords: string[];
  boostedKeywords: string[];
  reviewNeededRules: {
    clinicalMentionsAreSensitive: boolean;
    patientMentionsAreSensitive: boolean;
    therapeuticImplicationsAreSensitive: boolean;
    inflammatoryClaimsAreSensitive: boolean;
    controversialClaimsAreSensitive: boolean;
    privacyConcernsAreSensitive: boolean;
    unsupportedEfficacyClaimsAreSensitive: boolean;
    institutionalEndorsementRiskIsSensitive: boolean;
    /** Public-facing clinical guidance (vs research communication). Default on. */
    medicalAdviceDirectedAtPatientsAreSensitive: boolean;
  };
  learnedFeedback: RecommendationFeedbackSummary;
};
