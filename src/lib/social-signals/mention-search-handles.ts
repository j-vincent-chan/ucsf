import type { InvestigatorSocialDirectory } from "@/lib/social-signals/ai-companion/investigator-directory";
import {
  normalizeBlueskyHandle,
  normalizeXUsername,
} from "@/lib/social-signals/ai-companion/investigator-directory";
import type { SocialFeedWorkspaceConfig } from "@/lib/workspace-social-settings";

/** Handles to query for Live listening → Mentions (community + watchlist investigators). */
export function buildMentionSearchHandles(
  workspaceCfg?: SocialFeedWorkspaceConfig | null,
  investigators?: InvestigatorSocialDirectory | null,
): { xHandles: string[]; blueskyHandles: string[] } {
  const xSet = new Set<string>();
  const bskySet = new Set<string>();

  const commX = workspaceCfg?.communityHandle?.trim();
  if (commX) xSet.add(normalizeXUsername(commX));

  const commBsky = workspaceCfg?.blueskyIdentifier?.trim();
  if (commBsky) bskySet.add(normalizeBlueskyHandle(commBsky));

  if (investigators) {
    for (const h of investigators.xHandles) {
      if (h.trim()) xSet.add(normalizeXUsername(h));
    }
    for (const h of investigators.blueskyHandles) {
      if (h.trim()) bskySet.add(normalizeBlueskyHandle(h));
    }
  }

  return { xHandles: [...xSet], blueskyHandles: [...bskySet] };
}
