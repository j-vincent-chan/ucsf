import { redirect } from "next/navigation";
import { currentYearMonth } from "@/lib/digest-month";

export default function DigestIndexPage() {
  redirect(`/digest/${currentYearMonth()}`);
}
