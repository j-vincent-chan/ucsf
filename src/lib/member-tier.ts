import type { MemberStatus } from "@/types/database";

/** Priority tier is fixed by membership: Leadership → 1, Member → 2, Associate → 3. */
export function tierFromMemberStatus(
  status: MemberStatus | string | null | undefined,
): 1 | 2 | 3 {
  if (status === "leadership_committee") return 1;
  if (status === "member" || status === "full_member") return 2;
  return 3;
}
