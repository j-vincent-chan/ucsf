import type { SocialPost } from "@/lib/social-signals/types";
import { looksLikePublication } from "./signal-features";

/** Built from community `tracked_entities` — used to gate reposts and authorship-weighted boosts. */
export type InvestigatorSocialDirectory = {
  /** Normalized X usernames without @ */
  xHandles: string[];
  /** Normalized Bluesky handles (e.g. user.bsky.social) */
  blueskyHandles: string[];
  /** Lowercase last names for corresponding-author line heuristics */
  lastNames: string[];
};

export function normalizeXUsername(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export function normalizeBlueskyHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export function authorMatchesInvestigatorDirectory(
  post: SocialPost,
  dir: InvestigatorSocialDirectory | undefined,
): boolean {
  if (!dir) return false;
  const xs = new Set(dir.xHandles);
  const bs = new Set(dir.blueskyHandles);
  if (post.platform === "x") {
    const u = normalizeXUsername(post.authorHandle);
    return u.length > 0 && xs.has(u);
  }
  const u = normalizeBlueskyHandle(post.authorHandle);
  return u.length > 0 && bs.has(u);
}

/** Retweet/repost booster — `repostedBy` is who amplified into the feed; author is often a third-party outlet. */
export function reposterMatchesInvestigatorDirectory(
  post: SocialPost,
  dir: InvestigatorSocialDirectory | undefined,
): boolean {
  if (!dir || !post.repostedBy?.handle) return false;
  const xs = new Set(dir.xHandles);
  const bs = new Set(dir.blueskyHandles);
  if (post.platform === "x") {
    const u = normalizeXUsername(post.repostedBy.handle);
    return u.length > 0 && xs.has(u);
  }
  const u = normalizeBlueskyHandle(post.repostedBy.handle);
  return u.length > 0 && bs.has(u);
}

function urlsInText(text: string): string[] {
  const t = text || "";
  const matches = t.match(/\bhttps?:\/\/[^\s)]+/gi) ?? [];
  return matches.map((m) => m.replace(/[).,;]+$/g, ""));
}

/**
 * Third-party news, video, or institutional/program spotlight copy (not necessarily a journal DOI).
 */
export function readsLikeInstitutionalNewsOrProgramFeature(text: string): boolean {
  const t = (text || "").replace(/&amp;/g, "&").toLowerCase();
  if (/\b(center\s+for|institute\s+for)\b/.test(t)) return true;
  if (/\b(ucsf|gladstone(?:inst)?|uc\s+san\s+francisco)\b/.test(t)) return true;
  if (/\b(breaking\s+silos|decoding\s+(?:the\s+)?(?:brain|immune))\b/.test(t)) return true;
  if (/\b(advancing\s+(?:new\s+)?therapies)\b/.test(t)) return true;
  if (/\b(neurodegeneration|brain\s+injury)\b/.test(t) && /\b(therapy|therapies|interface|inflammation)\b/.test(t))
    return true;
  if (/\b(press\s+release|news\s+story|featured\s+(?:story|video))\b/.test(t)) return true;
  if (/\b(video\s+highlight|watch\s+the\s+full)\b/.test(t)) return true;
  return false;
}

/**
 * Investigator on your roster reshared coverage (news, video, program spotlight, or publication link).
 * Uses `repostedBy` because the original author is usually an outlet or organization.
 */
export function investigatorRepostedNewsAffinity(
  post: SocialPost,
  dir: InvestigatorSocialDirectory | undefined,
): boolean {
  if (!dir || !reposterMatchesInvestigatorDirectory(post, dir)) return false;
  const text = post.text;
  const urls = urlsInText(text);
  if (looksLikePublication(urls, text)) return true;
  return readsLikeInstitutionalNewsOrProgramFeature(text);
}

/** Linked / promo posts often mention “corresponding author” lines (screenshots, quotes). */
export function textIndicatesCorrespondingRole(text: string): boolean {
  return /\b(co[-–]?\s*corresponding\s+authors?|co[-–]?\s*corresponding|corresponding\s+authors?|correspondence\s*:|corresp\.?\s*authors?|\*\s*corresponding|corresponding\s+:\s*)/i.test(
    text,
  );
}

export function investigatorLastNameInCorrespondingContext(text: string, lastNames: string[]): boolean {
  if (!textIndicatesCorrespondingRole(text) || lastNames.length === 0) return false;
  const lower = text.toLowerCase();
  return lastNames.some((ln) => {
    const L = ln.trim().toLowerCase();
    return L.length >= 2 && lower.includes(L);
  });
}

/**
 * Strong editorial signal: roster investigator posted it, or copy ties a roster last name to corresponding/co-corresponding wording.
 */
export function strongInvestigatorPaperAffinity(post: SocialPost, dir: InvestigatorSocialDirectory | undefined): boolean {
  if (!dir) return false;
  const hasRoster = dir.xHandles.length > 0 || dir.blueskyHandles.length > 0 || dir.lastNames.length > 0;
  if (!hasRoster) return false;
  if (authorMatchesInvestigatorDirectory(post, dir)) return true;
  if (dir.lastNames.length > 0 && investigatorLastNameInCorrespondingContext(post.text, dir.lastNames)) return true;
  return false;
}

export function directoryHasRoster(dir: InvestigatorSocialDirectory | undefined): boolean {
  if (!dir) return false;
  return dir.xHandles.length > 0 || dir.blueskyHandles.length > 0;
}

/** Admin People roster: any social handles or last names — ground truth for publication-style amplify. */
export function directoryHasPeopleRoster(dir: InvestigatorSocialDirectory | undefined): boolean {
  if (!dir) return false;
  if (dir.xHandles.length > 0 || dir.blueskyHandles.length > 0) return true;
  return dir.lastNames.some((ln) => ln.trim().length >= 2);
}

/** Award, honor, election, fellowship — broad enough for social copy (not strict NLP). */
export function honorOrAwardLanguage(text: string): boolean {
  const t = (text || "").toLowerCase();
  return /\b(award|awards|honored|honou?red|\bhonor\b|honorary|felicitations|congratulations|prize|prizes|medal|fellowship|fellowships|elected\s+(?:as|to|a)|named\s+(?:a\s+)?(?:fellow|chair)|lifetime\s+achievement|distinguished\s+(?:service|contribution|award)?|honoree|recognition\s+for)\b/i.test(
    t,
  );
}

/**
 * Post reads like announcing an opportunity (apply, program opening, recruitment) rather than
 * receiving recognition. HIGH honor boosting excludes these unless receipt language is also present.
 */
export function honorOpportunityAnnouncement(text: string): boolean {
  const t = (text || "").toLowerCase();
  if (
    /\b(?:apply|application|applications?\s+open|how\s+to\s+apply|seeking\s+applicants|seeking\s+a\s+|now\s+accepting|accepting\s+applications|nomination(?:s)?\s+open|call\s+for\s+applications|rfa\b|request\s+for\s+applications)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\b(?:join\s+our|we\s+(?:are|'re)\s+(?:hiring|recruiting)|now\s+hiring|postdoc\s+position|faculty\s+position|open\s+position|job\s+opening)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\b(?:fellowship|program)\s+(?:opportunity|opening|position|slot)\b/i.test(t)) return true;
  if (
    /\bexcited\s+to\s+announce\s+(?:this|a|the)\s+(?:special\s+)?(?:fellowship|training\s+program|program|opportunity)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\b(?:thrilled|delighted|pleased)\s+to\s+announce\s+(?:this|a|the)\s+(?:new\s+)?(?:fellowship|training\s+program|postdoc\s+program)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\bannounce\s+(?:this|a|the)\s+(?:new\s+)?(?:fellowship|postdoc)\s+(?:program|opportunity)\b/i.test(t)) return true;
  if (/\b(?:fellowship|award)\s+opportunity\b/i.test(t)) return true;
  return false;
}

/**
 * Copy strongly suggests someone received recognition (award, honor, election), not only promoting an opening.
 */
export function receivedHonorRecognitionLanguage(text: string): boolean {
  const t = (text || "").toLowerCase();
  return (
    /\b(?:honored\s+to\s+receive|grateful\s+(?:for|to\s+receive)|thrilled\s+to\s+share\s+that\s+(?:i|we)\s+(?:have\s+been|was|were)\s+(?:awarded|selected|named))\b/i.test(
      t,
    ) ||
    /\b(?:delighted|proud)\s+to\s+(?:share|announce)\s+that\s+(?:i|we)\s+(?:have\s+been|was|were)\s+(?:awarded|selected|named|elected)\b/i.test(
      t,
    ) ||
    /\b(?:recipient|co-recipient)\s+of\b/i.test(t) ||
    /\b(?:received|awarded)\s+the\s+/i.test(t) ||
    /\bwon\s+the\s+[\w\s]+\s+(?:award|prize|medal)\b/i.test(t) ||
    /\b(?:selected|chosen)\s+(?:as|for)\s+(?:the\s+)?(?:\d{4}\s+)?(?:recipient|winner|honoree)\b/i.test(t) ||
    /\belected\s+(?:to|as)\s+(?:the\s+)?(?:national\s+academy|nas\b|aaas|nasem|nam\b|iem\b)\b/i.test(t) ||
    /\bnamed\s+(?:a\s+)?(?:macarthur|guggenheim)\s+fellow\b/i.test(t) ||
    /\b(?:lifetime\s+achievement|distinguished\s+(?:service|contribution))\s+(?:award|honor|medal)\b/i.test(t) ||
    /\bthank\s+(?:you\s+)?(?:to\s+)?[@\w.]+\s+for\s+(?:this\s+)?(?:honor|award|recognition)\b/i.test(t) ||
    /\bcongratulations\s+to\s+(?:me|us|our\s+(?:lab|team|group))\b/i.test(t)
  );
}

/**
 * Award/honor-style post that ties to the roster: poster or reposter is on your handle list, or copy
 * places a roster last name in corresponding-author style lines. We intentionally do **not** treat a bare
 * substring match of a last name (e.g. honoree “Charles Long” vs a different investigator “Long”) as a tie.
 */
export function investigatorHonorAffinity(post: SocialPost, dir: InvestigatorSocialDirectory | undefined): boolean {
  if (!dir || !honorOrAwardLanguage(post.text)) return false;
  const body = post.text;
  if (honorOpportunityAnnouncement(body) && !receivedHonorRecognitionLanguage(body)) return false;

  const hasHandleRoster = dir.xHandles.length > 0 || dir.blueskyHandles.length > 0;
  const hasNames = dir.lastNames.length > 0;
  if (!hasHandleRoster && !hasNames) return false;
  if (hasHandleRoster) {
    if (authorMatchesInvestigatorDirectory(post, dir)) return true;
    if (post.repostedBy && reposterMatchesInvestigatorDirectory(post, dir)) {
      // Third-party author: only count as roster “honor” when copy clearly says someone *received* recognition.
      // Otherwise milestone words (fellowship, award in a science thread) + a repost would false-positive.
      if (!authorMatchesInvestigatorDirectory(post, dir) && !receivedHonorRecognitionLanguage(body)) return false;
      return true;
    }
  }
  if (hasNames && investigatorLastNameInCorrespondingContext(body, dir.lastNames)) return true;
  return false;
}

export function buildInvestigatorSocialDirectory(
  rows: { x_handle: string | null; bluesky_handle: string | null; last_name: string | null }[],
): InvestigatorSocialDirectory {
  const xs = new Set<string>();
  const bs = new Set<string>();
  const last = new Set<string>();
  for (const r of rows) {
    if (r.x_handle?.trim()) xs.add(normalizeXUsername(r.x_handle));
    if (r.bluesky_handle?.trim()) bs.add(normalizeBlueskyHandle(r.bluesky_handle));
    const ln = r.last_name?.trim();
    if (ln && ln.length >= 2) last.add(ln.toLowerCase());
  }
  return {
    xHandles: [...xs],
    blueskyHandles: [...bs],
    lastNames: [...last],
  };
}
