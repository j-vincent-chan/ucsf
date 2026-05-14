import type { SocialPost } from "@/lib/social-signals/types";
import { extractHttpUrlsFromText } from "./watchlist-link-verification";

export type SignalTextFeatures = {
  hasPublicationLink: boolean;
  mentionsKnownInvestigator: boolean;
  mentionsPatient: boolean;
  mentionsClinicalOutcome: boolean;
  mentionsTherapeuticImplication: boolean;
  hasInflammatoryLanguage: boolean;
  hasControversialClaim: boolean;
  hasUnsupportedEfficacyClaim: boolean;
  hasPrivacyConcern: boolean;
  hasInstitutionalEndorsementRisk: boolean;
  hasMedicalAdvice: boolean;
  hasMisinformationFraming: boolean;
  hasUnpublishedConfidentialTone: boolean;
  hasReputationalRiskNamed: boolean;
  hasOvergeneralizedClinicalClaim: boolean;
  hasCommunityMilestone: boolean;
  hasAward: boolean;
  hasEvent: boolean;
  hasRecruitment: boolean;
  hasGrant: boolean;
  /** Rough keyword stems for theme clustering */
  themes: string[];
  linkedPeople: string[];
};

function extractUrls(text: string): string[] {
  return extractHttpUrlsFromText(text);
}

export function looksLikePublication(urls: string[], text: string): boolean {
  const u = urls.join(" ").toLowerCase();
  const t = (text || "").toLowerCase();
  if (u.includes("doi.org/")) return true;
  if (u.includes("pubmed.ncbi.nlm.nih.gov")) return true;
  if (u.includes("arxiv.org/")) return true;
  if (u.includes("nature.com") || u.includes("science.org") || u.includes("cell.com")) return true;
  if (u.includes("thelancet.com") || u.includes("nejm.org")) return true;
  if (t.includes("preprint") || t.includes("peer-reviewed") || t.includes("published in")) return true;
  if (t.includes("paper") && (t.includes("journal") || t.includes("our study"))) return true;
  return false;
}

/** DOI-like strings in body (for literature / dedupe signals). */
export function extractDois(text: string): string[] {
  const t = text || "";
  const matches = t.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi) ?? [];
  return [...new Set(matches.map((m) => m.toLowerCase()))];
}

/**
 * True when the post reads like discussion of concrete external literature (paper, preprint, DOI, “our work” in
 * research sense). Used to avoid treating lab paper threads as generic “honor” when a roster member only reposted.
 */
export function postDiscussesExternalLiterature(post: SocialPost): boolean {
  const text = post.text || "";
  const urls = extractUrls(text);
  if (looksLikePublication(urls, text)) return true;
  if (extractDois(text).length > 0) return true;
  const t = text.toLowerCase();
  if (/\b(this paper|these papers|the paper|that paper|this work|that work|new paper|our paper)\b/.test(t)) return true;
  if (/\b(preprint|manuscript|peer[- ]?reviewed|published in|doi:|pmid:|pubmed\b)/i.test(text)) return true;
  return false;
}

const INFLAMMATORY =
  /\b(stupid|ridiculous|disgrace|disastrous|outrage|garbage|witch\s*hunt|cover\-up|evil|crazy\s+policy)\b/i;
const CONTROVERSIAL =
  /\b(controvers|politic|election|propaganda|fake\s+news|mainstream\s+media|culture\s+war|debate\b.*\bheated)\b/i;
const UNSUPPORTED_EFFICACY =
  /\b(cures?\s+cancer|miracle\s+cure|guaranteed\s+(?:to\s+)?(?:work|cure)|100%\s+effective|won'?t\s+hurt\s+you|cancer\s+free\b.*\b(days|weeks)|instant\s+remission)\b/i;
const WEAK_EVIDENCE_STRONG_CLAIM =
  /\b(proves\b.*\bcure|definit(?:e|ively)\s+(?:cures|shows)\s+cancer|nothing\s+else\s+works)\b/i;
const PRIVACY =
  /\b(HIPAA|PHI\b|personally\s+identifiable|patient\s+identifiable|MRN\b|date\s+of\s+birth|social\s+security)\b/i;
const PATIENT_IDENTIFIABLE =
  /\b(\d{1,2}\/\d{1,2}\/\d{2,4}.*\bpatient|patient\s+(named|called)\s+[A-Z][a-z]+|initials\s+[A-Z]\.[A-Z]\.)\b/i;
const INSTITUTIONAL_ENDORSEMENT =
  /\b(we\s+endorse|official\s+(?:position|statement)\s+(?:of|from)\s+(?:our|the)\s+(?:institution|university|department)|speaks\s+for\s+the\s+(?:university|institution))\b/i;
const MEDICAL_ADVICE_PUBLIC =
  /\b(you\s+should\s+(?:stop|start|take|avoid)|don'?t\s+take\s+your|patients\s+must\s+|seek\s+immediate\s+care\s+if)\b/i;
const MISINFO =
  /\b(conspiracy|big\s+pharma\s+hides|they\s+don'?t\s+want\s+you\s+to\s+know|plandemic|microchip)\b/i;
const UNPUBLISHED_LEAK =
  /\b(unpublished\s+data|confidential\s+results|under\s+embargo|internal\s+only|not\s+yet\s+public|leaked\s+slides)\b/i;
const REPUTATIONAL_ATTACK =
  /\b(\b[A-Z][a-z]+\s+[A-Z][a-z]+\s+(?:is\s+a\s+fraud|lied|corrupt)|\b(?:NIH|FDA|CDC)\s+(?:is\s+covering|is\s+lying))\b/i;

export function extractSignalFeatures(post: SocialPost): SignalTextFeatures {
  const text = post.text ?? "";
  const lower = text.toLowerCase();
  const urls = extractUrls(text);

  const mentionsPatient = /\bpatient[s]?\b/i.test(text);
  const mentionsClinicalOutcome =
    /\b(clinical\s+outcome|overall\s+survival|progression[\s-]free|response\s+rate|endpoint[s]?|efficacy\s+result|HR\s*[≤=])\b/i.test(
      text,
    );
  const mentionsTherapeuticImplication =
    /\b(therapeutic|treatment\s+implication|may\s+treat|clinical\s+implication|transform(?:s|ed)?\s+care)\b/i.test(text);

  const hasPublicationLink = looksLikePublication(urls, text);

  const hasInflammatoryLanguage =
    INFLAMMATORY.test(text) || /\b(shame\s+on|disgusting|pathetic)\b/i.test(text);
  const hasControversialClaim = CONTROVERSIAL.test(text);
  const hasUnsupportedEfficacyClaim =
    UNSUPPORTED_EFFICACY.test(text) ||
    WEAK_EVIDENCE_STRONG_CLAIM.test(text) ||
    /\bcures?\b/i.test(lower) && /\b(cancer|disease)\b/i.test(lower) && /\b(phase\s*i\b|early|mouse|preclinical)\b/i.test(lower);

  const hasPrivacyConcern = PRIVACY.test(text) || PATIENT_IDENTIFIABLE.test(text);
  const hasInstitutionalEndorsementRisk = INSTITUTIONAL_ENDORSEMENT.test(text);
  const hasMedicalAdvice = MEDICAL_ADVICE_PUBLIC.test(text);
  const hasMisinformationFraming = MISINFO.test(text);
  const hasUnpublishedConfidentialTone = UNPUBLISHED_LEAK.test(text);
  const hasReputationalRiskNamed = REPUTATIONAL_ATTACK.test(text);

  const hasOvergeneralizedClinicalClaim =
    /\b(all\s+patients|everyone\s+with|cures\s+all|works\s+for\s+everyone)\b/i.test(text) &&
    /\b(cancer|disease|therapy)\b/i.test(lower);

  const hasAward =
    /\b(award|honored|congratulations|felicitations|prize|medal|fellowship\s+award)\b/i.test(lower);
  const hasEvent =
    /\b(conference|symposium|deadline|abstract\s+due|registration\s+closes|webinar)\b/i.test(lower);
  const hasRecruitment =
    /\b(recruit|we\s+are\s+hiring|now\s+enrolling|seeking\s+participants|clinical\s+trial\s+recruitment)\b/i.test(
      lower,
    );
  const hasGrant =
    /\b(grant\s+(?:funded|award)|RFA\b|funding\s+opportunity|NIH\s+grant)\b/i.test(lower);

  const hasCommunityMilestone =
    hasAward ||
    hasGrant ||
    /\b(welcome\s+to\s+the\s+lab|promotion|tenure|new\s+faculty|accepted\s+to)\b/i.test(lower);

  const themes: string[] = [];
  if (mentionsPatient) themes.push("patients");
  if (mentionsClinicalOutcome) themes.push("clinical-outcomes");
  if (hasPublicationLink) themes.push("publication");

  return {
    hasPublicationLink,
    mentionsKnownInvestigator: false,
    mentionsPatient,
    mentionsClinicalOutcome,
    mentionsTherapeuticImplication,
    hasInflammatoryLanguage,
    hasControversialClaim,
    hasUnsupportedEfficacyClaim,
    hasPrivacyConcern,
    hasInstitutionalEndorsementRisk,
    hasMedicalAdvice,
    hasMisinformationFraming,
    hasUnpublishedConfidentialTone,
    hasReputationalRiskNamed,
    hasOvergeneralizedClinicalClaim,
    hasCommunityMilestone,
    hasAward,
    hasEvent,
    hasRecruitment,
    hasGrant,
    themes: [...new Set(themes)],
    linkedPeople: [],
  };
}

/**
 * Strong community/comms signals for the broad “Others” (following) tab — funding, deadlines,
 * hiring, awards, or news-style framing. Used to raise the bar so routine posts don’t Amplify.
 */
/** 0–1 strength for UCSF affiliation from handle + post body (not mutually exclusive; capped). */
export function ucsfAffinityScore(text: string, authorHandle: string): number {
  const h = (authorHandle || "").toLowerCase().replace(/^@+/, "");
  const t = (text || "").toLowerCase();
  let s = 0;
  if (/\bucsf\b/.test(t)) s += 0.42;
  if (/ucsf\.edu/.test(t)) s += 0.38;
  if (/university\s+of\s+california[, ]+san\s+francisco/.test(t)) s += 0.44;
  if (h.includes("ucsf")) s += 0.52;
  if (/\bucsf\s+(health|medicine|department|school|children'?s)/.test(t)) s += 0.22;
  return Math.min(1, s);
}

export function hasOthersElevatedSignal(features: SignalTextFeatures, text: string): boolean {
  const t = text.toLowerCase();
  if (features.hasGrant || features.hasRecruitment || features.hasEvent) return true;
  if (features.hasAward) return true;
  if (
    /\b(breaking|press\s+release|policy\s+update|launching\s+(a\s+)?program|request\s+for\s+applications|rfp\b)\b/i.test(t)
  )
    return true;
  if (/\b(fda|nih)\b.*\b(approval|clearance|notice|announcement)\b/i.test(t)) return true;
  if (/\bjust\s+(published|announced|posted)\b/i.test(t)) return true;
  return false;
}
