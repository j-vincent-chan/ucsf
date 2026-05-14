import type { SocialFeedTab, SocialPost } from "@/lib/social-signals/types";
import { createDefaultRecommendationPreferenceProfile } from "./default-preferences";
import type { RecommendationPreferenceProfile } from "./preferences-types";
import { scoreReviewNeeded } from "./recommendation-scoring";
import {
  extractDois,
  extractSignalFeatures,
  hasOthersElevatedSignal,
  looksLikePublication,
  ucsfAffinityScore,
} from "./signal-features";
import {
  authorMatchesInvestigatorDirectory,
  directoryHasPeopleRoster,
  directoryHasRoster,
  investigatorHonorAffinity,
  investigatorLastNameInCorrespondingContext,
  investigatorRepostedNewsAffinity,
  strongInvestigatorPaperAffinity,
  type InvestigatorSocialDirectory,
} from "./investigator-directory";
import { extractHttpUrlsFromText } from "./watchlist-link-verification";
import {
  buildReferenceOrgConvergenceByDoi,
  computeHybridScoringExplanation,
  convergenceCountForPost,
  type SignalScoringHints,
} from "./hybrid-companion-scoring";
import {
  buildAmplifyEditorial,
  buildRespondEditorial,
  mergeAmplifyRespondEditorial,
} from "./editorial-recommendation-copy";
import type {
  AICompanionOutput,
  RecommendationAction,
  RecommendationPriority,
  RecommendationType,
  SignalRecommendation,
  ThemeCluster,
  WatchlistSuggestion,
} from "./types";
import type { ValueCategory } from "./scoring-explanation-types";

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function stableId(prefix: string, parts: string[]) {
  const raw = parts.join("|").slice(0, 220);
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) >>> 0;
  return `${prefix}_${h.toString(16)}`;
}

function postEngagementScore(p: SocialPost): number {
  const likes = p.likeCount ?? 0;
  const reposts = p.repostCount ?? 0;
  const replies = p.replyCount ?? 0;
  const views = p.viewCount ?? 0;
  return likes * 1.0 + reposts * 1.4 + replies * 1.1 + Math.min(views / 250, 30);
}

function hasMilestoneLanguage(text: string): boolean {
  const t = (text || "").toLowerCase();
  return (
    t.includes("congrats") ||
    t.includes("congratulations") ||
    t.includes("award") ||
    t.includes("honor") ||
    t.includes("named") ||
    t.includes("appointed") ||
    t.includes("welcome") ||
    t.includes("promotion") ||
    t.includes("accepted") ||
    t.includes("grant") ||
    t.includes("funded") ||
    t.includes("rfa") ||
    t.includes("deadline") ||
    t.includes("recruit") ||
    t.includes("hiring") ||
    t.includes("registration")
  );
}

function amplifyConfidenceBoost(profile: RecommendationPreferenceProfile): number {
  switch (profile.amplifySensitivity) {
    case "low":
      return 0.94;
    case "high":
      return 1.06;
    default:
      return 1;
  }
}

function respondConfidenceBoost(profile: RecommendationPreferenceProfile): number {
  switch (profile.respondSensitivity) {
    case "low":
      return 0.94;
    case "high":
      return 1.06;
    default:
      return 1;
  }
}

/** Relative engagement threshold vs feed median — stricter for “Others” (following), looser for Investigators/Mentions. */
function engagementHighBar(feedTab: SocialFeedTab | undefined, median: number): number {
  if (feedTab === "following") return Math.max(14, median * 2.55);
  if (feedTab === "lists" || feedTab === "mentions") return Math.max(7, median * 1.48);
  return Math.max(10, median * 1.9);
}

/** Confidence nudge from feed context (Investigators/Mentions boosted; Others damped). */
function audienceConfidenceFactor(feedTab: SocialFeedTab | undefined): number {
  if (feedTab === "lists") return 1.08;
  if (feedTab === "mentions") return 1.06;
  if (feedTab === "following") return 0.93;
  return 1;
}

/** Even stricter floor for “engagement-only” Amplify on the Others tab. */
function othersEngagementSuperBar(feedTab: SocialFeedTab | undefined, median: number, highBar: number): number {
  if (feedTab !== "following") return highBar;
  return Math.max(highBar * 1.14, median * 2.95);
}


function tokenizeForThemes(text: string): string[] {
  const t = (text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9#\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return [];
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "have",
    "has",
    "our",
    "your",
    "you",
    "their",
    "about",
    "into",
    "over",
    "more",
    "new",
    "today",
    "week",
    "we",
    "is",
    "are",
    "to",
    "of",
    "in",
    "on",
    "at",
    "as",
    "it",
    "be",
    "by",
    "a",
    "an",
  ]);
  const out: string[] = [];
  for (const w of t.split(" ")) {
    const clean = w.replace(/^#+/, "#");
    if (clean.length < 4) continue;
    if (stop.has(clean)) continue;
    if (/^\d+$/.test(clean)) continue;
    out.push(clean);
  }
  return out.slice(0, 36);
}

function topKeywords(posts: SocialPost[]): string[] {
  const counts = new Map<string, number>();
  for (const p of posts) {
    for (const w of tokenizeForThemes(p.text)) {
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([w]) => w);
}

function badgeForType(t: RecommendationType): { bg: string; fg: string } {
  switch (t) {
    case "Review Needed":
      return { bg: "bg-amber-500/18", fg: "text-amber-800 dark:text-amber-200" };
    case "Amplify":
      return { bg: "bg-emerald-500/16", fg: "text-emerald-800 dark:text-emerald-200" };
    case "Respond":
      return { bg: "bg-sky-500/16", fg: "text-sky-800 dark:text-sky-200" };
    case "Amplify & Respond":
      return { bg: "bg-emerald-500/12", fg: "text-emerald-900 dark:text-emerald-100" };
    case "Prioritize":
      return { bg: "bg-rose-500/16", fg: "text-rose-800 dark:text-rose-200" };
    case "Add to Watchlist":
      return { bg: "bg-fuchsia-500/14", fg: "text-fuchsia-800 dark:text-fuchsia-200" };
    default:
      return { bg: "bg-[color:var(--muted)]/35", fg: "text-[color:var(--foreground)]/80" };
  }
}

export function companionTypeBadgeStyle(t: RecommendationType) {
  return badgeForType(t);
}

function pickHigherRecommendationPriority(
  a: RecommendationPriority,
  b: RecommendationPriority,
): RecommendationPriority {
  const o: Record<RecommendationPriority, number> = { high: 0, medium: 1, low: 2 };
  return o[a] <= o[b] ? a : b;
}

function mergeRecommendationActions(a: RecommendationAction[], b: RecommendationAction[]): RecommendationAction[] {
  return [...new Set([...a, ...b])];
}

function postMatchesMutedKeyword(text: string, muted: string[]): boolean {
  const lower = text.toLowerCase();
  return muted.some((k) => k.trim() && lower.includes(k.trim().toLowerCase()));
}

function confidenceNumericFromLabel(label: string | undefined, fallback: number): number {
  if (label === "High confidence") return clamp01(Math.max(fallback, 0.86));
  if (label === "Low confidence") return clamp01(Math.min(fallback, 0.52));
  return clamp01(fallback);
}

function priorityFromValueCategory(cat: ValueCategory | undefined, fallback: RecommendationPriority): RecommendationPriority {
  if (!cat) return fallback;
  if (cat === "High Value: Amplify" || cat === "High Value: Needs Review") return "high";
  if (cat === "Medium Value: Monitor") return "medium";
  return "low";
}

function applyPreferenceConfidence(
  rec: SignalRecommendation,
  profile: RecommendationPreferenceProfile,
  postsById: Map<string, SocialPost>,
  investigatorDirectory: InvestigatorSocialDirectory | undefined,
): SignalRecommendation {
  const tm = profile.learnedFeedback.typeConfidenceMultiplier?.[rec.type] ?? 1;
  let ucsfFactor = 1;
  if (profile.prioritizeUcsfInvestigators) {
    let maxU = 0;
    let strongPaper = false;
    for (const id of rec.signalIds) {
      const p = postsById.get(id);
      if (!p) continue;
      maxU = Math.max(maxU, ucsfAffinityScore(p.text, p.authorHandle));
      if (strongInvestigatorPaperAffinity(p, investigatorDirectory)) strongPaper = true;
    }
    if (investigatorDirectory && directoryHasRoster(investigatorDirectory)) {
      ucsfFactor = strongPaper ? 1 + 0.13 * maxU : 1 + 0.028 * maxU;
    } else {
      ucsfFactor = 1 + 0.12 * maxU;
    }
  }
  const base = rec.confidence ?? 0.65;
  const calibrated =
    rec.scoringExplanation != null
      ? confidenceNumericFromLabel(rec.scoringExplanation.confidence, base)
      : base;
  return { ...rec, confidence: clamp01(calibrated * tm * ucsfFactor) };
}

function applyUserFeedbackAdjustments(
  recs: SignalRecommendation[],
  profile: RecommendationPreferenceProfile,
  postsById: Map<string, SocialPost>,
): SignalRecommendation[] {
  const muted = profile.mutedRecommendationReasons ?? [];
  const mutedKw = profile.mutedKeywords ?? [];

  return recs.filter((rec) => {
    const text = rec.signalIds.map((id) => postsById.get(id)?.text ?? "").join(" ");
    if (mutedKw.length && postMatchesMutedKeyword(text, mutedKw)) {
      if (rec.type === "Amplify" || rec.type === "Respond" || rec.type === "Amplify & Respond") return false;
    }
    if (!rec.triggerReasonCodes?.length) return true;
    const codes = rec.triggerReasonCodes;
    if (muted.length && codes.every((c) => muted.includes(c))) return false;
    return true;
  });
}

export function generateSignalRecommendations(
  signals: SocialPost[],
  options?: {
    now?: Date;
    maxRecommendations?: number;
    preferenceProfile?: RecommendationPreferenceProfile;
    /** Live listening tab: Investigators (`lists`) vs Mentions vs Others (`following`). Drives prioritization. */
    feedTab?: SocialFeedTab;
    /** Active faculty/lab social handles + last names from Admin People (`tracked_entities`) — ground truth for publication amplify. */
    investigatorDirectory?: InvestigatorSocialDirectory;
    /**
     * Server-verified: fetched URLs in each post mention People on the watchlist (`tracked_entities`).
     * When People roster exists and a post contains HTTP links, publication-style amplify requires `true` for that post id unless the poster is on the roster.
     */
    watchlistLinkVerified?: Record<string, boolean>;
    /** Optional per-post duplicate / workflow hints for timeliness scoring. */
    signalScoringHints?: Record<string, SignalScoringHints>;
  },
): AICompanionOutput {
  const now = options?.now ?? new Date();
  const maxRecommendations = options?.maxRecommendations ?? 14;
  const preferenceProfile = options?.preferenceProfile ?? createDefaultRecommendationPreferenceProfile();
  const feedTab = options?.feedTab;
  const investigatorDirectory = options?.investigatorDirectory;
  const watchlistLinkVerified = options?.watchlistLinkVerified;
  const signalScoringHints = options?.signalScoringHints;

  const posts = (signals ?? []).slice();
  const byId = new Map(posts.map((p) => [p.id, p]));

  const refOrgConvergenceByDoi = buildReferenceOrgConvergenceByDoi(posts);
  const doiCounts = new Map<string, number>();
  for (const p of posts) {
    for (const d of extractDois(p.text)) {
      doiCounts.set(d, (doiCounts.get(d) ?? 0) + 1);
    }
  }

  const scores = posts.map((p) => postEngagementScore(p));
  const sortedScores = [...scores].sort((a, b) => a - b);
  const median = sortedScores.length ? sortedScores[Math.floor(sortedScores.length / 2)] ?? 0 : 0;
  const highBar = engagementHighBar(feedTab, median);
  const othersSuperBar = othersEngagementSuperBar(feedTab, median, highBar);

  const ampBoost = amplifyConfidenceBoost(preferenceProfile);
  const respBoost = respondConfidenceBoost(preferenceProfile);
  const audienceFactor = audienceConfidenceFactor(feedTab);

  const recs: SignalRecommendation[] = [];

  for (const p of posts) {
    const urls = extractHttpUrlsFromText(p.text);
    const features = extractSignalFeatures(p);
    const doiList = extractDois(p.text);
    const duplicateInBatch = doiList.some((d) => (doiCounts.get(d) ?? 0) > 1);
    const scoringHints: SignalScoringHints = {
      ...signalScoringHints?.[p.id],
      isDuplicate: signalScoringHints?.[p.id]?.isDuplicate ?? duplicateInBatch,
    };
    const hybridExplanation = computeHybridScoringExplanation({
      post: p,
      features,
      investigatorDirectory,
      watchlistLinkVerified,
      feedTab,
      now,
      preferenceProfile,
      referenceOrgConvergenceCount: convergenceCountForPost(p, refOrgConvergenceByDoi),
      hints: scoringHints,
    });
    const pub = looksLikePublication(urls, p.text);
    const milestone = features.hasCommunityMilestone || hasMilestoneLanguage(p.text);
    const engagement = postEngagementScore(p);
    const unusuallyHigh = engagement >= highBar;
    const honorInvestigatorHigh = investigatorHonorAffinity(p, investigatorDirectory);
    const investigatorNewsHigh = investigatorRepostedNewsAffinity(p, investigatorDirectory);

    /** Original poster’s handle or post text (e.g. corresponding-author line) ties to your tracked investigators. */
    const publicationLinkedToRoster =
      authorMatchesInvestigatorDirectory(p, investigatorDirectory) ||
      strongInvestigatorPaperAffinity(p, investigatorDirectory);

    /**
     * Investigators tab + repost: a roster member surfaced someone else’s publication-style post, but the
     * corresponding author / poster is not on your watchlist and the copy doesn’t tie to roster names — treat as
     * third-party content, not a program publication signal.
     */
    const listsRepostExternalPublication =
      feedTab === "lists" &&
      directoryHasPeopleRoster(investigatorDirectory) &&
      Boolean(p.repostedBy) &&
      pub &&
      !publicationLinkedToRoster &&
      !honorInvestigatorHigh;

    let pubForAmplify = pub && !listsRepostExternalPublication;
    let investigatorNewsForAmplify = investigatorNewsHigh && !listsRepostExternalPublication;

    /** Publication amplify uses Admin People as ground truth: author on roster, verified link copy, or corresponding-author line + roster last name (no URL case). */
    if (directoryHasPeopleRoster(investigatorDirectory)) {
      const dir = investigatorDirectory!;
      const paperBelongsToInvestigator =
        authorMatchesInvestigatorDirectory(p, dir) ||
        (urls.length > 0 && watchlistLinkVerified?.[p.id] === true) ||
        (urls.length === 0 && investigatorLastNameInCorrespondingContext(p.text, dir.lastNames));
      if (!paperBelongsToInvestigator) {
        pubForAmplify = false;
      }
    }

    if (directoryHasRoster(investigatorDirectory)) {
      if (urls.length > 0) {
        if (watchlistLinkVerified?.[p.id] !== true) {
          investigatorNewsForAmplify = false;
        }
      } else if (investigatorNewsForAmplify) {
        if (!publicationLinkedToRoster && !honorInvestigatorHigh) {
          investigatorNewsForAmplify = false;
        }
      }
    }

    let allowAmplify =
      pubForAmplify || unusuallyHigh || honorInvestigatorHigh || investigatorNewsForAmplify;
    if (feedTab === "following" && allowAmplify && !pubForAmplify) {
      allowAmplify =
        honorInvestigatorHigh ||
        investigatorNewsHigh ||
        milestone ||
        pubForAmplify ||
        unusuallyHigh ||
        hasOthersElevatedSignal(features, p.text) ||
        engagement >= othersSuperBar ||
        Boolean(features.hasGrant || features.hasEvent || features.hasRecruitment || features.hasAward);
    }

    const hybridAmplifyGate =
      hybridExplanation.internalScore >= 45 && hybridExplanation.category !== "Low Value";
    allowAmplify = allowAmplify && hybridAmplifyGate;

    const review = scoreReviewNeeded(p, features, preferenceProfile);
    if (review) {
      const legConf = clamp01(Math.min(0.95, 0.55 + review.score / 120));
      recs.push({
        id: stableId("rec", [p.id, "risk"]),
        type: "Review Needed",
        priority: review.score >= 55 ? "high" : "medium",
        valueCategory: hybridExplanation.category,
        confidenceLabel: hybridExplanation.confidence,
        scoringExplanation: hybridExplanation,
        confidence: clamp01(legConf),
        title: review.title,
        rationale: review.rationale,
        triggerReasonCodes: review.primaryCodes,
        reviewScore: review.score,
        signalIds: [p.id],
        platforms: [p.platform],
        sourceHandles: [p.authorHandle],
        linkedPeople: [],
        linkedPrograms: [],
        suggestedActions: ["Send for Review", "Save for Later", "Ignore"],
        createdAt: now.toISOString(),
        status: "new",
      });
    }

    const reviewRiskEmitted = Boolean(review);

    let allowRespond = !reviewRiskEmitted && (milestone || honorInvestigatorHigh || investigatorNewsForAmplify);
    if (allowRespond && feedTab === "following") {
      allowRespond =
        honorInvestigatorHigh ||
        investigatorNewsHigh ||
        milestone ||
        pubForAmplify ||
        unusuallyHigh ||
        hasOthersElevatedSignal(features, p.text) ||
        Boolean(features.hasGrant || features.hasEvent || features.hasRecruitment || features.hasAward);
    }
    allowRespond = allowRespond && hybridExplanation.internalScore >= 40;

    let amplifyDraft: {
      title: string;
      rationale: string;
      whyItMatters: string;
      nextStepEditorial: string;
      priority: RecommendationPriority;
      confidence: number;
      suggestedActions: RecommendationAction[];
    } | null = null;

    if (allowAmplify) {
      const title =
        pubForAmplify ? "Publication signal"
        : honorInvestigatorHigh ? "Award or honor"
        : investigatorNewsForAmplify ? "News or institutional feature"
        : "High engagement signal";

      const editorial = buildAmplifyEditorial({
        post: p,
        feedTab,
        pubForAmplify,
        honorInvestigatorHigh,
        investigatorNewsForAmplify,
        unusuallyHigh,
      });
      const amplifyPriority: RecommendationPriority =
        pubForAmplify || unusuallyHigh || honorInvestigatorHigh || investigatorNewsForAmplify ? "high" : "medium";
      const honorBoost = honorInvestigatorHigh || investigatorNewsForAmplify ? 0.07 : 0;
      const legacyConf =
        ((pubForAmplify ? 0.72 : 0.62) + (unusuallyHigh ? 0.12 : 0) + honorBoost) * ampBoost * audienceFactor;
      amplifyDraft = {
        title,
        rationale: editorial.whyItMatters,
        whyItMatters: editorial.whyItMatters,
        nextStepEditorial: editorial.nextStepEditorial,
        priority: priorityFromValueCategory(hybridExplanation.category, amplifyPriority),
        confidence: clamp01(legacyConf),
        suggestedActions: ["Add to Digest", "Save for Later"],
      };
    }

    let respondDraft: {
      title: string;
      rationale: string;
      whyItMatters: string;
      nextStepEditorial: string;
      priority: RecommendationPriority;
      confidence: number;
      suggestedActions: RecommendationAction[];
    } | null = null;

    if (allowRespond) {
      const respondPriority: RecommendationPriority =
        feedTab === "lists" || feedTab === "mentions" || honorInvestigatorHigh || investigatorNewsForAmplify
          ? "high"
          : "medium";
      const legacyResp =
        (0.64 +
          (unusuallyHigh ? 0.08 : 0) +
          (honorInvestigatorHigh || investigatorNewsForAmplify ? 0.06 : 0)) *
        respBoost *
        audienceFactor;
      const editorial = buildRespondEditorial({
        post: p,
        feedTab,
        honorInvestigatorHigh,
        investigatorNewsForAmplify,
      });
      respondDraft = {
        title: "Opportunity to respond",
        rationale: editorial.whyItMatters,
        whyItMatters: editorial.whyItMatters,
        nextStepEditorial: editorial.nextStepEditorial,
        priority: priorityFromValueCategory(hybridExplanation.category, respondPriority),
        confidence: clamp01(legacyResp),
        suggestedActions: ["Save for Later", "Mark Complete"],
      };
    }

    const commonRec = {
      valueCategory: hybridExplanation.category,
      confidenceLabel: hybridExplanation.confidence,
      scoringExplanation: hybridExplanation,
      signalIds: [p.id],
      platforms: [p.platform],
      sourceHandles: [p.authorHandle],
      linkedPeople: [],
      linkedPrograms: [],
      createdAt: now.toISOString(),
      status: "new" as const,
    };

    if (amplifyDraft && respondDraft) {
      const merged = mergeAmplifyRespondEditorial({
        whyItMatters: amplifyDraft.whyItMatters,
        nextStepEditorial: amplifyDraft.nextStepEditorial,
      });
      recs.push({
        id: stableId("rec", [p.id, "amplify-respond"]),
        type: "Amplify & Respond",
        ...commonRec,
        priority: pickHigherRecommendationPriority(amplifyDraft.priority, respondDraft.priority),
        confidence: clamp01(Math.max(amplifyDraft.confidence, respondDraft.confidence)),
        title: amplifyDraft.title,
        rationale: merged.whyItMatters,
        whyItMatters: merged.whyItMatters,
        nextStepEditorial: merged.nextStepEditorial,
        suggestedActions: mergeRecommendationActions(amplifyDraft.suggestedActions, respondDraft.suggestedActions),
      });
    } else if (amplifyDraft) {
      recs.push({
        id: stableId("rec", [p.id, "amplify"]),
        type: "Amplify",
        ...commonRec,
        priority: amplifyDraft.priority,
        confidence: amplifyDraft.confidence,
        title: amplifyDraft.title,
        rationale: amplifyDraft.rationale,
        whyItMatters: amplifyDraft.whyItMatters,
        nextStepEditorial: amplifyDraft.nextStepEditorial,
        suggestedActions: amplifyDraft.suggestedActions,
      });
    } else if (respondDraft) {
      recs.push({
        id: stableId("rec", [p.id, "respond"]),
        type: "Respond",
        ...commonRec,
        priority: respondDraft.priority,
        confidence: respondDraft.confidence,
        title: respondDraft.title,
        rationale: respondDraft.rationale,
        whyItMatters: respondDraft.whyItMatters,
        nextStepEditorial: respondDraft.nextStepEditorial,
        suggestedActions: respondDraft.suggestedActions,
      });
    }
  }

  const kws = topKeywords(posts);
  const themeBuckets = new Map<string, { label: string; ids: string[] }>();
  for (const k of kws) {
    const ids: string[] = [];
    for (const p of posts) {
      const t = p.text.toLowerCase();
      if (t.includes(k.replace(/^#/, "")) || t.includes(k)) ids.push(p.id);
    }
    if (ids.length >= 3) {
      const label = k.startsWith("#") ? k.slice(1) : k;
      themeBuckets.set(k, { label, ids: [...new Set(ids)] });
    }
  }

  const themes: ThemeCluster[] = [...themeBuckets.entries()]
    .map(([k, v]) => {
      const topPeople = v.ids
        .map((id) => byId.get(id)?.authorHandle ?? "")
        .filter(Boolean)
        .slice(0, 3);
      return {
        id: stableId("theme", [k]),
        label: v.label.replace(/-/g, " "),
        signalIds: v.ids,
        count: v.ids.length,
        topPeople: [...new Set(topPeople)],
        suggestedActions: ["Create Theme Summary", "Add to Digest"] as const,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const authorCounts = new Map<string, { count: number; ids: string[]; platform: SocialPost["platform"]; name: string }>();
  for (const p of posts) {
    const key = `${p.platform}:${p.authorHandle.toLowerCase()}`;
    const cur = authorCounts.get(key) ?? { count: 0, ids: [], platform: p.platform, name: p.authorName };
    cur.count += 1;
    cur.ids.push(p.id);
    authorCounts.set(key, cur);
  }
  const watchlist: WatchlistSuggestion[] = [...authorCounts.entries()]
    .filter(([, v]) => v.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([key, v]) => {
      const handle = key.split(":").slice(1).join(":");
      return {
        id: stableId("watch", [key]),
        handle,
        displayName: v.name,
        platform: v.platform,
        reason: `Appeared ${v.count}× in the current feed window.`,
        confidence: clamp01(0.55 + Math.min(0.35, (v.count - 3) * 0.12)),
        signalIds: v.ids.slice(0, 10),
      };
    });

  const typeRank: Record<RecommendationType, number> = {
    "Review Needed": 1,
    Amplify: 2,
    "Amplify & Respond": 2,
    Respond: 2,
    "Convert to Content": 4,
    "Link People": 5,
    "Add to Watchlist": 6,
    "Fill Content Gap": 7,
    Prioritize: 8,
    "Next Action": 9,
  };
  const prRank: Record<RecommendationPriority, number> = { high: 1, medium: 2, low: 3 };

  const recsWithPrefs = recs.map((r) =>
    applyPreferenceConfidence(r, preferenceProfile, byId, investigatorDirectory),
  );
  const filtered = applyUserFeedbackAdjustments(recsWithPrefs, preferenceProfile, byId);

  const recommendations = filtered
    .sort((a, b) => {
      const scoreA = a.scoringExplanation?.internalScore ?? -1;
      const scoreB = b.scoringExplanation?.internalScore ?? -1;
      if (scoreB !== scoreA) return scoreB - scoreA;
      const pr = (prRank[a.priority] ?? 9) - (prRank[b.priority] ?? 9);
      if (pr !== 0) return pr;
      const conf = (b.confidence ?? 0) - (a.confidence ?? 0);
      if (conf !== 0) return conf;
      const tr = (typeRank[a.type] ?? 99) - (typeRank[b.type] ?? 99);
      if (tr !== 0) return tr;
      return a.id.localeCompare(b.id);
    })
    .slice(0, maxRecommendations);

  return { recommendations, themes, watchlist };
}
