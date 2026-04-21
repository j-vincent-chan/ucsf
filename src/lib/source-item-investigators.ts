export type InvestigatorChip = {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  lab_website: string | null;
};

function parseTe(
  raw: unknown,
): { id: string; name: string; first_name: string; last_name: string; lab_website: string | null } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  if (!id) return null;
  return {
    id,
    name: typeof o.name === "string" ? o.name : "",
    first_name: typeof o.first_name === "string" ? o.first_name : "",
    last_name: typeof o.last_name === "string" ? o.last_name : "",
    lab_website: typeof o.lab_website === "string" ? o.lab_website : null,
  };
}

/** Build a deduped, sorted list from primary `tracked_entities` plus junction rows. */
export function investigatorsFromSourceItemRow(
  trackedEntities: unknown,
  junctionRows: unknown,
): InvestigatorChip[] {
  const map = new Map<string, InvestigatorChip>();

  const primary = Array.isArray(trackedEntities)
    ? parseTe(trackedEntities[0])
    : parseTe(trackedEntities);
  if (primary) {
    map.set(primary.id, primary);
  }

  const rows = Array.isArray(junctionRows) ? junctionRows : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const te = parseTe(
      (row as Record<string, unknown>).tracked_entities,
    );
    if (te) {
      map.set(te.id, te);
    }
  }

  return [...map.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
