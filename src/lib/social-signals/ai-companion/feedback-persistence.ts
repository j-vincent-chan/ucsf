import { createDefaultRecommendationPreferenceProfile } from "./default-preferences";
import type { RecommendationPreferenceProfile } from "./preferences-types";

const PROFILE_KEY = "cs.aiCompanion.profile.v1";

export function loadPreferenceProfile(): RecommendationPreferenceProfile {
  if (typeof window === "undefined") return createDefaultRecommendationPreferenceProfile();
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return createDefaultRecommendationPreferenceProfile();
    const parsed = JSON.parse(raw) as RecommendationPreferenceProfile;
    const base = createDefaultRecommendationPreferenceProfile();
    return {
      ...base,
      ...parsed,
      prioritizeUcsfInvestigators: parsed.prioritizeUcsfInvestigators ?? base.prioritizeUcsfInvestigators,
      reviewNeededRules: {
        ...base.reviewNeededRules,
        ...parsed.reviewNeededRules,
      },
      learnedFeedback: {
        ...createDefaultRecommendationPreferenceProfile().learnedFeedback,
        ...parsed.learnedFeedback,
        tooSensitiveByReason: parsed.learnedFeedback?.tooSensitiveByReason ?? {},
        reasonWeightMultipliers: parsed.learnedFeedback?.reasonWeightMultipliers ?? {},
        adjustedThresholds: parsed.learnedFeedback?.adjustedThresholds ?? {},
        typeConfidenceMultiplier: parsed.learnedFeedback?.typeConfidenceMultiplier ?? {},
        archetypeNotUsefulCounts: {
          ...createDefaultRecommendationPreferenceProfile().learnedFeedback.archetypeNotUsefulCounts,
          ...parsed.learnedFeedback?.archetypeNotUsefulCounts,
        },
        archetypeUsefulCounts: {
          ...createDefaultRecommendationPreferenceProfile().learnedFeedback.archetypeUsefulCounts,
          ...parsed.learnedFeedback?.archetypeUsefulCounts,
        },
        archetypePublishedCounts: {
          ...createDefaultRecommendationPreferenceProfile().learnedFeedback.archetypePublishedCounts,
          ...parsed.learnedFeedback?.archetypePublishedCounts,
        },
        learnedRubricWeights: parsed.learnedFeedback?.learnedRubricWeights,
      },
    };
  } catch {
    return createDefaultRecommendationPreferenceProfile();
  }
}

export function savePreferenceProfile(profile: RecommendationPreferenceProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // ignore quota
  }
}
