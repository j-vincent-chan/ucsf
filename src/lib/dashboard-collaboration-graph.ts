import type { ItemCategory } from "@/types/database";
import type { DashboardEntityMeta, DashboardPayload } from "@/lib/dashboard-aggregate";
import Graph from "graphology";
import louvain from "graphology-communities-louvain";

export type CollaborationClusterMode = "research_focus" | "disease_area" | "collaboration_cluster";

const COLLAB_CATEGORIES: Set<ItemCategory | null> = new Set(["paper", "funding"]);

function formatTaxonomyLabel(raw: string): string {
  const s = raw.trim();
  if (!s) return "Unknown";
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function clusterKeyForMode(
  mode: CollaborationClusterMode,
  meta: DashboardEntityMeta | undefined,
): string {
  if (!meta) return "Unknown";
  if (mode === "research_focus") return formatTaxonomyLabel(meta.entity_type);
  if (mode === "disease_area") return formatTaxonomyLabel(meta.member_status);
  return "Unknown";
}

/** Louvain communities on the collaboration graph; stable human labels by size. */
function clusterLabelByNodeFromLouvain(
  nodeIds: string[],
  links: CollaborationGraphLink[],
): Map<string, string> {
  const out = new Map<string, string>();
  if (nodeIds.length === 0) return out;

  if (links.length === 0) {
    const label = "No co-listed signals in range";
    for (const id of nodeIds) out.set(id, label);
    return out;
  }

  const g = new Graph({ type: "undirected" });
  for (const id of nodeIds) {
    if (!g.hasNode(id)) g.addNode(id);
  }
  for (const { source, target, value } of links) {
    if (source === target) continue;
    if (!g.hasNode(source) || !g.hasNode(target)) continue;
    if (g.hasEdge(source, target)) {
      const w = (g.getEdgeAttribute(source, target, "weight") as number) ?? 0;
      g.setEdgeAttribute(source, target, "weight", w + value);
    } else {
      g.addEdge(source, target, { weight: value });
    }
  }

  louvain.assign(g, { getEdgeWeight: "weight" });

  const rawByNode = new Map<string, number>();
  for (const id of nodeIds) {
    const c = g.getNodeAttribute(id, "community") as number | undefined;
    rawByNode.set(id, typeof c === "number" ? c : 0);
  }

  const members = new Map<number, string[]>();
  for (const id of nodeIds) {
    const cid = rawByNode.get(id) ?? 0;
    const arr = members.get(cid) ?? [];
    arr.push(id);
    members.set(cid, arr);
  }

  const sortedIds = [...members.keys()].sort((a, b) => {
    const na = members.get(a)?.length ?? 0;
    const nb = members.get(b)?.length ?? 0;
    if (nb !== na) return nb - na;
    return a - b;
  });

  const idToLabel = new Map<number, string>();
  sortedIds.forEach((cid, idx) => {
    idToLabel.set(cid, `Cluster ${idx + 1}`);
  });

  for (const id of nodeIds) {
    const cid = rawByNode.get(id) ?? 0;
    out.set(id, idToLabel.get(cid) ?? "Cluster 1");
  }
  return out;
}

/** Stable saturated HSL from string (Dimensions-style variety). */
export function colorForClusterKey(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = Math.abs(h) % 360;
  const sat = 58 + (Math.abs(h >> 8) % 18);
  const light = 48 + (Math.abs(h >> 16) % 10);
  return `hsl(${hue} ${sat}% ${light}%)`;
}

export type CollaborationGraphNode = {
  id: string;
  name: string;
  clusterKey: string;
  color: string;
  val: number;
};

export type CollaborationGraphLink = {
  source: string;
  target: string;
  value: number;
};

export type CollaborationLegendEntry = {
  key: string;
  color: string;
  count: number;
};

export type CollaborationGraphBundle = {
  nodes: CollaborationGraphNode[];
  links: CollaborationGraphLink[];
  legend: CollaborationLegendEntry[];
  /** Shared pub/funding signals with ≥2 investigators in range */
  collaborationItemCount: number;
};

type VolumeItem = DashboardPayload["itemsForVolume"][number];

function entityIdsOnItem(item: VolumeItem): string[] {
  const ids =
    item.tracked_entity_ids?.length && item.tracked_entity_ids.length > 0
      ? item.tracked_entity_ids
      : item.tracked_entity_id
        ? [item.tracked_entity_id]
        : [];
  return [...new Set(ids)];
}

/**
 * Co-authorship / co-PI edges from publications + funding signals in the given item set.
 */
export function buildCollaborationGraphBundle(
  items: VolumeItem[],
  entityNameById: Record<string, string>,
  entityMetaById: Record<string, DashboardEntityMeta>,
  clusterMode: CollaborationClusterMode,
  deletingIds?: Set<string>,
): CollaborationGraphBundle {
  const linkMap = new Map<string, number>();
  const nodeSignalCount = new Map<string, number>();
  let collaborationItemCount = 0;

  for (const item of items) {
    if (deletingIds?.has(item.id)) continue;
    if (!COLLAB_CATEGORIES.has(item.category ?? null)) continue;

    const ids = entityIdsOnItem(item);
    for (const id of ids) {
      nodeSignalCount.set(id, (nodeSignalCount.get(id) ?? 0) + 1);
    }
    if (ids.length < 2) continue;
    collaborationItemCount += 1;
    const sorted = [...ids].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        const k = `${a}\0${b}`;
        linkMap.set(k, (linkMap.get(k) ?? 0) + 1);
      }
    }
  }

  const nodeIds = new Set<string>(nodeSignalCount.keys());
  for (const k of linkMap.keys()) {
    const [a, b] = k.split("\0");
    if (a) nodeIds.add(a);
    if (b) nodeIds.add(b);
  }

  const links: CollaborationGraphLink[] = [];
  for (const [pair, value] of linkMap) {
    const [source, target] = pair.split("\0");
    if (!source || !target || value < 1) continue;
    links.push({ source, target, value });
  }

  const nodeIdList = [...nodeIds];
  const clusterByNode =
    clusterMode === "collaboration_cluster"
      ? clusterLabelByNodeFromLouvain(nodeIdList, links)
      : null;

  const degreeById = new Map<string, number>();
  for (const pair of linkMap.keys()) {
    const [a, b] = pair.split("\0");
    if (a) degreeById.set(a, (degreeById.get(a) ?? 0) + 1);
    if (b) degreeById.set(b, (degreeById.get(b) ?? 0) + 1);
  }

  const clusterCounts = new Map<string, { color: string; count: number }>();
  const nodes: CollaborationGraphNode[] = [];
  for (const id of nodeIds) {
    const meta = entityMetaById[id];
    const clusterKey =
      clusterMode === "collaboration_cluster"
        ? (clusterByNode?.get(id) ?? "Cluster 1")
        : clusterKeyForMode(clusterMode, meta);
    const color = colorForClusterKey(clusterKey);
    const prev = clusterCounts.get(clusterKey);
    if (prev) prev.count += 1;
    else clusterCounts.set(clusterKey, { color, count: 1 });

    const degree = degreeById.get(id) ?? 0;
    const base = 2 + Math.min(10, degree * 1.2);
    const val = Math.max(base, 1 + (nodeSignalCount.get(id) ?? 0) * 0.35);

    nodes.push({
      id,
      name: entityNameById[id]?.trim() || "Unknown",
      clusterKey,
      color,
      val,
    });
  }

  const legend: CollaborationLegendEntry[] = [...clusterCounts.entries()]
    .map(([key, v]) => ({ key, color: v.color, count: v.count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  return { nodes, links, legend, collaborationItemCount };
}
