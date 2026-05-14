import type { RecommendationFeedbackSummary, RecommendationPreferenceProfile } from "./preferences-types";

export function emptyFeedbackSummary(): RecommendationFeedbackSummary {
  return {
    reviewNeededTooSensitiveCount: 0,
    reviewNeededHelpfulCount: 0,
    commonlyDismissedReasons: [],
    commonlyHelpfulReasons: [],
    adjustedThresholds: {},
    tooSensitiveByReason: {},
    reviewNeededTooSensitiveTotal: 0,
    reasonWeightMultipliers: {},
    typeConfidenceMultiplier: {},
    learnedRubricWeights: undefined,
    archetypeNotUsefulCounts: {},
    archetypeUsefulCounts: {},
    archetypePublishedCounts: {},
  };
}

export function createDefaultRecommendationPreferenceProfile(
  partial?: Partial<RecommendationPreferenceProfile>,
): RecommendationPreferenceProfile {
  return {
    reviewSensitivity: "balanced",
    amplifySensitivity: "balanced",
    respondSensitivity: "balanced",
    contentConversionSensitivity: "balanced",
    prioritizeUcsfInvestigators: true,
    mutedRecommendationReasons: [],
    boostedRecommendationReasons: [],
    mutedKeywords: [],
    boostedKeywords: [],
    reviewNeededRules: {
      clinicalMentionsAreSensitive: false,
      patientMentionsAreSensitive: false,
      therapeuticImplicationsAreSensitive: false,
      inflammatoryClaimsAreSensitive: true,
      controversialClaimsAreSensitive: true,
      privacyConcernsAreSensitive: true,
      unsupportedEfficacyClaimsAreSensitive: true,
      institutionalEndorsementRiskIsSensitive: true,
      medicalAdviceDirectedAtPatientsAreSensitive: true,
    },
    learnedFeedback: emptyFeedbackSummary(),
    ...partial,
  };
}
