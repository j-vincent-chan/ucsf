import type { SocialFeedTab, SocialPost } from "@/lib/social-signals/types";
import type { RecommendationPreferenceProfile, LearnedRubricWeights } from "./preferences-types";
import type { SignalTextFeatures } from "./signal-features";
import { extractDois, looksLikePublication, postDiscussesExternalLiterature, ucsfAffinityScore } from "./signal-features";
import {
  authorMatchesInvestigatorDirectory,
  directoryHasPeopleRoster,
  investigatorHonorAffinity,
  investigatorLastNameInCorrespondingContext,
  reposterMatchesInvestigatorDirectory,
  readsLikeInstitutionalNewsOrProgramFeature,
  type InvestigatorSocialDirectory,
} from "./investigator-directory";
import { extractHttpUrlsFromText } from "./watchlist-link-verification";
import { authorMatchesReferenceOrganization } from "./reference-organizations";
import type { ConfidenceLabel, DeterministicScoreBreakdown, ScoringExplanation, ValueCategory } from "./scoring-explanation-types";

const DEFAULT_WEIGHTS: LearnedRubricWeights = {
  communityRelevance: 0.4,
  signalImportance: 0.3,
  actionability: 0.1,
  credibilityCompleteness: 0.1,
  timelinessNovelty: 0.1,
};

const W_CR_MIN = 0.35;
const W_CR_MAX = 0.5;
const W_SI_MIN = 0.2;
const W_SI_MAX = 0.35;
const W_OT_MIN = 0.05;
const W_OT_MAX = 0.15;

export function normalizeLearnedRubricWeights(raw?: Partial<LearnedRubricWeights> | null): LearnedRubricWeights {
  const base = { ...DEFAULT_WEIGHTS, ...raw };
  let cr = clamp(base.communityRelevance, W_CR_MIN, W_CR_MAX);
  let si = clamp(base.signalImportance, W_SI_MIN, W_SI_MAX);
  let ac = clamp(base.actionability, W_OT_MIN, W_OT_MAX);
  let cc = clamp(base.credibilityCompleteness, W_OT_MIN, W_OT_MAX);
  let tn = clamp(base.timelinessNovelty, W_OT_MIN, W_OT_MAX);
  let sum = cr + si + ac + cc + tn;
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };
  cr /= sum;
  si /= sum;
  ac /= sum;
  cc /= sum;
  tn /= sum;
  const othersMax = si + ac + cc + tn;
  if (cr < othersMax) {
    const bump = (othersMax - cr) / 5 + 0.002;
    cr = clamp(cr + bump, W_CR_MIN, 0.55);
    sum = cr + si + ac + cc + tn;
    cr /= sum;
    si /= sum;
    ac /= sum;
    cc /= sum;
    tn /= sum;
  }
  return { communityRelevance: cr, signalImportance: si, actionability: ac, credibilityCompleteness: cc, timelinessNovelty: tn };
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export type SignalScoringHints = {
  /** When the ingest first saw this post (defaults to postedAt). */
  firstSeenAt?: string;
  isDuplicate?: boolean;
  editorialStatus?: "new" | "archived" | "rejected" | "completed";
};

export type HybridScoreInput = {
  post: SocialPost;
  features: SignalTextFeatures;
  investigatorDirectory?: InvestigatorSocialDirectory;
  watchlistLinkVerified?: Record<string, boolean>;
  feedTab?: SocialFeedTab;
  now: Date;
  preferenceProfile: RecommendationPreferenceProfile;
  /** Convergence: distinct reference org authors on this DOI in the current batch. */
  referenceOrgConvergenceCount?: number;
  /** This post’s author is a seeded reference org. */
  authorIsReferenceOrganization?: boolean;
  hints?: SignalScoringHints;
};

/**
 * True when the *substance* of this signal ties a watched investigator to the underlying claim
 * (not merely because a roster member is the poster).
 *
 * - Honor/award copy tied to roster (narrow rules; reposted paper threads excluded separately)
 * - People-roster–verified link for this post id (`watchlistLinkVerified[id] === true`)
 * - Corresponding-author line + roster last name in the **social post** text
 * - Roster member posts content that does **not** read as discussion of external papers/preprints (program voice)
 *
 * For **external-authored literature** (paper/preprint cues + outbound link) we require an explicit positive
 * link check or corresponding-author text — **`watchlistLinkVerified` unset** is treated as *not yet proven*, not
 * neutral, so we never grant a max-tier “verified tie” on the first paint before fetch completes.
 */
function verifiedInvestigatorContentTie(
  post: SocialPost,
  dir: InvestigatorSocialDirectory | undefined,
  watchlistLinkVerified: Record<string, boolean> | undefined,
): boolean {
  if (!dir) return false;

  const urls = extractHttpUrlsFromText(post.text);
  const authorOnRoster = authorMatchesInvestigatorDirectory(post, dir);
  const discussesLit = postDiscussesExternalLiterature(post);
  const correspondingMatch =
    dir.lastNames.length > 0 && investigatorLastNameInCorrespondingContext(post.text, dir.lastNames);

  const hasOutboundLiteratureLink = urls.length > 0 || extractDois(post.text).length > 0;

  const linkCheckedNoRoster =
    hasOutboundLiteratureLink &&
    watchlistLinkVerified?.[post.id] === false &&
    directoryHasPeopleRoster(dir);

  if (linkCheckedNoRoster && !authorOnRoster && !correspondingMatch) {
    return false;
  }

  const needsLinkedAuthorProof = discussesLit && hasOutboundLiteratureLink && !authorOnRoster;

  if (needsLinkedAuthorProof) {
    if (watchlistLinkVerified?.[post.id] === true) return true;
    if (correspondingMatch) return true;
    if (investigatorHonorAffinity(post, dir)) return true;
    return false;
  }

  if (investigatorHonorAffinity(post, dir)) return true;
  if (urls.length > 0 && watchlistLinkVerified?.[post.id] === true) return true;
  if (correspondingMatch) return true;
  if (authorOnRoster && !postDiscussesExternalLiterature(post)) return true;
  return false;
}

function repostOnlyWeakInvestigatorLink(
  post: SocialPost,
  dir: InvestigatorSocialDirectory | undefined,
  watchlistLinkVerified: Record<string, boolean> | undefined,
): boolean {
  if (!dir || !reposterMatchesInvestigatorDirectory(post, dir)) return false;
  return !verifiedInvestigatorContentTie(post, dir, watchlistLinkVerified);
}

function meaningfulAdjacentTopic(post: SocialPost, features: SignalTextFeatures): boolean {
  if (features.hasGrant || features.hasAward || features.hasEvent || features.hasRecruitment) return true;
  if (ucsfAffinityScore(post.text, post.authorHandle) >= 0.35) return true;
  if (looksLikePublication(extractHttpUrlsFromText(post.text), post.text)) return true;
  return false;
}

function scoreCommunityRelevance(input: HybridScoreInput): { score: number; notes: string[] } {
  const { post, features, investigatorDirectory: dir, watchlistLinkVerified, feedTab } = input;
  const notes: string[] = [];
  if (!dir || (!dir.xHandles.length && !dir.blueskyHandles.length && !dir.lastNames.length)) {
    notes.push("No investigator roster configured — community relevance is limited.");
    return { score: meaningfulAdjacentTopic(post, features) ? 5 : 0, notes };
  }

  const underlyingVerified = verifiedInvestigatorContentTie(post, dir, watchlistLinkVerified);
  const authorOnRoster = authorMatchesInvestigatorDirectory(post, dir);
  const repostWeak = repostOnlyWeakInvestigatorLink(post, dir, watchlistLinkVerified);
  const urls = extractHttpUrlsFromText(post.text);
  const hasLitOutbound = urls.length > 0 || extractDois(post.text).length > 0;
  const rosterPeople = directoryHasPeopleRoster(dir);
  const pubLike = looksLikePublication(urls, post.text);
  const discussesLit = postDiscussesExternalLiterature(post);

  let tier = 0;
  if (underlyingVerified) {
    tier = 40;
    if (investigatorHonorAffinity(post, dir)) {
      notes.push("Award or honor tied to a watched investigator on your roster.");
    } else if (urls.length > 0 && watchlistLinkVerified?.[post.id] === true) {
      notes.push("Linked source content verifies a watched investigator on your People roster.");
    } else if (dir.lastNames.length > 0 && investigatorLastNameInCorrespondingContext(post.text, dir.lastNames)) {
      notes.push(
        "Corresponding or co-corresponding context ties a roster investigator to the publication narrative in this post.",
      );
    } else {
      notes.push("Posted by a watched investigator; content reads as program or lab voice rather than third-party literature discussion.");
    }
  } else if (authorOnRoster && discussesLit) {
    const collaborator =
      dir.lastNames.some((ln) => {
        const L = ln.trim().toLowerCase();
        return L.length >= 2 && post.text.toLowerCase().includes(L);
      }) && !investigatorLastNameInCorrespondingContext(post.text, dir.lastNames);
    if (collaborator) {
      tier = 10;
      notes.push(
        "Watched investigator posted publication-style content; a roster name appears but authorship is not verified against the linked source.",
      );
    } else {
      tier = 5;
      notes.push(
        "Watched investigator posted about external literature; the linked work is not verified against your People roster — not scored as primary authorship.",
      );
    }
  } else if (repostWeak) {
    tier = meaningfulAdjacentTopic(post, features) ? 5 : 0;
    notes.push(
      "Watched investigator reposted this, but no verified watched investigator involvement was found in the underlying source.",
    );
  } else if (meaningfulAdjacentTopic(post, features)) {
    tier = 5;
    notes.push("Community-aligned topic without a direct watched-investigator link.");
  }

  if (repostWeak) {
    tier = Math.min(tier, 5);
    notes.push("Repost-only connection capped: underlying source does not verify a watched investigator.");
  }

  if (rosterPeople && discussesLit && hasLitOutbound && watchlistLinkVerified?.[post.id] !== true) {
    tier = Math.min(tier, repostWeak ? 5 : 10);
    if (!authorOnRoster || repostWeak) {
      notes.push(
        watchlistLinkVerified?.[post.id] === false
          ? "Linked manuscript or lab pages were fetched and did not list anyone on your People roster as an author."
          : "Publication link is not verified against your People roster — relevance is capped.",
      );
    }
  }

  if (feedTab === "following" && tier > 5 && !underlyingVerified && !reposterMatchesInvestigatorDirectory(post, dir)) {
    tier = Math.min(tier, 10);
  }

  return { score: tier, notes };
}

function scoreSignalImportance(post: SocialPost, features: SignalTextFeatures): { score: number; notes: string[] } {
  const notes: string[] = [];
  const t = (post.text || "").toLowerCase();
  const urls = extractHttpUrlsFromText(post.text);
  const u = urls.join(" ").toLowerCase();
  const majorVenue =
    u.includes("nature.com") ||
    u.includes("science.org") ||
    u.includes("cell.com") ||
    u.includes("nejm.org") ||
    u.includes("thelancet.com");

  if (readsLikeInstitutionalNewsOrProgramFeature(post.text) && (post.text || "").trim().length > 55) {
    notes.push("Institutional program or translational research feature.");
    return { score: 20, notes };
  }
  if (features.hasAward && /\b(nobel|breakthrough\s+prize|lasser|macarthur|guggenheim)\b/i.test(t)) {
    notes.push("Major honor or landmark recognition language.");
    return { score: 30, notes };
  }
  if (/\b(\$?\d{1,3}\s*million|\d{2,3}\s*million)\b.*\b(grant|award|funding)\b/i.test(t) || /\bU\d{2}\b.*\b(R01|RM1|DP5)\b/i.test(t)) {
    notes.push("Major funding or institutional milestone framing.");
    return { score: 30, notes };
  }
  if (majorVenue && looksLikePublication(urls, post.text)) {
    notes.push("High-impact venue publication signal.");
    return { score: 30, notes };
  }
  if (features.hasAward || features.hasGrant || features.hasCommunityMilestone) {
    notes.push("Award, grant, or community milestone content.");
    return { score: 20, notes };
  }
  if (looksLikePublication(urls, post.text)) {
    notes.push("Publication or preprint-style signal.");
    return { score: 20, notes };
  }
  if (features.hasEvent || features.hasRecruitment) {
    notes.push("Event, seminar, or opportunity style update.");
    return { score: 10, notes };
  }
  if (post.text.trim().length > 40) {
    notes.push("General field update.");
    return { score: 5, notes };
  }
  return { score: 0, notes: ["No clear editorial importance detected."] };
}

function scoreActionability(verified: boolean, features: SignalTextFeatures, pub: boolean): { score: number; notes: string[] } {
  if (verified && (pub || features.hasAward || features.hasGrant)) {
    return {
      score: 10,
      notes: ["Ready to route to digest, newsletter, or social with minimal extra tagging."],
    };
  }
  if (verified) {
    return {
      score: 5,
      notes: ["Watched-investigator tie is verified — still add light framing or source check before amplification."],
    };
  }
  if (pub || features.hasAward || features.hasEvent || features.hasGrant) {
    return { score: 5, notes: ["Useful editorial object but may need confirmation or short summary."] };
  }
  return { score: 0, notes: ["No obvious next editorial action."] };
}

function scoreCredibility(post: SocialPost, features: SignalTextFeatures): { score: number; notes: string[] } {
  const notes: string[] = [];
  const urls = extractHttpUrlsFromText(post.text);
  const u = urls.join(" ").toLowerCase();
  const t = (post.text || "").toLowerCase();
  let pts = 0;
  if (u.includes("doi.org/") || /\b10\.\d{4,9}\//i.test(t)) {
    pts = 10;
    notes.push("Primary identifier (DOI) detected.");
  } else if (u.includes("pubmed.ncbi.nlm.nih.gov") || u.includes("pmc.ncbi.nlm.nih.gov")) {
    pts = 10;
    notes.push("PubMed / PMC link detected.");
  } else if (u.includes("nih.gov") || u.includes(".gov/") || u.includes("clinicaltrials.gov")) {
    pts = 10;
    notes.push("Official government or trial source.");
  } else if (/\.edu\//.test(u) || /\b(press\s+release|newsroom)\b/i.test(t)) {
    pts = 10;
    notes.push("Institutional or official newsroom URL.");
  } else if (authorMatchesReferenceOrganization(post)) {
    pts = 10;
    notes.push("Posted by a verified reference organization account.");
  } else if (looksLikePublication(urls, post.text)) {
    pts = 5;
    notes.push("Journal or preprint host link with partial context.");
  } else if (urls.length > 0) {
    pts = 5;
    notes.push("Links present but verification against claims is incomplete.");
  } else if (features.hasAward && (post.text || "").trim().length >= 35) {
    pts = 5;
    notes.push("Award or recognition narrative — enough copy for light editorial verification.");
  } else if (post.text.length > 120) {
    pts = 5;
    notes.push("Some narrative context without a primary source link.");
  } else {
    return { score: 0, notes: ["Limited sourcing — hard to verify claims independently."] };
  }
  if (features.hasMisinformationFraming || features.hasUnsupportedEfficacyClaim) {
    pts = Math.min(pts, 5);
    notes.push("Credibility downgraded due to risky scientific framing.");
  }
  return { score: pts, notes };
}

function scoreTimeliness(post: SocialPost, now: Date, hints?: SignalScoringHints): { score: number; notes: string[] } {
  const notes: string[] = [];
  if (hints?.editorialStatus && hints.editorialStatus !== "new") {
    notes.push("Signal already processed in your workflow — novelty is discounted.");
    return { score: 0, notes };
  }
  if (hints?.isDuplicate) {
    notes.push("Duplicate of another signal in this window.");
    return { score: 0, notes };
  }
  const anchor = hints?.firstSeenAt ?? post.postedAt;
  const ts = new Date(anchor).getTime();
  const ageH = (now.getTime() - ts) / (3600 * 1000);
  if (ageH <= 36) {
    notes.push("Fresh in the listening window.");
    return { score: 10, notes };
  }
  if (ageH <= 168) {
    notes.push("Still timely but not urgent.");
    return { score: 5, notes };
  }
  notes.push("Older post — lower novelty for amplification.");
  return { score: 0, notes };
}

function scoreRiskPenalty(post: SocialPost, features: SignalTextFeatures): { penalty: number; reasons: string[] } {
  const reasons: string[] = [];
  let worst = 0;

  const push = (p: number, msg: string) => {
    worst = Math.min(worst, p);
    reasons.push(msg);
  };

  if (/\bpatient\s+(named|identified)|MRN\b/i.test(post.text)) push(-25, "Patient-identifiable or sensitive clinical detail.");
  if (features.hasUnsupportedEfficacyClaim || /\bcures?\b/i.test((post.text || "").toLowerCase())) push(-10, "Clinical overclaiming or cure-style language.");
  if (features.hasOvergeneralizedClinicalClaim) push(-10, "Broad causal or efficacy claims that may outrun evidence.");
  if (features.hasMedicalAdvice) push(-10, "May read as direct medical advice to the public.");
  if (features.hasPrivacyConcern) push(-15, "Privacy- or compliance-sensitive framing.");
  if (features.hasInflammatoryLanguage) push(-15, "Inflammatory tone — brand-sensitive.");
  if (features.hasControversialClaim) push(-15, "Political or contested framing.");
  if (features.hasReputationalRiskNamed) push(-20, "Reputational risk involving named parties.");
  if (features.hasMisinformationFraming) push(-25, "Misinformation-style framing.");
  if (features.hasUnpublishedConfidentialTone) push(-20, "Embargo or confidential-information cues.");
  if (/\b(like\s+and\s+share|comment\s+below|follow\s+for\s+more)\b/i.test((post.text || "").toLowerCase())) push(-5, "Engagement-bait phrasing.");

  const likes = post.likeCount ?? 0;
  const reps = post.repostCount ?? 0;
  const vague = (post.text || "").trim().length < 80;
  if (vague && likes + reps > 500) push(-5, "High engagement with low-specificity copy.");

  if (worst === 0) return { penalty: 0, reasons: [] };
  return { penalty: Math.max(-30, worst), reasons };
}

function referenceOrgModifier(input: HybridScoreInput): { mod: number; reasons: string[] } {
  const reasons: string[] = [];
  const n = input.referenceOrgConvergenceCount ?? 0;
  const authorOrg = input.authorIsReferenceOrganization ?? Boolean(authorMatchesReferenceOrganization(input.post));
  let mod = 0;
  if (n >= 4) {
    mod = 10;
    reasons.push("Strong cross-organization convergence on the same underlying source.");
  } else if (n === 3) {
    mod = 6;
    reasons.push("Amplified by three independent reference organizations.");
  } else if (n === 2) {
    mod = 4;
    reasons.push("Amplified by two reference organizations.");
  } else if (n === 1 || authorOrg) {
    mod = 2;
    reasons.push("Reference organization amplification or authorship.");
  }
  return { mod: Math.min(10, mod), reasons };
}

function communityLearningModifier(profile: RecommendationPreferenceProfile, archetype: string): { mod: number; notes: string[] } {
  const lf = profile.learnedFeedback;
  const bad = lf.archetypeNotUsefulCounts?.[archetype] ?? 0;
  const good = lf.archetypeUsefulCounts?.[archetype] ?? 0;
  const pub = lf.archetypePublishedCounts?.[archetype] ?? 0;
  let mod = 0;
  const notes: string[] = [];
  if (bad >= 5) {
    mod -= 3;
    notes.push("Community feedback suggests fewer suggestions like this archetype.");
  } else if (bad >= 3) {
    mod -= 1;
  }
  if (pub >= 3 || good >= 8) {
    mod += 2;
    notes.push("Community behavior suggests this signal type often performs well.");
  } else if (good >= 4) {
    mod += 1;
  }
  return { mod: clamp(mod, -4, 4), notes };
}

function inferArchetype(post: SocialPost, features: SignalTextFeatures): string {
  if (features.hasAward) return "award";
  if (looksLikePublication(extractHttpUrlsFromText(post.text), post.text)) return "publication";
  if (features.hasGrant) return "funding";
  if (features.hasEvent) return "event";
  if (features.hasRecruitment) return "recruitment";
  if (authorMatchesReferenceOrganization(post)) return "reference_org_post";
  return "general";
}

function mapInternalScoreToCategory(score: number): ValueCategory {
  if (score >= 85) return "High Value: Amplify";
  if (score >= 70) return "High Value: Needs Review";
  if (score >= 45) return "Medium Value: Monitor";
  return "Low Value";
}

/** Two-sentence, lay summary for “Why this was recommended” (no archetype / rubric jargon). */
function laymanScoringNarrative(
  post: SocialPost,
  arch: string,
  category: ValueCategory,
  feedTab: SocialFeedTab | undefined,
  rosterTieVerified: boolean,
): string {
  const text = post.text || "";
  const hasUcsf = /\bucsf\b/i.test(text);

  const byCategory: Record<ValueCategory, string> = {
    "High Value: Amplify":
      "Posts like this usually perform well and reflect positively on your community when you acknowledge them in a grounded way.",
    "High Value: Needs Review":
      "It still deserves a careful pass on sourcing and tone before you treat it as ready to amplify widely.",
    "Medium Value: Monitor":
      "It is worth a quick look, but it does not have to be a headline moment for your channels.",
    "Low Value": "You can usually let this pass unless new context makes the angle sharper.",
  };
  const closer = byCategory[category];

  switch (arch) {
    case "award":
      if (feedTab === "following" && !rosterTieVerified) {
        return hasUcsf
          ? `UCSF-related recognition showed up in your broader Following feed without a verified tie to your People roster. ${closer}`
          : `Recognition or award-style news appeared in your Following feed; that is broader than your Investigators list and may not involve someone you track. ${closer}`;
      }
      if ((feedTab === "lists" || feedTab === "mentions") && !rosterTieVerified) {
        return `Milestone- or honor-shaped wording appears here, but we did not verify that someone on your People roster is the honoree or corresponding lead on the underlying work. ${closer}`;
      }
      return hasUcsf
        ? `Someone you follow is sharing UCSF-related recognition. ${closer}`
        : `This is an award or honor someone you follow is putting in front of your community. ${closer}`;
    case "publication":
      return `This reads as new research or a preprint-style update people in your orbit may want summarized or passed along. ${closer}`;
    case "funding":
      return `This centers on funding, a grant line, or money attached to science work. ${closer}`;
    case "event":
      return `This is event- or deadline-shaped content your audience may want on their calendar. ${closer}`;
    case "recruitment":
      return `This looks like recruiting, training intake, or hiring-related science comms. ${closer}`;
    case "reference_org_post":
      return `This ties to a major research organization your field watches closely. ${closer}`;
    default:
      return `This is a general field update from the slice of the web you are watching. ${closer}`;
  }
}

function confidenceFromSignals(input: {
  credibility: number;
  verified: boolean;
  repostWeak: boolean;
  riskPenalty: number;
  watchlistVerified: boolean;
}): ConfidenceLabel {
  if (input.repostWeak && !input.watchlistVerified) return "Low confidence";
  if (input.credibility === 0) return "Low confidence";
  if (input.riskPenalty <= -15) return "Low confidence";
  if (input.credibility >= 10 && input.verified && input.riskPenalty >= -5) return "High confidence";
  if (input.credibility >= 5 && (input.verified || input.watchlistVerified)) return "Medium confidence";
  return "Medium confidence";
}

function suggestedActionFor(category: ValueCategory, risk: number): string {
  if (risk <= -15) return "Send for senior review before any official amplification.";
  if (category === "High Value: Amplify") return "Short-list for newsletter and social amplification.";
  if (category === "High Value: Needs Review") return "Verify sourcing and tone, then amplify if cleared.";
  if (category === "Medium Value: Monitor") return "Monitor or save for a slower digest slot after light verification.";
  return "Skip amplification unless new corroboration appears.";
}

export function computeHybridScoringExplanation(input: HybridScoreInput): ScoringExplanation {
  const { post, features, investigatorDirectory: dir, watchlistLinkVerified, preferenceProfile, now } = input;
  const weights = normalizeLearnedRubricWeights(preferenceProfile.learnedFeedback.learnedRubricWeights);

  const contentVerified = verifiedInvestigatorContentTie(post, dir, watchlistLinkVerified);
  const authorOnRoster = authorMatchesInvestigatorDirectory(post, dir);
  const repostWeak = repostOnlyWeakInvestigatorLink(post, dir, watchlistLinkVerified);
  const urls = extractHttpUrlsFromText(post.text);
  const pub = looksLikePublication(urls, post.text);

  const cr = scoreCommunityRelevance(input);
  const si = scoreSignalImportance(post, features);
  const ac = scoreActionability(contentVerified, features, pub);
  const cc = scoreCredibility(post, features);
  const tn = scoreTimeliness(post, now, input.hints);
  const rk = scoreRiskPenalty(post, features);

  const deterministicScore: DeterministicScoreBreakdown = {
    communityRelevance: cr.score,
    signalImportance: si.score,
    actionability: ac.score,
    credibilityCompleteness: cc.score,
    timelinessNovelty: tn.score,
    riskPenalty: rk.penalty,
  };

  const panel =
    weights.communityRelevance * (cr.score / 40) +
    weights.signalImportance * (si.score / 30) +
    weights.actionability * (ac.score / 10) +
    weights.credibilityCompleteness * (cc.score / 10) +
    weights.timelinessNovelty * (tn.score / 10);

  const ref = referenceOrgModifier(input);
  const arch = inferArchetype(post, features);
  const learn = communityLearningModifier(preferenceProfile, arch);

  let internalScore = Math.round(panel * 100 + rk.penalty + ref.mod + learn.mod);
  internalScore = clamp(internalScore, 0, 100);

  let category = mapInternalScoreToCategory(internalScore);
  const hardCapsApplied: string[] = [];

  const communityZero = cr.score === 0;
  const credibilityZero = cc.score === 0;
  const repostOnlyNoVerified = repostWeak && !contentVerified;
  const paperMismatch =
    pub &&
    directoryHasPeopleRoster(dir) &&
    watchlistLinkVerified?.[post.id] !== true &&
    (repostWeak || (authorOnRoster && !contentVerified));

  if (rk.penalty <= -15 && category === "High Value: Amplify") {
    category = "High Value: Needs Review";
    hardCapsApplied.push("Risk penalty at or beyond −15 — cannot categorize as High Value: Amplify.");
  }
  if (credibilityZero && (category === "High Value: Amplify" || category === "High Value: Needs Review")) {
    category = "Medium Value: Monitor";
    hardCapsApplied.push("Credibility incomplete — cannot exceed Medium Value: Monitor.");
  }
  if (repostOnlyNoVerified && !meaningfulAdjacentTopic(post, features)) {
    if (category === "High Value: Amplify" || category === "High Value: Needs Review") {
      category = "Medium Value: Monitor";
      hardCapsApplied.push("Repost-only without verified underlying investigator — capped at Medium Value: Monitor.");
    }
  }
  if (paperMismatch && (category === "High Value: Amplify" || category === "High Value: Needs Review")) {
    category = "Medium Value: Monitor";
    hardCapsApplied.push("Paper or source does not match claimed watched-investigator involvement — capped at Medium Value: Monitor.");
  }
  if (communityZero && (category === "High Value: Amplify" || category === "High Value: Needs Review")) {
    category = "Medium Value: Monitor";
    hardCapsApplied.push("No community relevance — reference or trend signals cannot force High Value.");
  }

  const confidence = confidenceFromSignals({
    credibility: cc.score,
    verified: contentVerified,
    repostWeak,
    riskPenalty: rk.penalty,
    watchlistVerified: watchlistLinkVerified?.[post.id] === true,
  });

  const topReasons = [...cr.notes.slice(0, 1), ...si.notes.slice(0, 1), ...ref.reasons.slice(0, 1)].filter(Boolean).slice(0, 3);
  const riskReasons = [...rk.reasons, ...cc.notes.filter((n) => n.includes("downgraded"))].slice(0, 3);

  const scoringNarrative = laymanScoringNarrative(post, arch, category, input.feedTab, contentVerified);

  return {
    internalScore,
    category,
    confidence,
    deterministicScore,
    referenceOrgModifier: ref.mod,
    communityLearningModifier: learn.mod,
    rubricWeightsUsed: weights,
    topReasons: topReasons.length ? topReasons : ["Editorial triage based on deterministic rubric."],
    riskReasons: riskReasons.length ? riskReasons : [],
    suggestedAction: suggestedActionFor(category, rk.penalty),
    hardCapsApplied,
    scoringNarrative,
    signalArchetype: arch,
  };
}

/** Batch helper: count distinct reference-org authors per DOI across posts. */
export function buildReferenceOrgConvergenceByDoi(posts: SocialPost[]): Map<string, number> {
  const doiToHandles = new Map<string, Set<string>>();
  for (const p of posts) {
    const dois = extractDois(p.text);
    if (!dois.length) continue;
    const org = authorMatchesReferenceOrganization(p);
    if (!org) continue;
    const h = org.xHandle.toLowerCase();
    for (const d of dois) {
      const set = doiToHandles.get(d) ?? new Set();
      set.add(h);
      doiToHandles.set(d, set);
    }
  }
  const out = new Map<string, number>();
  for (const [d, set] of doiToHandles) out.set(d, set.size);
  return out;
}

export function convergenceCountForPost(post: SocialPost, byDoi: Map<string, number>): number {
  const dois = extractDois(post.text);
  let max = 0;
  for (const d of dois) max = Math.max(max, byDoi.get(d) ?? 0);
  return max;
}
