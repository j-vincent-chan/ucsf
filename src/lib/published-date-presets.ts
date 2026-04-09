/** YYYY-MM-DD in the user’s local calendar (matches `<input type="date">`). */
export function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type PublishedRangePreset =
  | "current_month"
  | "past_month"
  | "past_3_months"
  | "past_6_months";

/** Inclusive `from` / `to` for published-at filtering (local calendar days). */
export function rangeForPublishedPreset(
  preset: PublishedRangePreset,
  now = new Date(),
): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "current_month": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: formatLocalYmd(from), to: formatLocalYmd(today) };
    }
    case "past_month": {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: formatLocalYmd(from), to: formatLocalYmd(to) };
    }
    case "past_3_months": {
      const from = new Date(today);
      from.setMonth(from.getMonth() - 3);
      return { from: formatLocalYmd(from), to: formatLocalYmd(today) };
    }
    case "past_6_months": {
      const from = new Date(today);
      from.setMonth(from.getMonth() - 6);
      return { from: formatLocalYmd(from), to: formatLocalYmd(today) };
    }
  }
}
