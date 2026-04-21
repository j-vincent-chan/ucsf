import { createHash } from "node:crypto";
import type { SourceType } from "@/types/database";
import { canonicalNihProjectNumForDedup } from "@/lib/nih-project-num";

/** Strip fragment + query; lowercase — must match Postgres normalize_source_url_for_dedup. */
export function normalizeSourceUrlForDedup(url: string): string | null {
  const t = url.trim().toLowerCase();
  if (t.length < 8) return null;
  const noHash = t.replace(/[#].*$/, "");
  const noQuery = noHash.replace(/[?].*$/, "");
  return noQuery;
}

function utcCalendarDay(publishedAt: string | null): string {
  if (!publishedAt) return "nodate";
  const d = new Date(publishedAt);
  if (!Number.isFinite(d.getTime())) return "nodate";
  return d.toISOString().slice(0, 10);
}

/**
 * Match Postgres public.compute_signal_group_key:
 * RePORTER + ProjectNum: community|nih:<normalized ProjectNum>
 * URL path: community|url:<md5 hex of UTF-8 normalized URL>
 * Else: community|normalized title|UTC calendar day
 */
export function computeSignalGroupKey(
  communityId: string,
  title: string,
  publishedAt: string | null,
  sourceUrl?: string | null,
  sourceType?: SourceType | null,
  nihProjectNum?: string | null,
): string {
  if (sourceType === "reporter" && nihProjectNum?.trim()) {
    return `${communityId}|nih:${canonicalNihProjectNumForDedup(nihProjectNum)}`;
  }

  const nu = sourceUrl ? normalizeSourceUrlForDedup(sourceUrl) : null;
  if (nu && /^https?:\/\//i.test(nu)) {
    const h = createHash("md5").update(nu, "utf8").digest("hex");
    return `${communityId}|url:${h}`;
  }

  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const day = utcCalendarDay(publishedAt);
  return `${communityId}|${normalized}|${day}`;
}
