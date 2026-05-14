/** User-facing value tier (internal numeric score is not the primary label). */
export type ValueCategory =
  | "High Value: Amplify"
  | "High Value: Needs Review"
  | "Medium Value: Monitor"
  | "Low Value";

/** Editorial confidence — separate from value category. */
export type ConfidenceLabel = "High confidence" | "Medium confidence" | "Low confidence";

export type DeterministicScoreBreakdown = {
  communityRelevance: number;
  signalImportance: number;
  actionability: number;
  credibilityCompleteness: number;
  timelinessNovelty: number;
  riskPenalty: number;
};

export type ScoringExplanation = {
  internalScore: number;
  category: ValueCategory;
  confidence: ConfidenceLabel;
  deterministicScore: DeterministicScoreBreakdown;
  referenceOrgModifier: number;
  communityLearningModifier: number;
  /** Learned rubric weights used for this score (sum ≈ 1). */
  rubricWeightsUsed: {
    communityRelevance: number;
    signalImportance: number;
    actionability: number;
    credibilityCompleteness: number;
    timelinessNovelty: number;
  };
  topReasons: string[];
  riskReasons: string[];
  suggestedAction: string;
  /** Human-readable caps applied after raw scoring. */
  hardCapsApplied: string[];
  /** Short, plain-language explanation for “Why this was recommended” (not raw rubric labels). */
  scoringNarrative: string;
  /** e.g. publication, award, news, engagement_bait */
  signalArchetype: string;
};
