export type InvestigatorMentionOption = {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  x_handle: string | null;
  bluesky_handle: string | null;
};

/** Prefer network-specific handle; fall back to the other when only one is set. */
export function resolveInsertHandle(opt: InvestigatorMentionOption, network: "bluesky" | "x"): string | null {
  const bx = opt.bluesky_handle?.replace(/^@+/, "").trim() || null;
  const xx = opt.x_handle?.replace(/^@+/, "").trim() || null;
  if (network === "bluesky") return bx ?? xx ?? null;
  return xx ?? bx ?? null;
}
