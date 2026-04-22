import type { ItemArchiveReason } from "@/types/database";

/**
 * Reasons shown when archiving (order: relevance → identity → housekeeping).
 * Legacy DB value `not_accurate` is not offered; see `archiveReasonFormOptions`.
 */
export const ARCHIVE_REASON_OPTIONS: { value: ItemArchiveReason; label: string }[] = [
  { value: "not_relevant", label: "Not relevant" },
  { value: "minor_signal", label: "Minor signal" },
  { value: "wrong_investigator", label: "Wrong investigator" },
  { value: "duplicate", label: "Duplicate or already captured" },
  { value: "outdated", label: "Outdated or superseded" },
  { value: "spam_or_noise", label: "Spam or noise" },
  { value: "other", label: "Other" },
];

export function isValidArchiveReason(v: string): v is ItemArchiveReason {
  return ARCHIVE_REASON_OPTIONS.some((o) => o.value === v);
}

/** Allow saving legacy rows that still have `not_accurate` until editors pick a new reason. */
export function isPersistableArchiveReason(v: string): boolean {
  return isValidArchiveReason(v) || v === "not_accurate";
}

/** Options for metadata form, including legacy value when present. */
export function archiveReasonFormOptions(currentReason: string): { value: string; label: string }[] {
  const base = ARCHIVE_REASON_OPTIONS.map((o) => ({ ...o }));
  if (currentReason === "not_accurate") {
    return [{ value: "not_accurate", label: "Legacy archive" }, ...base];
  }
  return base;
}

/** Human-readable label for queue; legacy `not_accurate` shows as generic archived in the table. */
export function archiveReasonLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code === "not_accurate") return null;
  const opt = ARCHIVE_REASON_OPTIONS.find((o) => o.value === code);
  if (opt) return opt.label;
  return code.replace(/_/g, " ");
}
