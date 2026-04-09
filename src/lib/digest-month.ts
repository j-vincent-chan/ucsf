/** `YYYY-MM` in UTC calendar month boundaries for DB filters. */
export function parseYearMonth(ym: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function monthRangeUtc(year: number, month: number): {
  startISO: string;
  endISO: string;
} {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

export function formatMonthHeading(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function currentYearMonth(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function recentYearMonths(count: number): { ym: string; label: string }[] {
  const out: { ym: string; label: string }[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    out.push({
      ym,
      label: new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
    });
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}
