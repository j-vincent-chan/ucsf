/**
 * Signal `published_at` for NIH RePORTER and other date-only sources: calendar days in UTC
 * (matches RePORTER project start / award notice fields — not the viewer's local timezone).
 */

/** Parse RePORTER-style date strings (`YYYY-MM-DD` or datetime prefix) → UTC midnight ISO. */
export function parseCalendarDateUtcMidnightIso(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const head = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!head?.[1]) return null;
  const [ys, ms, ds] = head[1].split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt.toISOString();
}

/** `YYYY-MM-DD` from a stored timestamptz using the UTC calendar day. */
export function utcCalendarYmdFromIso(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso.length >= 10 ? iso.slice(0, 10) : "";
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Display label for Signals / Digest published date (RePORTER ground truth). */
export function formatSignalPublishedDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { timeZone: "UTC" });
}

/** Parse `<input type="date">` value as UTC midnight (dashboard month keys + RePORTER parity). */
export function dateInputValueToUtcMidnightIso(value: string): string | null {
  return parseCalendarDateUtcMidnightIso(value);
}
