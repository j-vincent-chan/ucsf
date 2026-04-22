import { redirect } from "next/navigation";
import { currentYearMonth, parseYearMonth } from "@/lib/digest-month";

export default async function DigestIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; start_month?: string; start?: string }>;
}) {
  const params = await searchParams;

  const rawMonth = params.month ?? params.start_month ?? params.start ?? currentYearMonth();
  const month = parseYearMonth(rawMonth.slice(0, 7)) ? rawMonth.slice(0, 7) : currentYearMonth();
  redirect(`/digest/${month}`);
}
