import type { DashboardEntityMeta, DashboardPayload } from "@/lib/dashboard-aggregate";
import { effectiveMonthKey } from "@/lib/dashboard-aggregate";
import { colorForClusterKey } from "@/lib/dashboard-collaboration-graph";
import Graph from "graphology";
import louvain from "graphology-communities-louvain";

export type LandscapeTimePreset = "10y" | "5y" | "2y" | "12m" | "90d";

export type LandscapeEdgeMode =
  | "co_publications"
  | "shared_grants"
  | "shared_topics"
  | "co_mentions"
  | "all_shared_signals";

export type LandscapeNetworkLens =
  | "collaboration_communities"
  | "research_topic"
  | "program_affiliation"
  | "publication_overlap"
  | "funding_overlap"
  | "emerging_signals"
  | "strategic_opportunity";

export type LandscapeColorBy = "cluster" | "program" | "role" | "topic" | "activity";

export type LandscapeSizeBy =
  | "total_signals"
  | "publications"
  | "grants"
  | "collaborator_count"
  | "centrality"
  | "recent_activity";

type VolumeItem = DashboardPayload["itemsForVolume"][number];

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "as",
  "by",
  "with",
  "from",
  "into",
  "via",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "we",
  "our",
  "their",
  "they",
  "study",
  "studies",
  "patients",
  "patient",
  "cell",
  "cells",
  "using",
  "based",
  "new",
  "novel",
  "high",
  "human",
  "model",
  "models",
  "role",
  "roles",
]);

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function landscapeRangeStartYm(
  preset: LandscapeTimePreset,
  now = new Date(),
): string | null {
  if (preset === "90d") return null;
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth() + 1;
  const backMonths =
    preset === "12m" ? 11 : preset === "2y" ? 23 : preset === "5y" ? 59 : 119;
  const d = new Date(Date.UTC(y, mo - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - backMonths);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

export function volumeItemRefMs(item: VolumeItem): number {
  const raw = item.published_at ?? item.found_at ?? item.created_at;
  const t = typeof raw === "string" ? Date.parse(raw) : NaN;
  return Number.isFinite(t) ? t : 0;
}

export function filterLandscapeItems(
  items: VolumeItem[],
  preset: LandscapeTimePreset,
  deletingIds: Set<string>,
  now = new Date(),
): VolumeItem[] {
  const startYm = landscapeRangeStartYm(preset, now);
  const cutoff90 = preset === "90d" ? now.getTime() - 90 * 86400000 : null;
  return items.filter((it) => {
    if (deletingIds.has(it.id)) return false;
    if (cutoff90 != null) return volumeItemRefMs(it) >= cutoff90;
    if (!startYm) return true;
    return effectiveMonthKey(it) >= startYm;
  });
}

export function volumeEntityIds(item: VolumeItem): string[] {
  const ids =
    item.tracked_entity_ids?.length && item.tracked_entity_ids.length > 0
      ? item.tracked_entity_ids
      : item.tracked_entity_id
        ? [item.tracked_entity_id]
        : [];
  return [...new Set(ids)];
}

function tokenizeTitle(title: string): string[] {
  const raw = title.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  return raw.filter((w) => !STOP.has(w));
}

function weightedJaccard(a: Map<string, number>, b: Map<string, number>): number {
  let inter = 0;
  let union = 0;
  const keys = new Set<string>([...a.keys(), ...b.keys()]);
  for (const k of keys) {
    const va = a.get(k) ?? 0;
    const vb = b.get(k) ?? 0;
    inter += Math.min(va, vb);
    union += Math.max(va, vb);
  }
  return union > 0 ? inter / union : 0;
}

function assignLouvainLabels(nodeIds: string[], edges: { a: string; b: string; w: number }[]): Map<string, string> {
  const out = new Map<string, string>();
  if (nodeIds.length === 0) return out;
  if (edges.length === 0) {
    const label = "Singleton";
    for (const id of nodeIds) out.set(id, label);
    return out;
  }
  const g = new Graph({ type: "undirected" });
  for (const id of nodeIds) {
    if (!g.hasNode(id)) g.addNode(id);
  }
  for (const { a, b, w } of edges) {
    if (a === b || !g.hasNode(a) || !g.hasNode(b)) continue;
    if (g.hasEdge(a, b)) {
      const prev = (g.getEdgeAttribute(a, b, "weight") as number) ?? 0;
      g.setEdgeAttribute(a, b, "weight", prev + w);
    } else {
      g.addEdge(a, b, { weight: w });
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
  const sortedIds = [...members.keys()].sort((x, y) => {
    const nx = members.get(x)?.length ?? 0;
    const ny = members.get(y)?.length ?? 0;
    if (ny !== nx) return ny - nx;
    return x - y;
  });
  const idToLabel = new Map<number, string>();
  sortedIds.forEach((cid, idx) => idToLabel.set(cid, `Cluster ${idx + 1}`));
  for (const id of nodeIds) {
    const cid = rawByNode.get(id) ?? 0;
    out.set(id, idToLabel.get(cid) ?? "Cluster 1");
  }
  return out;
}

function dominantTopicLabel(weights: Map<string, number>): string {
  let best = "";
  let max = 0;
  for (const [k, v] of weights) {
    if (v > max) {
      max = v;
      best = k;
    }
  }
  return best ? best.replace(/\b\w/g, (c) => c.toUpperCase()) : "Mixed focus";
}

function formatProgram(meta: DashboardEntityMeta | undefined): string {
  if (!meta) return "Unknown program";
  const inst = meta.institution?.trim();
  const tier = meta.member_status?.trim().replace(/_/g, " ");
  if (inst && tier) return `${inst} · ${tier}`;
  return inst || tier || "Unknown program";
}

function formatRole(meta: DashboardEntityMeta | undefined): string {
  if (!meta) return "Unknown role";
  return meta.entity_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export type LandscapeLink = {
  source: string;
  target: string;
  strength: number;
  sharedPapers: number;
  sharedGrants: number;
  sharedTopicScore: number;
  sharedOther: number;
  emergingShare: number;
  recentSignalIds: string[];
};

export type LandscapeNodeMetrics = {
  id: string;
  name: string;
  program: string;
  role: string;
  institution: string | null;
  signalsCollab: number;
  publications: number;
  grants: number;
  collaboratorCount: number;
  weightedDegree: number;
  centrality: number;
  bridgeScore: number;
  recentActivity: number;
  topTopics: string[];
  dominantTopic: string;
  louvainCluster: string;
  topicCommunity: string;
  opportunityScore: number;
};

export type LandscapeClusterSummary = {
  key: string;
  /** Derived from dominant topics in the cluster */
  displayName: string;
  color: string;
  investigatorCount: number;
  sharedSignalCount: number;
  /** Sum of publication-linked signals across members (not deduped papers). */
  totalPublications: number;
  /** Sum of funding-linked signals across members. */
  totalGrants: number;
  topTopics: string[];
  topInvestigators: { id: string; name: string; score: number }[];
  bridgeInvestigators: { id: string; name: string; bridge: number }[];
  recentActivity: number;
  strategicSummary: string;
};

export type LandscapeOpportunity = {
  type: string;
  investigatorIds: string[];
  investigatorNames: string[];
  rationale: string;
  evidence: string;
  suggestedAction: string;
  score: number;
};

export type CollaborationLandscapeModel = {
  preset: LandscapeTimePreset;
  edgeMode: LandscapeEdgeMode;
  nodes: LandscapeNodeMetrics[];
  links: LandscapeLink[];
  linksDisplay: LandscapeLink[];
  clusterSummaries: LandscapeClusterSummary[];
  opportunities: LandscapeOpportunity[];
  global: {
    investigatorCount: number;
    clusterCount: number;
    sharedSignals: number;
    edgesDisplay: number;
    strongestCluster: string;
    bridgeLeaders: { id: string; name: string; bridge: number }[];
    emergingCollaborations: number;
  };
  rangeMidMs: number;
  /** True when graph is likely hard to read */
  isSparse: boolean;
  sparseHint: string;
};

function normalize01(v: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(1, v / max);
}

function buildTopicProfiles(items: VolumeItem[], deletingIds: Set<string>): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const it of items) {
    if (deletingIds.has(it.id)) continue;
    const tokens = tokenizeTitle(it.title ?? "");
    if (tokens.length === 0) continue;
    const ids = volumeEntityIds(it);
    for (const id of ids) {
      let inner = map.get(id);
      if (!inner) {
        inner = new Map();
        map.set(id, inner);
      }
      for (const t of tokens) {
        inner.set(t, (inner.get(t) ?? 0) + 1);
      }
    }
  }
  return map;
}

function topTokens(weights: Map<string, number>, n: number): string[] {
  return [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

function buildTopicAffinityEdges(
  profiles: Map<string, Map<string, number>>,
  maxPerNode: number,
): { a: string; b: string; w: number }[] {
  const ids = [...profiles.keys()].sort();
  const edges: { a: string; b: string; w: number }[] = [];
  const seen = new Set<string>();
  for (const i of ids) {
    const pi = profiles.get(i);
    if (!pi) continue;
    const scored: { j: string; s: number }[] = [];
    for (const j of ids) {
      if (j <= i) continue;
      const pj = profiles.get(j);
      if (!pj) continue;
      const s = weightedJaccard(pi, pj);
      if (s < 0.07) continue;
      let inter = 0;
      for (const [k, v] of pi) {
        if ((pj.get(k) ?? 0) > 0) inter += Math.min(v, pj.get(k)!);
      }
      if (inter < 2) continue;
      scored.push({ j, s });
    }
    scored.sort((x, y) => y.s - x.s);
    for (const row of scored.slice(0, maxPerNode)) {
      const a = i;
      const b = row.j;
      const key = a < b ? `${a}\0${b}` : `${b}\0${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a, b, w: Math.max(0.35, row.s * 8) });
    }
  }
  return edges;
}

type PairAgg = {
  papers: number;
  grants: number;
  other: number;
  items: VolumeItem[];
};

export function buildCollaborationLandscapeModel(args: {
  items: VolumeItem[];
  preset: LandscapeTimePreset;
  edgeMode: LandscapeEdgeMode;
  deletingIds: Set<string>;
  entityNameById: Record<string, string>;
  entityMetaById: Record<string, DashboardEntityMeta>;
  minEdgeStrength: number;
  now?: Date;
}): CollaborationLandscapeModel {
  const now = args.now ?? new Date();
  const items = filterLandscapeItems(args.items, args.preset, args.deletingIds, now);
  const rangeStartMs =
    args.preset === "90d"
      ? now.getTime() - 90 * 86400000
      : new Date(`${landscapeRangeStartYm(args.preset, now) ?? "1970-01"}-01T00:00:00Z`).getTime();
  const rangeMidMs = rangeStartMs + (now.getTime() - rangeStartMs) / 2;

  const pairMap = new Map<string, PairAgg>();
  const signalCollab = new Map<string, number>();
  const pubs = new Map<string, number>();
  const grantsMap = new Map<string, number>();
  const recentActivity = new Map<string, number>();

  const bumpRecent = (id: string, it: VolumeItem) => {
    const ms = volumeItemRefMs(it);
    if (ms >= rangeMidMs) {
      recentActivity.set(id, (recentActivity.get(id) ?? 0) + 1);
    }
  };

  let sharedSignals = 0;

  for (const it of items) {
    if (args.deletingIds.has(it.id)) continue;
    const cat = it.category ?? null;
    const ids = volumeEntityIds(it);
    const collabCat = cat === "paper" || cat === "funding";
    if (collabCat) {
      for (const id of ids) {
        signalCollab.set(id, (signalCollab.get(id) ?? 0) + 1);
        bumpRecent(id, it);
      }
      if (cat === "paper") {
        for (const id of ids) pubs.set(id, (pubs.get(id) ?? 0) + 1);
      }
      if (cat === "funding") {
        for (const id of ids) grantsMap.set(id, (grantsMap.get(id) ?? 0) + 1);
      }
    }

    if (ids.length < 2) continue;

    if (cat === "paper" || cat === "funding") {
      sharedSignals += 1;
    }

    let includePair = false;
    if (args.edgeMode === "co_publications" && cat === "paper") includePair = true;
    else if (args.edgeMode === "shared_grants" && cat === "funding") includePair = true;
    else if (args.edgeMode === "all_shared_signals" && (cat === "paper" || cat === "funding"))
      includePair = true;
    else if (args.edgeMode === "co_mentions" && cat !== null) includePair = true;

    if (!includePair || args.edgeMode === "shared_topics") continue;

    const sorted = [...ids].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        const key = `${a}\0${b}`;
        let agg = pairMap.get(key);
        if (!agg) {
          agg = { papers: 0, grants: 0, other: 0, items: [] };
          pairMap.set(key, agg);
        }
        if (cat === "paper") agg.papers += 1;
        if (cat === "funding") agg.grants += 1;
        if (args.edgeMode === "co_mentions" && cat !== "paper" && cat !== "funding") agg.other += 1;
        agg.items.push(it);
      }
    }
  }

  const topicProfiles = buildTopicProfiles(items, args.deletingIds);
  let topicEdges: { a: string; b: string; w: number }[] = [];
  if (args.edgeMode === "shared_topics") {
    topicEdges = buildTopicAffinityEdges(topicProfiles, 14);
  }

  const linksRaw: LandscapeLink[] = [];

  if (args.edgeMode === "shared_topics") {
    for (const e of topicEdges) {
      const pi = topicProfiles.get(e.a);
      const pj = topicProfiles.get(e.b);
      const jacc = pi && pj ? weightedJaccard(pi, pj) : 0;
      linksRaw.push({
        source: e.a,
        target: e.b,
        strength: e.w,
        sharedPapers: 0,
        sharedGrants: 0,
        sharedTopicScore: jacc,
        sharedOther: 0,
        emergingShare: 0,
        recentSignalIds: [],
      });
    }
  } else {
    for (const [key, agg] of pairMap) {
      const [sa, sb] = key.split("\0");
      if (!sa || !sb) continue;
      let strength = 0;
      if (args.edgeMode === "co_publications") strength = agg.papers;
      else if (args.edgeMode === "shared_grants") strength = agg.grants;
      else if (args.edgeMode === "co_mentions") strength = agg.papers + agg.grants + agg.other;
      else strength = agg.papers + agg.grants;

      if (strength <= 0) continue;

      let emerging = 0;
      for (const it of agg.items) {
        if (volumeItemRefMs(it) >= rangeMidMs) emerging += 1;
      }
      const emergingShare = agg.items.length ? emerging / agg.items.length : 0;

      const pi = topicProfiles.get(sa);
      const pj = topicProfiles.get(sb);
      const topicScore = pi && pj ? weightedJaccard(pi, pj) : 0;

      linksRaw.push({
        source: sa,
        target: sb,
        strength,
        sharedPapers: agg.papers,
        sharedGrants: agg.grants,
        sharedTopicScore: topicScore,
        sharedOther: agg.other,
        emergingShare,
        recentSignalIds: agg.items.filter((it) => volumeItemRefMs(it) >= rangeMidMs).map((it) => it.id),
      });
    }
  }

  const linksDisplay = linksRaw.filter((l) => l.strength >= args.minEdgeStrength);

  const nodeIds = new Set<string>();
  for (const id of signalCollab.keys()) nodeIds.add(id);
  for (const l of linksDisplay) {
    nodeIds.add(l.source);
    nodeIds.add(l.target);
  }

  const louvainEdges = linksDisplay.map((l) => ({
    a: l.source,
    b: l.target,
    w: l.strength,
  }));
  const louvainLabels = assignLouvainLabels([...nodeIds], louvainEdges);

  const topicClusterEdges = buildTopicAffinityEdges(topicProfiles, 10);
  const topicLouvain = assignLouvainLabels([...topicProfiles.keys()], topicClusterEdges);

  const adj = new Map<string, Set<string>>();
  const weightedNeighbor = new Map<string, number>();
  for (const l of linksDisplay) {
    if (!adj.has(l.source)) adj.set(l.source, new Set());
    if (!adj.has(l.target)) adj.set(l.target, new Set());
    adj.get(l.source)!.add(l.target);
    adj.get(l.target)!.add(l.source);
    weightedNeighbor.set(l.source, (weightedNeighbor.get(l.source) ?? 0) + l.strength);
    weightedNeighbor.set(l.target, (weightedNeighbor.get(l.target) ?? 0) + l.strength);
  }

  let maxW = 1;
  for (const w of weightedNeighbor.values()) maxW = Math.max(maxW, w);

  const nodes: LandscapeNodeMetrics[] = [];
  for (const id of nodeIds) {
    const meta = args.entityMetaById[id];
    const name = args.entityNameById[id]?.trim() || "Unknown";
    const profile = topicProfiles.get(id) ?? new Map<string, number>();
    const topics = topTokens(profile, 6);
    const wc = weightedNeighbor.get(id) ?? 0;
    const cc = adj.get(id)?.size ?? 0;
    const lc = louvainLabels.get(id) ?? "Cluster 1";
    const tc = topicLouvain.get(id) ?? lc;

    let bridge = 0;
    const neigh = adj.get(id);
    const clusterNeighbors = new Map<string, number>();
    if (neigh) {
      for (const nb of neigh) {
        const nbCluster = louvainLabels.get(nb) ?? "";
        clusterNeighbors.set(nbCluster, (clusterNeighbors.get(nbCluster) ?? 0) + 1);
        if (nbCluster !== lc) bridge += 1;
      }
    }
    const bridgeScore =
      cc > 0 ? bridge / cc : clusterNeighbors.size > 1 ? 0.35 : 0;

    const opp =
      normalize01(topicProfiles.get(id)?.size ?? 0, 40) * 0.35 +
      normalize01(cc, 24) * 0.25 +
      normalize01(bridgeScore, 1) * 0.4;

    nodes.push({
      id,
      name,
      program: formatProgram(meta),
      role: formatRole(meta),
      institution: meta?.institution ?? null,
      signalsCollab: signalCollab.get(id) ?? 0,
      publications: pubs.get(id) ?? 0,
      grants: grantsMap.get(id) ?? 0,
      collaboratorCount: cc,
      weightedDegree: wc,
      centrality: normalize01(wc, maxW),
      bridgeScore,
      recentActivity: recentActivity.get(id) ?? 0,
      topTopics: topics,
      dominantTopic: dominantTopicLabel(profile),
      louvainCluster: lc,
      topicCommunity: tc,
      opportunityScore: opp,
    });
  }

  const maxBridge = Math.max(1e-6, ...nodes.map((n) => n.bridgeScore));
  const maxCentrality = Math.max(1e-6, ...nodes.map((n) => n.centrality));
  const maxRecent = Math.max(1, ...nodes.map((n) => n.recentActivity));

  for (const n of nodes) {
    n.opportunityScore =
      normalize01(n.centrality, maxCentrality) * 0.28 +
      normalize01(n.bridgeScore, maxBridge) * 0.34 +
      normalize01(n.recentActivity, maxRecent) * 0.22 +
      Math.min(1, n.topTopics.length / 6) * 0.16;
  }

  const byCluster = new Map<string, LandscapeNodeMetrics[]>();
  for (const n of nodes) {
    const arr = byCluster.get(n.louvainCluster) ?? [];
    arr.push(n);
    byCluster.set(n.louvainCluster, arr);
  }

  const clusterSummaries: LandscapeClusterSummary[] = [...byCluster.entries()].map(([key, members]) => {
    const topicHist = new Map<string, number>();
    let recent = 0;
    for (const m of members) {
      recent += m.recentActivity;
      for (const t of m.topTopics.slice(0, 3)) {
        topicHist.set(t, (topicHist.get(t) ?? 0) + 1);
      }
    }
    const topTopics = [...topicHist.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => t.replace(/\b\w/g, (c) => c.toUpperCase()));
    const topInv = [...members]
      .sort((a, b) => b.weightedDegree - a.weightedDegree)
      .slice(0, 5)
      .map((m) => ({ id: m.id, name: m.name, score: m.weightedDegree }));
    const bridgeInv = [...members]
      .sort((a, b) => b.bridgeScore - a.bridgeScore)
      .slice(0, 4)
      .map((m) => ({ id: m.id, name: m.name, bridge: m.bridgeScore }));
    const label =
      topTopics[0] && topTopics.length >= 2
        ? `${topTopics[0]} · ${topTopics[1]}`
        : topTopics[0] ?? key;
    let totalPublications = 0;
    let totalGrants = 0;
    for (const m of members) {
      totalPublications += m.publications;
      totalGrants += m.grants;
    }
    const strategicSummary =
      members.length >= 8
        ? `Dense community (${members.length} investigators) with shared signals — strong candidate for coordinated outreach or center-scale proposals.`
        : members.length <= 3
          ? `Small cluster — consider bridging introductions to adjacent communities.`
          : `Mid-sized collaboration fabric (${members.length} investigators); monitor emerging edges for partnership timing.`;

    return {
      key,
      displayName: label,
      color: colorForClusterKey(key),
      investigatorCount: members.length,
      sharedSignalCount: 0,
      totalPublications,
      totalGrants,
      topTopics,
      topInvestigators: topInv,
      bridgeInvestigators: bridgeInv,
      recentActivity: recent,
      strategicSummary,
    };
  });

  // Fix sharedSignalCount per cluster (approximate by internal edges)
  const internalSignals = new Map<string, number>();
  for (const l of linksDisplay) {
    const ca = louvainLabels.get(l.source);
    const cb = louvainLabels.get(l.target);
    if (ca && ca === cb) {
      internalSignals.set(ca, (internalSignals.get(ca) ?? 0) + l.strength);
    }
  }
  for (const c of clusterSummaries) {
    c.sharedSignalCount = Math.round(internalSignals.get(c.key) ?? 0);
  }

  const opportunities: LandscapeOpportunity[] = [];
  const directPairs = new Set(linksDisplay.map((l) => {
    const a = l.source < l.target ? l.source : l.target;
    const b = l.source < l.target ? l.target : l.source;
    return `${a}\0${b}`;
  }));

  const idsSorted = [...nodeIds]
    .sort((a, b) => (signalCollab.get(b) ?? 0) - (signalCollab.get(a) ?? 0))
    .slice(0, 140)
    .sort();
  for (let i = 0; i < idsSorted.length; i++) {
    for (let j = i + 1; j < idsSorted.length; j++) {
      const a = idsSorted[i]!;
      const b = idsSorted[j]!;
      const key = `${a}\0${b}`;
      if (directPairs.has(key)) continue;
      const pi = topicProfiles.get(a);
      const pj = topicProfiles.get(b);
      if (!pi || !pj) continue;
      const jac = weightedJaccard(pi, pj);
      if (jac < 0.18) continue;
      const na = args.entityNameById[a]?.trim() ?? "Unknown";
      const nb = args.entityNameById[b]?.trim() ?? "Unknown";
      opportunities.push({
        type: "Latent topical overlap",
        investigatorIds: [a, b],
        investigatorNames: [na, nb],
        rationale: "Strong shared language in signal titles without a direct co-listed collaboration edge in this view.",
        evidence: `Weighted topic similarity ~${(jac * 100).toFixed(0)}%; both appear in the selected horizon.`,
        suggestedAction: "Facilitate an introduction around a concrete shared manuscript or dataset.",
        score: jac,
      });
    }
  }
  opportunities.sort((x, y) => y.score - x.score);
  const opportunitiesTrim = opportunities.slice(0, 40);

  const bridgeLeaders = [...nodes]
    .sort((a, b) => b.bridgeScore - a.bridgeScore)
    .slice(0, 6)
    .map((n) => ({ id: n.id, name: n.name, bridge: n.bridgeScore }));

  const strongestCluster =
    clusterSummaries.sort((a, b) => b.investigatorCount - a.investigatorCount)[0]?.key ?? "—";

  const emergingCollaborations = linksDisplay.filter((l) => l.emergingShare >= 0.45).length;

  const isSparse = nodes.length > 0 && (linksDisplay.length < Math.max(3, Math.floor(nodes.length * 0.35)));
  const sparseHint =
    "Try widening the time horizon, lowering the minimum edge strength, switching edge type to “All shared signals” or “Co-mentions”, or using topic-based edges to reveal latent similarity.";

  return {
    preset: args.preset,
    edgeMode: args.edgeMode,
    nodes,
    links: linksRaw,
    linksDisplay,
    clusterSummaries: clusterSummaries.sort((a, b) => b.investigatorCount - a.investigatorCount),
    opportunities: opportunitiesTrim,
    global: {
      investigatorCount: nodes.length,
      clusterCount: clusterSummaries.length,
      sharedSignals,
      edgesDisplay: linksDisplay.length,
      strongestCluster,
      bridgeLeaders,
      emergingCollaborations,
    },
    rangeMidMs,
    isSparse,
    sparseHint,
  };
}

export function landscapeNodeColor(
  n: LandscapeNodeMetrics,
  colorBy: LandscapeColorBy,
  activityRank01: number,
): string {
  if (colorBy === "program") return colorForClusterKey(n.program);
  if (colorBy === "role") return colorForClusterKey(n.role);
  if (colorBy === "topic") return colorForClusterKey(n.dominantTopic);
  if (colorBy === "activity") {
    const h = 210 + activityRank01 * 88;
    const l = 38 + (1 - activityRank01) * 22;
    return `hsl(${h} 62% ${l}%)`;
  }
  return colorForClusterKey(n.louvainCluster);
}

export function landscapeNodeVal(n: LandscapeNodeMetrics, sizeBy: LandscapeSizeBy, maxima: Maxima): number {
  switch (sizeBy) {
    case "total_signals":
      return Math.max(1.5, Math.sqrt(n.signalsCollab + 1) * 3.2);
    case "publications":
      return Math.max(1.5, Math.sqrt(n.publications + 1) * 3.4);
    case "grants":
      return Math.max(1.5, Math.sqrt(n.grants + 1) * 3.5);
    case "collaborator_count":
      return Math.max(1.5, Math.sqrt(n.collaboratorCount + 1) * 3.6);
    case "centrality":
      return Math.max(1.5, 4 + n.centrality * maxima.centralityScale);
    case "recent_activity":
      return Math.max(1.5, 3.5 + (n.recentActivity / maxima.recentMax) * 14);
    default:
      return 4;
  }
}

export type Maxima = { centralityScale: number; recentMax: number };

export function computeMaxima(nodes: LandscapeNodeMetrics[]): Maxima {
  const recentMax = Math.max(1, ...nodes.map((n) => n.recentActivity));
  return { centralityScale: 22, recentMax };
}
