import {
  authorMatchesInvestigatorDirectory,
  buildInvestigatorSocialDirectory,
  honorOrAwardLanguage,
  investigatorLastNameInCorrespondingContext,
  normalizeBlueskyHandle,
  normalizeXUsername,
  reposterMatchesInvestigatorDirectory,
} from "@/lib/social-signals/ai-companion/investigator-directory";
import { looksLikePublication } from "@/lib/social-signals/ai-companion/signal-features";
import type { SocialPost } from "@/lib/social-signals/types";
import type { ItemCategory } from "@/types/database";

export type TrackedEntityForPostMatch = {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  x_handle: string | null;
  bluesky_handle: string | null;
  x_lab_handle?: string | null;
  bluesky_lab_handle?: string | null;
};

export type ResolvedPostInvestigators = {
  /** Primary PI on `source_items.tracked_entity_id` */
  primaryId: string | null;
  /** All matched investigators (primary first) */
  ids: string[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function entityXHandles(e: TrackedEntityForPostMatch): string[] {
  const out: string[] = [];
  if (e.x_handle?.trim()) out.push(normalizeXUsername(e.x_handle));
  if (e.x_lab_handle?.trim()) out.push(normalizeXUsername(e.x_lab_handle));
  return out.filter(Boolean);
}

function entityBlueskyHandles(e: TrackedEntityForPostMatch): string[] {
  const out: string[] = [];
  if (e.bluesky_handle?.trim()) out.push(normalizeBlueskyHandle(e.bluesky_handle));
  if (e.bluesky_lab_handle?.trim()) out.push(normalizeBlueskyHandle(e.bluesky_lab_handle));
  return out.filter(Boolean);
}

function matchEntityBySocialHandle(
  entities: TrackedEntityForPostMatch[],
  platform: SocialPost["platform"],
  rawHandle: string,
): TrackedEntityForPostMatch | null {
  const handle =
    platform === "x" ? normalizeXUsername(rawHandle) : normalizeBlueskyHandle(rawHandle);
  if (!handle) return null;
  for (const e of entities) {
    const handles = platform === "x" ? entityXHandles(e) : entityBlueskyHandles(e);
    if (handles.includes(handle)) return e;
  }
  return null;
}

function matchEntitiesByLastNameInText(
  entities: TrackedEntityForPostMatch[],
  text: string,
  correspondingOnly: boolean,
): TrackedEntityForPostMatch[] {
  const lastNames = entities
    .map((e) => e.last_name?.trim().toLowerCase())
    .filter((ln): ln is string => Boolean(ln && ln.length >= 2));
  if (!lastNames.length) return [];
  if (correspondingOnly && !investigatorLastNameInCorrespondingContext(text, lastNames)) return [];

  const lower = text.toLowerCase();
  const hits: TrackedEntityForPostMatch[] = [];
  for (const e of entities) {
    const ln = e.last_name?.trim().toLowerCase();
    if (!ln || ln.length < 2) continue;
    if (lower.includes(ln)) hits.push(e);
  }
  return hits;
}

function matchEntityByDisplayName(
  entities: TrackedEntityForPostMatch[],
  displayName: string,
): TrackedEntityForPostMatch | null {
  const dn = displayName.trim().toLowerCase();
  if (!dn) return null;
  for (const e of entities) {
    const name = e.name.trim().toLowerCase();
    const full = `${e.first_name} ${e.last_name}`.trim().toLowerCase();
    if (name && dn.includes(name)) return e;
    if (full.length > 3 && dn.includes(full)) return e;
    const ln = e.last_name?.trim().toLowerCase();
    if (ln && ln.length >= 3 && dn.includes(ln)) return e;
  }
  return null;
}

/** Match post author to roster (handle, display name, or "First Last" prefix before credentials). */
function matchAuthorEntity(
  entities: TrackedEntityForPostMatch[],
  post: SocialPost,
): TrackedEntityForPostMatch | null {
  const byHandle = matchEntityBySocialHandle(entities, post.platform, post.authorHandle);
  if (byHandle) return byHandle;

  if (post.authorName?.trim()) {
    const byName = matchEntityByDisplayName(entities, post.authorName);
    if (byName) return byName;

    const authorNorm = post.authorName.trim().toLowerCase().replace(/\s+/g, " ");
    const authorCore = authorNorm.split(/[|,(@]/)[0]?.trim() ?? authorNorm;
    for (const e of entities) {
      const full = `${e.first_name} ${e.last_name}`.trim().toLowerCase();
      const rosterName = e.name.trim().toLowerCase();
      if (full && (authorCore === full || authorCore.startsWith(full) || full.startsWith(authorCore))) {
        return e;
      }
      if (rosterName && (authorCore === rosterName || authorCore.startsWith(rosterName))) {
        return e;
      }
    }
  }

  return null;
}

/** Investigator posting about their own award (no third-person name in body). */
function readsLikeFirstPersonHonorOrAward(text: string): boolean {
  const t = (text || "").toLowerCase();
  if (/\b(truly|such|what) an honor to\b/.test(t)) return true;
  if (/\b(honou?r to (receive|accept|share)|proud to (receive|share|announce)|humbled to (receive|accept)|thrilled to (receive|announce)|delighted to (receive|share)|blessed to receive|grateful to receive)\b/.test(t)) {
    return true;
  }
  if (/\b(i am|i'm) (honored|humbled|thrilled|delighted|proud|excited|grateful)\b/.test(t)) return true;
  if (/\b(i|we) (received|was honored|were honored)\b/.test(t)) return true;
  return false;
}

/** Investigators named in post copy (honoree, PI, etc.) — stronger than last-name-only. */
function matchEntitiesByNameInPostText(
  entities: TrackedEntityForPostMatch[],
  text: string,
): TrackedEntityForPostMatch[] {
  const scored: { entity: TrackedEntityForPostMatch; score: number }[] = [];

  for (const e of entities) {
    const first = e.first_name?.trim();
    const last = e.last_name?.trim();
    if (!last || last.length < 2) continue;

    let score = 0;
    const full = `${first ?? ""} ${last}`.trim();
    if (full.length > 3) {
      const fullRe = new RegExp(`\\b${escapeRegExp(full)}\\b`, "i");
      if (fullRe.test(text)) score = Math.max(score, 100);
    }
    if (first && first.length >= 2) {
      const firstLastRe = new RegExp(
        `\\b${escapeRegExp(first)}\\s+${escapeRegExp(last)}\\b`,
        "i",
      );
      if (firstLastRe.test(text)) score = Math.max(score, 95);
    }
    const drFullRe =
      first && first.length >= 2
        ? new RegExp(`\\bDr\\.?\\s+${escapeRegExp(first)}\\s+${escapeRegExp(last)}\\b`, "i")
        : null;
    if (drFullRe?.test(text)) score = Math.max(score, 98);

    const drLastRe = new RegExp(`\\bDr\\.?\\s+${escapeRegExp(last)}\\b`, "i");
    if (drLastRe.test(text)) score = Math.max(score, 85);

    const lastRe = new RegExp(`\\b${escapeRegExp(last)}\\b`, "i");
    if (score === 0 && lastRe.test(text)) score = 40;

    if (score > 0) scored.push({ entity: e, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const out: TrackedEntityForPostMatch[] = [];
  const seen = new Set<string>();
  for (const { entity, score } of scored) {
    if (score < 40 || seen.has(entity.id)) continue;
    seen.add(entity.id);
    out.push(entity);
  }
  return out;
}

/** Strong name-in-copy match (honoree / PI), not last-name-only. */
function isStrongHonoreeNameMatch(
  entity: Pick<TrackedEntityForPostMatch, "first_name" | "last_name" | "name">,
  text: string,
): boolean {
  const matches = matchEntitiesByNameInPostText(
    [{ ...entity, id: "x", x_handle: null, bluesky_handle: null }],
    text,
  );
  return matches.length > 0;
}

export function digestDisplayInvestigators<
  T extends { id: string; name: string; first_name: string; last_name: string },
>(item: {
  category: string | null;
  title: string;
  raw_summary?: string | null;
  investigators: T[];
  primary_tracked_entity_id?: string | null;
}): T[] {
  if (item.category !== "award" || item.investigators.length === 0) {
    return item.investigators;
  }
  const text = `${item.title}\n${item.raw_summary ?? ""}`.trim();
  if (!text) return item.investigators;

  const honorees = item.investigators.filter((inv) => isStrongHonoreeNameMatch(inv, text));
  if (honorees.length > 0) return honorees;

  if (item.primary_tracked_entity_id) {
    const primary = item.investigators.find((i) => i.id === item.primary_tracked_entity_id);
    if (primary && isStrongHonoreeNameMatch(primary, text)) return [primary];
  }

  return item.investigators.slice(0, 1);
}

function mergeUniqueEntities(
  lists: TrackedEntityForPostMatch[][],
): TrackedEntityForPostMatch[] {
  const out: TrackedEntityForPostMatch[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const e of list) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
  }
  return out;
}

/** Map a social post to watchlist investigators; primary is the signal subject, not the reposter. */
export function resolveInvestigatorsForSocialPost(
  post: SocialPost,
  entities: TrackedEntityForPostMatch[],
): ResolvedPostInvestigators {
  if (!entities.length) return { primaryId: null, ids: [] };

  const category = inferItemCategoryFromSocialPost(post);
  const honorLike = category === "award" || honorOrAwardLanguage(post.text);
  const dir = buildInvestigatorSocialDirectory(entities);

  const subjectsFromText = mergeUniqueEntities([
    matchEntitiesByNameInPostText(entities, post.text),
    matchEntitiesByLastNameInText(entities, post.text, true),
  ]);

  const authorEntity = matchAuthorEntity(entities, post);

  const surfacers: TrackedEntityForPostMatch[] = [];
  if (post.repostedBy?.handle) {
    const m = matchEntityBySocialHandle(entities, post.platform, post.repostedBy.handle);
    if (m) surfacers.push(m);
  }
  if (post.repostedBy?.displayName) {
    const m = matchEntityByDisplayName(entities, post.repostedBy.displayName);
    if (m && !surfacers.some((s) => s.id === m.id)) surfacers.push(m);
  }
  if (authorEntity && !surfacers.some((s) => s.id === authorEntity.id)) {
    surfacers.push(authorEntity);
  }

  const authorOnRoster = Boolean(authorEntity) || authorMatchesInvestigatorDirectory(post, dir);
  const reposterOnRoster = reposterMatchesInvestigatorDirectory(post, dir);
  const firstPersonHonor = readsLikeFirstPersonHonorOrAward(post.text);
  const authorIsSelf =
    !post.repostedBy ||
    (authorEntity &&
      matchEntityBySocialHandle(entities, post.platform, post.repostedBy.handle)?.id === authorEntity.id);

  let ordered: TrackedEntityForPostMatch[];

  if (
    honorLike &&
    authorEntity &&
    (firstPersonHonor || authorIsSelf) &&
    subjectsFromText.length === 0
  ) {
    ordered = [authorEntity];
  } else if (subjectsFromText.length > 0) {
    if (honorLike) {
      // Named honoree in copy — do not attach faculty who only surfaced / reshared the post.
      ordered = subjectsFromText;
    } else {
      const subjectIds = new Set(subjectsFromText.map((s) => s.id));
      const secondarySurfacers = surfacers.filter((s) => !subjectIds.has(s.id));
      ordered = [...subjectsFromText, ...secondarySurfacers];
    }
  } else if (honorLike && !authorOnRoster && reposterOnRoster) {
    // Institutional honor post reshared by a roster member — do not assign PI to reposter alone.
    const loose = matchEntitiesByLastNameInText(entities, post.text, false);
    if (loose.length === 1) {
      ordered = loose;
    } else {
      ordered = [];
    }
  } else if (honorLike) {
    ordered = subjectsFromText.length > 0 ? subjectsFromText : [];
  } else {
    ordered = mergeUniqueEntities([
      surfacers,
      matchEntitiesByLastNameInText(entities, post.text, true),
    ]);
    if (ordered.length === 0) {
      const loose = matchEntitiesByLastNameInText(entities, post.text, false);
      if (loose.length === 1) ordered = loose;
    }
    if (ordered.length === 0) {
      if (authorEntity) ordered = [authorEntity];
      else if (dir && (reposterOnRoster || authorOnRoster)) {
        const handle = post.repostedBy?.handle?.trim() || post.authorHandle?.trim() || "";
        if (handle) {
          const m = matchEntityBySocialHandle(entities, post.platform, handle);
          if (m) ordered = [m];
        }
      }
    }
  }

  const ids = ordered.map((e) => e.id);
  return { primaryId: ids[0] ?? null, ids };
}

export function inferItemCategoryFromSocialPost(post: SocialPost): ItemCategory {
  const text = post.text || "";
  const lower = text.toLowerCase();
  const urls = (text.match(/\bhttps?:\/\/[^\s)]+/gi) ?? []).map((u) => u.replace(/[).,;]+$/g, ""));

  if (looksLikePublication(urls, text)) return "paper";
  if (
    honorOrAwardLanguage(lower) ||
    /\b(an honor to receive|honored to receive|exchange award)\b/i.test(lower)
  ) {
    return "award";
  }
  if (/\b(grant|funding|R0[0-9]|RF1|RFA)\b/i.test(lower)) return "funding";
  if (/\b(symposium|conference|webinar|seminar|grand rounds)\b/i.test(lower)) return "event";
  if (/\b(podcast|interview|press release|media)\b/i.test(lower)) return "media";
  return "community_update";
}
