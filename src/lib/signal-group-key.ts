import { createHash } from "node:crypto";
import type { SourceType } from "@/types/database";
import { canonicalNihProjectNumForDedup } from "@/lib/nih-project-num";

/**
 * Canonical PubMed permalink for dedupe — stable across trailing slashes, legacy ncbi host, Europe PMC MED,
 * query strings (pubmed.ncbi…/123?utm=…).
 * Must align with Postgres public.normalize_source_url_for_dedup.
 */
export function canonicalPubMedArticleUrl(url: string): string | null {
  const trimmed = url.trim().toLowerCase();
  const med = trimmed.match(/^https?:\/\/europepmc\.org\/article\/med\/(\d{4,})\b/i);
  if (med?.[1]) return `https://pubmed.ncbi.nlm.nih.gov/${med[1]}/`;

  try {
    const withProto = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./, "");

    const pathFirstSeg = (): string | null => {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length === 1 && /^\d{4,}$/.test(parts[0]!)) return parts[0]!;
      return null;
    };

    if (host === "pubmed.ncbi.nlm.nih.gov") {
      const id = pathFirstSeg();
      if (id) return `https://pubmed.ncbi.nlm.nih.gov/${id}/`;
      return null;
    }

    if (host.endsWith("ncbi.nlm.nih.gov")) {
      const m = u.pathname.match(/^\/pubmed\/(\d{4,})(?:\/|$)/i);
      if (m?.[1]) return `https://pubmed.ncbi.nlm.nih.gov/${m[1]}/`;
    }
  } catch {
    /* non-absolute URL strings fall through */
  }

  const looseLegacy = trimmed.match(/^https?:\/\/[^/\s]+\.ncbi\.nlm\.nih\.gov\/pubmed\/(\d{4,})(?:\/|$|[?#])/i);
  if (looseLegacy?.[1]) return `https://pubmed.ncbi.nlm.nih.gov/${looseLegacy[1]}/`;

  return null;
}

/**
 * Per-workspace dedupe key when `source_url` resolves to a PubMed article PMID.
 * Pairs with `signal_group_key`: older rows may use title|day keys while discovery uses `url:<md5>`;
 * both still share the same PMID.
 */
export function pubMedPmidDedupKey(
  communityId: string,
  sourceUrl: string | null | undefined,
): string | null {
  if (!communityId || !sourceUrl?.trim()) return null;
  const canon = canonicalPubMedArticleUrl(sourceUrl);
  if (!canon) return null;
  const m = canon.match(/\/(\d{4,})\/?$/);
  const pmid = m?.[1];
  if (!pmid) return null;
  return `${communityId}|pmid:${pmid}`;
}

/** Strip fragment + query; lowercase; PubMed PMID URLs collapse to canonical — must match Postgres. */
export function normalizeSourceUrlForDedup(url: string): string | null {
  const t = url.trim().toLowerCase();
  if (t.length < 8) return null;
  const pubmedCanon = canonicalPubMedArticleUrl(t);
  const base = pubmedCanon ?? t;
  const noHash = base.replace(/[#].*$/, "");
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
