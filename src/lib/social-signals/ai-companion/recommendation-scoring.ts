import type { SocialPost } from "@/lib/social-signals/types";
import type { RecommendationPreferenceProfile, RecommendationSensitivity, ReviewReasonCode } from "./preferences-types";
import type { SignalTextFeatures } from "./signal-features";

export type ScoreReason = { code: ReviewReasonCode; points: number };

export type ReviewNeededScoreResult = {
  score: number;
  reasons: ScoreReason[];
  /** Highest-risk explanations for rationale copy */
  primaryCodes: ReviewReasonCode[];
  rationale: string;
  title: string;
};

export function reviewNeededThreshold(sensitivity: RecommendationSensitivity): number {
  switch (sensitivity) {
    case "low":
      return 45;
    case "high":
      return 20;
    default:
      return 30;
  }
}

function applyReasonMultiplier(
  code: ReviewReasonCode,
  points: number,
  multipliers: Record<string, number>,
): number {
  const m = multipliers[code];
  if (m === undefined || Number.isNaN(m)) return points;
  return points * m;
}

function ruleAllows(
  profile: RecommendationPreferenceProfile,
  code: ReviewReasonCode,
): boolean {
  const r = profile.reviewNeededRules;
  switch (code) {
    case "routine_clinical_outcome":
      return r.clinicalMentionsAreSensitive;
    case "routine_patient_mention":
      return r.patientMentionsAreSensitive;
    case "routine_therapeutic_implication":
      return r.therapeuticImplicationsAreSensitive;
    case "inflammatory_language":
      return r.inflammatoryClaimsAreSensitive;
    case "controversial_or_political_framing":
      return r.controversialClaimsAreSensitive;
    case "privacy_concern_general":
    case "patient_identifiable":
      return r.privacyConcernsAreSensitive;
    case "unsupported_efficacy_or_cure":
    case "overgeneralized_clinical_claim":
      return r.unsupportedEfficacyClaimsAreSensitive;
    case "institutional_endorsement_risk":
      return r.institutionalEndorsementRiskIsSensitive;
    case "medical_advice_public":
      return r.medicalAdviceDirectedAtPatientsAreSensitive ?? true;
    default:
      return true;
  }
}

function buildRationale(reasons: ScoreReason[]): { title: string; rationale: string; primaryCodes: ReviewReasonCode[] } {
  const sorted = [...reasons].sort((a, b) => b.points - a.points);
  const codes = sorted.map((x) => x.code);
  const top = sorted[0];

  const pickTitle = (): string => {
    if (codes.includes("unsupported_efficacy_or_cure")) return "Possible overstatement of therapeutic benefit";
    if (codes.includes("patient_identifiable") || codes.includes("privacy_concern_general"))
      return "Possible privacy or identifiability concern";
    if (codes.includes("medical_advice_public")) return "May read as medical advice to the public";
    if (codes.includes("inflammatory_language")) return "Inflammatory tone on a sensitive topic";
    if (codes.includes("controversial_or_political_framing")) return "Controversial or political framing";
    if (codes.includes("institutional_endorsement_risk")) return "Possible institutional endorsement risk";
    if (codes.includes("reputational_risk_named")) return "Reputational risk involving named parties";
    if (codes.includes("misinformation_or_conspiracy")) return "Misinformation or conspiracy-style framing";
    if (codes.includes("unpublished_or_confidential")) return "Unpublished or confidential information";
    return "Human review recommended";
  };

  const explain = (code: ReviewReasonCode): string => {
    switch (code) {
      case "unsupported_efficacy_or_cure":
        return "Possible overstatement of therapeutic benefit. Recommend review before amplifying from an institutional account.";
      case "patient_identifiable":
        return "This post may name a patient or include potentially identifiable clinical context. Recommend review before amplification.";
      case "privacy_concern_general":
        return "Privacy- or compliance-sensitive language detected. Recommend review before reposting.";
      case "medical_advice_public":
        return "Language may read as direct clinical guidance to patients rather than research communication. Recommend review.";
      case "inflammatory_language":
        return "Inflammatory language detected around a contested topic. Recommend review before reposting.";
      case "controversial_or_political_framing":
        return "Controversial scientific or political framing detected. Recommend review if posting from an official channel.";
      case "institutional_endorsement_risk":
        return "Language could be read as an institutional endorsement of a contested position. Recommend review.";
      case "reputational_risk_named":
        return "Strong criticism or reputational risk involving named people or organizations. Recommend review.";
      case "unpublished_or_confidential":
        return "References unpublished, embargoed, or confidential material. Recommend review.";
      case "misinformation_or_conspiracy":
        return "Framing resembles misinformation or conspiracy narratives. Recommend review.";
      case "overgeneralized_clinical_claim":
        return "Broad clinical claims that may outrun the evidence. Recommend review before amplification.";
      default:
        return top
          ? `Signals include “${top.code.replace(/_/g, " ")}”. Recommend human review before official amplification.`
          : "Recommend human review before amplifying from an institutional account.";
    }
  };

  const primaryCodes = sorted.slice(0, 3).map((s) => s.code);
  const rationale =
    top && !["routine_patient_mention", "routine_clinical_outcome", "routine_therapeutic_implication"].includes(top.code)
      ? explain(top.code)
      : sorted.length > 1
        ? explain(sorted.filter((s) => !s.code.startsWith("routine_"))[0]?.code ?? top!.code)
        : explain(top!.code);

  return { title: pickTitle(), rationale, primaryCodes };
}

export function scoreReviewNeeded(
  post: SocialPost,
  features: SignalTextFeatures,
  profile: RecommendationPreferenceProfile,
): ReviewNeededScoreResult | null {
  const multipliers = profile.learnedFeedback.reasonWeightMultipliers ?? {};
  const reasons: ScoreReason[] = [];

  const push = (code: ReviewReasonCode, basePoints: number) => {
    if (!ruleAllows(profile, code)) return;
    const pts = applyReasonMultiplier(code, basePoints, multipliers);
    if (pts <= 0) return;
    reasons.push({ code, points: pts });
  };

  if (/\bpatient\s+(named|identified)|MRN\b|\bpatient\s+identifiable\b/i.test(post.text)) {
    push("patient_identifiable", 40);
  } else if (features.hasPrivacyConcern) {
    push("privacy_concern_general", 35);
  }
  if (features.hasMedicalAdvice) push("medical_advice_public", 35);
  if (features.hasUnsupportedEfficacyClaim) push("unsupported_efficacy_or_cure", 35);
  if (features.hasInflammatoryLanguage) push("inflammatory_language", 30);
  if (features.hasControversialClaim) push("controversial_or_political_framing", 30);
  if (features.hasInstitutionalEndorsementRisk) push("institutional_endorsement_risk", 25);
  if (features.hasReputationalRiskNamed) push("reputational_risk_named", 25);
  if (features.hasUnpublishedConfidentialTone) push("unpublished_or_confidential", 20);
  if (features.hasOvergeneralizedClinicalClaim) push("overgeneralized_clinical_claim", 15);
  if (features.hasMisinformationFraming) push("misinformation_or_conspiracy", 30);

  if (features.mentionsPatient && profile.reviewNeededRules.patientMentionsAreSensitive) {
    push("routine_patient_mention", 5);
  }
  if (features.mentionsClinicalOutcome && profile.reviewNeededRules.clinicalMentionsAreSensitive) {
    push("routine_clinical_outcome", 5);
  }
  if (features.mentionsTherapeuticImplication && profile.reviewNeededRules.therapeuticImplicationsAreSensitive) {
    push("routine_therapeutic_implication", 5);
  }

  const score = reasons.reduce((a, r) => a + r.points, 0);

  const highRiskCodes: ReviewReasonCode[] = [
    "patient_identifiable",
    "medical_advice_public",
    "unsupported_efficacy_or_cure",
    "inflammatory_language",
    "controversial_or_political_framing",
    "privacy_concern_general",
    "institutional_endorsement_risk",
    "reputational_risk_named",
    "unpublished_or_confidential",
    "misinformation_or_conspiracy",
    "overgeneralized_clinical_claim",
  ];

  const highRiskPoints = reasons.filter((r) => highRiskCodes.includes(r.code)).reduce((a, r) => a + r.points, 0);

  /** Routine-only: never Review Needed from biomedical keywords alone */
  if (highRiskPoints === 0) {
    const onlyRoutine =
      reasons.length === 0 ||
      reasons.every((r) =>
        ["routine_patient_mention", "routine_clinical_outcome", "routine_therapeutic_implication"].includes(r.code),
      );
    if (onlyRoutine) return null;
  }

  const threshold = reviewNeededThreshold(profile.reviewSensitivity);
  if (score < threshold) {
    return null;
  }

  const { title, rationale, primaryCodes } = buildRationale(reasons);
  return { score, reasons, primaryCodes, rationale, title };
}
