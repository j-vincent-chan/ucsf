/** Match Postgres public.compute_duplicate_key for client-side dedup before insert. */
export function computeDuplicateKey(
  title: string,
  entityId: string | null,
  publishedAt: string | null,
): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const day =
    publishedAt && publishedAt.length >= 10
      ? publishedAt.slice(0, 10)
      : "nodate";
  const ent = entityId ?? "none";
  return `${normalized}|${ent}|${day}`;
}
