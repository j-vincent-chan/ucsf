"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, {
  type ForceGraphMethods as ForceGraphMethods2D,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d";
import ForceGraph3D, {
  type ForceGraphMethods as ForceGraphMethods3D,
} from "react-force-graph-3d";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import SpriteText from "three-spritetext";
import Link from "next/link";
import { toast } from "sonner";
import type { DashboardEntityMeta, DashboardPayload } from "@/lib/dashboard-aggregate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clusterPaletteForPreset,
  type GraphStylePreset,
  graphCanvasBackgroundClass,
  graphFloatingChromeClass,
  graphHintChipClass,
  GRAPH_STYLE_OPTIONS,
} from "@/lib/collaboration-landscape-graph-styles";
import {
  buildCollaborationLandscapeModel,
  computeMaxima,
  filterLandscapeItems,
  landscapeNodeColor,
  landscapeNodeVal,
  volumeEntityIds,
  volumeItemRefMs,
  type CollaborationLandscapeModel,
  type LandscapeClusterSummary,
  type LandscapeColorBy,
  type LandscapeEdgeMode,
  type LandscapeLink,
  type LandscapeNetworkLens,
  type LandscapeNodeMetrics,
  type LandscapeSizeBy,
  type LandscapeTimePreset,
} from "@/lib/collaboration-landscape-model";

type VolumeItem = DashboardPayload["itemsForVolume"][number];

const TIME_PRESETS: { id: LandscapeTimePreset; label: string }[] = [
  { id: "10y", label: "10 years" },
  { id: "5y", label: "5 years" },
  { id: "2y", label: "2 years" },
  { id: "12m", label: "12 months" },
  { id: "90d", label: "90 days" },
];

const EDGE_MODES: { id: LandscapeEdgeMode; label: string }[] = [
  { id: "co_publications", label: "Co-publications" },
  { id: "shared_grants", label: "Shared grants" },
  { id: "shared_topics", label: "Shared topics" },
  { id: "co_mentions", label: "Co-mentions" },
  { id: "all_shared_signals", label: "All shared signals" },
];

const NETWORK_LENS: { id: LandscapeNetworkLens; label: string }[] = [
  { id: "collaboration_communities", label: "Collaboration communities" },
  { id: "research_topic", label: "Research topic" },
  { id: "program_affiliation", label: "Program / affiliation" },
  { id: "publication_overlap", label: "Publication overlap" },
  { id: "funding_overlap", label: "Funding overlap" },
  { id: "emerging_signals", label: "Emerging signals" },
  { id: "strategic_opportunity", label: "Strategic opportunity" },
];

const COLOR_BY: { id: LandscapeColorBy; label: string }[] = [
  { id: "cluster", label: "Cluster" },
  { id: "program", label: "Program" },
  { id: "role", label: "Role" },
  { id: "topic", label: "Topic" },
  { id: "activity", label: "Activity" },
];

const SIZE_BY: { id: LandscapeSizeBy; label: string }[] = [
  { id: "total_signals", label: "Total signals" },
  { id: "publications", label: "Publications" },
  { id: "grants", label: "Grants" },
  { id: "collaborator_count", label: "Collaborator count" },
  { id: "centrality", label: "Centrality" },
  { id: "recent_activity", label: "Recent activity" },
];

type GraphNode = LandscapeNodeMetrics & {
  color: string;
  val: number;
};

type LandscapeVizState = {
  opacity: (id: string) => number;
  showLabel: (id: string, centrality: number) => boolean;
  bridgeHigh: number;
  highlightBridges: boolean;
  networkLens: LandscapeNetworkLens;
  selectedNodeId: string | null;
  selectedClusterKey: string | null;
};

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function simpleHashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Rounded label chip for 2D canvas (premium readability). */
function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function neighborSet(
  nodeId: string | null,
  links: LandscapeLink[],
): Set<string> | null {
  if (!nodeId) return null;
  const s = new Set<string>([nodeId]);
  for (const l of links) {
    if (l.source === nodeId) s.add(l.target);
    if (l.target === nodeId) s.add(l.source);
  }
  return s;
}

export function CollaborationLandscape({
  items,
  entityNameById,
  entityMetaById,
  deletingIds,
  variant = "full",
  onRequestExpand,
  fullScreenLayout = false,
}: {
  items: VolumeItem[];
  entityNameById: Record<string, string>;
  entityMetaById: Record<string, DashboardEntityMeta>;
  deletingIds: Set<string>;
  variant?: "full" | "embed";
  onRequestExpand?: () => void;
  /** Taller graph + scrollable data tables (e.g. fullscreen dialog). */
  fullScreenLayout?: boolean;
}) {
  const isEmbed = variant === "embed";
  const [preset, setPreset] = useState<LandscapeTimePreset>("5y");
  const [edgeMode, setEdgeMode] = useState<LandscapeEdgeMode>("all_shared_signals");
  const [networkLens, setNetworkLens] = useState<LandscapeNetworkLens>("collaboration_communities");
  const [colorBy, setColorBy] = useState<LandscapeColorBy>("cluster");
  const [sizeBy, setSizeBy] = useState<LandscapeSizeBy>("centrality");
  const [minEdgeStrength, setMinEdgeStrength] = useState(0.5);
  const [search, setSearch] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedClusterKey, setSelectedClusterKey] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  const [highlightBridges, setHighlightBridges] = useState(false);
  const [showEmergingEdges, setShowEmergingEdges] = useState(false);
  const [whiteSpaceMode, setWhiteSpaceMode] = useState(false);
  const [clusterDrawerOpen, setClusterDrawerOpen] = useState(true);
  const [tableTab, setTableTab] = useState<"investigators" | "clusters" | "collaborations" | "opportunities">(
    "investigators",
  );
  const [graphDisplayMode, setGraphDisplayMode] = useState<"2d" | "3d">("2d");
  const [fundingHighlight, setFundingHighlight] = useState(false);
  const [graphStylePreset, setGraphStylePreset] = useState<GraphStylePreset>("research_landscape");

  const effectiveGraphMode: "2d" | "3d" = isEmbed ? "2d" : graphDisplayMode;

  const fg2dRef = useRef<ForceGraphMethods2D<GraphNode, LandscapeLink> | undefined>(undefined);
  const fg3dRef = useRef<ForceGraphMethods3D<GraphNode, LandscapeLink> | undefined>(undefined);
  const nodeByIdRef = useRef<Map<string, GraphNode>>(new Map());
  const vizStateRef = useRef<LandscapeVizState>({
    opacity: () => 1,
    showLabel: () => false,
    bridgeHigh: 0,
    highlightBridges: false,
    networkLens: "collaboration_communities",
    selectedNodeId: null,
    selectedClusterKey: null,
  });
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 900, h: 560 });

  const model = useMemo(
    () =>
      buildCollaborationLandscapeModel({
        items,
        preset,
        edgeMode,
        deletingIds,
        entityNameById,
        entityMetaById,
        minEdgeStrength,
      }),
    [items, preset, edgeMode, deletingIds, entityNameById, entityMetaById, minEdgeStrength],
  );

  const activityRank01 = useMemo(() => {
    const sorted = [...model.nodes].sort((a, b) => b.recentActivity - a.recentActivity);
    const rank = new Map<string, number>();
    const n = sorted.length || 1;
    sorted.forEach((node, i) => {
      rank.set(node.id, 1 - i / Math.max(1, n - 1));
    });
    return rank;
  }, [model.nodes]);

  const labelCentralityThreshold = useMemo(() => {
    if (model.nodes.length === 0) return 1;
    const sorted = [...model.nodes].map((n) => n.centrality).sort((a, b) => b - a);
    const cut = Math.max(5, Math.ceil(model.nodes.length * 0.14));
    return sorted[Math.min(cut - 1, sorted.length - 1)] ?? 0;
  }, [model.nodes]);

  /** Top ~10% centrality = “major hubs” for Constellation label policy. */
  const constellationHubThreshold = useMemo(() => {
    if (model.nodes.length === 0) return 1;
    const sorted = [...model.nodes].map((n) => n.centrality).sort((a, b) => b - a);
    const cut = Math.max(3, Math.ceil(model.nodes.length * 0.1));
    return sorted[Math.min(cut - 1, sorted.length - 1)] ?? 0;
  }, [model.nodes]);

  const maxima = useMemo(() => computeMaxima(model.nodes), [model.nodes]);

  const clusterRankByKey = useMemo(() => {
    const keys = [...new Set(model.nodes.map((n) => n.louvainCluster))].sort((a, b) => a.localeCompare(b));
    return new Map(keys.map((k, i) => [k, i]));
  }, [model.nodes]);

  const clusterPalette = useMemo(() => clusterPaletteForPreset(graphStylePreset), [graphStylePreset]);

  const graphNodes: GraphNode[] = useMemo(() => {
    return model.nodes.map((n) => {
      let base: string;
      if (networkLens === "strategic_opportunity") {
        base = `hsl(${268 - n.opportunityScore * 40} 58% ${42 + n.opportunityScore * 18}%)`;
      } else if (colorBy === "cluster") {
        const idx = clusterRankByKey.get(n.louvainCluster) ?? 0;
        base = clusterPalette[idx % clusterPalette.length]!;
      } else {
        base = landscapeNodeColor(n, colorBy, activityRank01.get(n.id) ?? 0);
      }
      return {
        ...n,
        color: base,
        val: landscapeNodeVal(n, sizeBy, maxima),
      };
    });
  }, [model.nodes, colorBy, networkLens, sizeBy, maxima, activityRank01, clusterRankByKey, clusterPalette]);

  const linksMemo = useMemo(() => model.linksDisplay.map((l) => ({ ...l })), [model.linksDisplay]);

  const graphData2d = useMemo(
    () => ({ nodes: graphNodes, links: linksMemo }),
    [graphNodes, linksMemo],
  );

  /** Shallow Z spread keeps 3D orbit readable; analytical focus stays on 2D. */
  const graphData3d = useMemo(
    () => ({
      nodes: graphNodes.map((n) => ({
        ...n,
        z: ((simpleHashId(n.id) % 9) - 4) * 1.1,
      })),
      links: linksMemo,
    }),
    [graphNodes, linksMemo],
  );

  useEffect(() => {
    nodeByIdRef.current = new Map(graphNodes.map((n) => [n.id, n]));
  }, [graphNodes]);

  const searchLc = search.trim().toLowerCase();
  const searchHits = useMemo(() => {
    if (!searchLc) return new Set<string>();
    const s = new Set<string>();
    for (const n of model.nodes) {
      if (n.name.toLowerCase().includes(searchLc)) s.add(n.id);
      if (n.program.toLowerCase().includes(searchLc)) s.add(n.id);
      if (n.louvainCluster.toLowerCase().includes(searchLc)) s.add(n.id);
      if (n.topTopics.some((t) => t.includes(searchLc))) s.add(n.id);
    }
    return s;
  }, [model.nodes, searchLc]);

  /** Investigators to frame when search matches people, topics, programs, or entire clusters. */
  const searchFocusIds = useMemo(() => {
    if (!searchLc) return null;
    const s = new Set(searchHits);
    for (const n of model.nodes) {
      if (n.louvainCluster.toLowerCase().includes(searchLc)) s.add(n.id);
    }
    return s.size > 0 ? s : null;
  }, [model.nodes, searchLc, searchHits]);

  const clusterGrowthByKey = useMemo(() => {
    const maxR = Math.max(1, ...model.clusterSummaries.map((c) => c.recentActivity));
    const map = new Map<string, "High" | "Medium" | "Emerging">();
    for (const c of model.clusterSummaries) {
      const ratio = c.recentActivity / maxR;
      map.set(c.key, ratio >= 0.66 ? "High" : ratio >= 0.33 ? "Medium" : "Emerging");
    }
    return map;
  }, [model.clusterSummaries]);

  const highlightIds = useMemo(() => {
    if (selectedClusterKey) {
      return new Set(model.nodes.filter((n) => n.louvainCluster === selectedClusterKey).map((n) => n.id));
    }
    return neighborSet(selectedNodeId, model.linksDisplay);
  }, [selectedClusterKey, selectedNodeId, model.linksDisplay, model.nodes]);

  const bridgeHigh = useMemo(() => {
    const t = [...model.nodes].sort((a, b) => b.bridgeScore - a.bridgeScore)[Math.floor(model.nodes.length * 0.15)]
      ?.bridgeScore ?? 0.35;
    return t;
  }, [model.nodes]);

  const maxLinkStrength = useMemo(
    () => Math.max(1, ...model.linksDisplay.map((l) => l.strength)),
    [model.linksDisplay],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const w = Math.max(320, Math.floor(r.width));
      let h: number;
      if (isEmbed) {
        h = Math.max(220, Math.min(360, Math.floor(r.width * 0.38)));
      } else {
        const standard = Math.max(420, Math.min(720, Math.floor(r.width * 0.52)));
        h = fullScreenLayout ? Math.min(1080, Math.round(standard * 1.5)) : standard;
      }
      setBox((p) => (p.w === w && p.h === h ? p : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isEmbed, fullScreenLayout]);

  useEffect(() => {
    const fg = effectiveGraphMode === "2d" ? fg2dRef.current : fg3dRef.current;
    if (!fg || graphNodes.length === 0) return;
    const t = window.setTimeout(() => fg.zoomToFit(420, 56), 480);
    return () => window.clearTimeout(t);
  }, [effectiveGraphMode, preset, edgeMode, minEdgeStrength, graphNodes.length, linksMemo.length, graphStylePreset]);

  useEffect(() => {
    if (effectiveGraphMode !== "2d" || !searchLc || !searchFocusIds?.size) return;
    const fg = fg2dRef.current;
    if (!fg || graphNodes.length === 0) return;
    const t = window.setTimeout(() => {
      fg.zoomToFit(650, 88, (n) => searchFocusIds.has((n as GraphNode).id));
    }, 260);
    return () => window.clearTimeout(t);
  }, [effectiveGraphMode, searchLc, searchFocusIds, graphNodes.length]);

  const forces2dSetupRef = useRef(false);
  const forces3dSetupRef = useRef(false);
  useEffect(() => {
    forces2dSetupRef.current = false;
    forces3dSetupRef.current = false;
  }, [preset, edgeMode, minEdgeStrength, effectiveGraphMode]);

  const nodeOpacity = useCallback(
    (id: string) => {
      if (highlightIds) {
        return highlightIds.has(id) ? 1 : 0.22;
      }
      if (whiteSpaceMode) {
        const n = model.nodes.find((x) => x.id === id);
        if (n && n.collaboratorCount <= 1 && n.bridgeScore < 0.2) return 0.85;
        return n ? 0.35 : 0.35;
      }
      return 1;
    },
    [highlightIds, whiteSpaceMode, model.nodes],
  );

  const showNodeLabel = useCallback(
    (id: string, centrality: number, bridgeScore: number) => {
      if (graphStylePreset === "constellation") {
        if (searchHits.has(id)) return true;
        if (pinned.has(id)) return true;
        if (selectedNodeId === id || hoverId === id) return true;
        if (highlightBridges && bridgeScore >= bridgeHigh) return true;
        if (centrality >= constellationHubThreshold) return true;
        return false;
      }
      if (searchHits.has(id)) return true;
      if (pinned.has(id)) return true;
      if (selectedNodeId === id || hoverId === id) return true;
      if (highlightBridges && bridgeScore >= bridgeHigh) return true;
      if (centrality >= labelCentralityThreshold) return true;
      return false;
    },
    [
      graphStylePreset,
      searchHits,
      pinned,
      selectedNodeId,
      hoverId,
      labelCentralityThreshold,
      constellationHubThreshold,
      highlightBridges,
      bridgeHigh,
    ],
  );

  vizStateRef.current = {
    opacity: nodeOpacity,
    showLabel: (id: string, c: number) => showNodeLabel(id, c, nodeByIdRef.current.get(id)?.bridgeScore ?? 0),
    bridgeHigh,
    highlightBridges,
    networkLens,
    selectedNodeId,
    selectedClusterKey,
  };

  const nodeThreeObject = useCallback((node: NodeObject<GraphNode>) => {
    const gn = node as GraphNode;
    const group = new THREE.Group();
    group.userData.landscapeRoot = true;
    group.userData.nodeId = gn.id;

    const geom = new THREE.SphereGeometry(1, 28, 28);
    const mat = new THREE.MeshLambertMaterial({
      color: new THREE.Color().setStyle(gn.color),
      transparent: true,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(geom, mat);
    group.add(mesh);
    group.userData.mesh = mesh;

    const radiusScale = (3.6 + Math.sqrt(Math.max(0.2, gn.val)) * 0.82) * 0.21;
    group.scale.setScalar(radiusScale);

    const label = new SpriteText(truncate(gn.name, 34));
    if (graphStylePreset === "constellation") {
      label.color = "rgba(228,236,255,0.96)";
      label.backgroundColor = "rgba(14,24,44,0.92)";
    } else if (graphStylePreset === "scientific_atlas") {
      label.color = "rgba(42,35,28,0.96)";
      label.backgroundColor = "rgba(255,252,246,0.94)";
    } else {
      label.color = "rgba(22,24,32,0.96)";
      label.backgroundColor = "rgba(255,255,255,0.96)";
    }
    label.padding = 0.35;
    label.textHeight = 1.75;
    label.visible = false;
    label.position.set(0, 1.38, 0);
    group.add(label);
    group.userData.label = label;

    const ringGeom = new THREE.TorusGeometry(1.14, 0.035, 10, 52);
    const ringMat = new THREE.MeshBasicMaterial({
      color: graphStylePreset === "constellation" ? 0x9ec8ff : 0xb45a28,
      transparent: true,
      opacity: graphStylePreset === "constellation" ? 0.45 : 0.5,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.visible = false;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    group.userData.ring = ring;

    return group;
  }, [graphStylePreset]);

  const applyLinkDistance = useCallback((fg: ForceGraphMethods2D<GraphNode, LandscapeLink> | undefined) => {
      if (!fg) return;
      const link = fg.d3Force("link");
      if (link && typeof link.distance === "function") {
        link.distance((l: LinkObject<GraphNode, LandscapeLink>) => {
          const L = l as unknown as LandscapeLink;
          const v = L.strength ?? 1;
          return 46 + Math.min(118, v * 12);
        });
      }
    },
    [],
  );

  const on2dEngineTick = useCallback(() => {
    const fg = fg2dRef.current;
    if (!fg) return;
    if (!forces2dSetupRef.current) {
      forces2dSetupRef.current = true;
      const charge = fg.d3Force("charge");
      if (charge && typeof charge.strength === "function") charge.strength(-165);
      applyLinkDistance(fg);
    }
  }, [applyLinkDistance]);

  const NODE_REL_2D = 8.2;

  function nodeRadius2d(n: GraphNode): number {
    const v = typeof n.val === "number" && n.val > 0 ? n.val : 1;
    return Math.sqrt(v) * NODE_REL_2D;
  }

  const paintNode2d = useCallback(
    (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode & { x?: number; y?: number };
      const nx = n.x;
      const ny = n.y;
      if (typeof nx !== "number" || typeof ny !== "number" || !Number.isFinite(nx) || !Number.isFinite(ny)) {
        return;
      }
      const r = nodeRadius2d(n);
      const opacity = nodeOpacity(n.id);
      const isSel = selectedNodeId === n.id || selectedClusterKey === n.louvainCluster;
      const isBridge = highlightBridges && n.bridgeScore >= bridgeHigh;
      const isHover = hoverId === n.id;
      const scale = Math.max(0.45, globalScale);

      ctx.save();
      ctx.globalAlpha = opacity;

      if (graphStylePreset === "scientific_atlas") {
        ctx.globalAlpha = opacity * 0.14;
        ctx.beginPath();
        ctx.arc(nx, ny, r * 2.35, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();
        ctx.globalAlpha = opacity;

        ctx.shadowColor = n.color;
        ctx.shadowBlur = Math.min(10, 5 / scale);
        ctx.shadowOffsetY = 0;
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        const hi = ctx.createRadialGradient(nx - r * 0.4, ny - r * 0.45, r * 0.08, nx, ny, r * 1.05);
        hi.addColorStop(0, "rgba(255,255,255,0.38)");
        hi.addColorStop(0.55, "rgba(255,255,255,0.06)");
        hi.addColorStop(1, "rgba(40,32,24,0.12)");
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.fillStyle = hi;
        ctx.fill();

        ctx.strokeStyle = isSel
          ? "rgba(52,38,28,0.92)"
          : isBridge
            ? "rgba(195, 145, 75, 0.92)"
            : "rgba(62,48,38,0.42)";
        ctx.lineWidth =
          (isSel ? 3 : isBridge ? 2.5 : isHover ? 2.2 : 1.35) / scale;
        ctx.stroke();
      } else if (graphStylePreset === "constellation") {
        ctx.globalAlpha = opacity * 0.12;
        ctx.beginPath();
        ctx.arc(nx, ny, r * 2.75, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(88, 130, 210, 0.55)";
        ctx.fill();
        ctx.globalAlpha = opacity * 0.1;
        ctx.beginPath();
        ctx.arc(nx, ny, r * 1.65, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();
        ctx.globalAlpha = opacity;

        ctx.shadowColor = n.color;
        ctx.shadowBlur = Math.min(18, 12 / scale);
        ctx.shadowOffsetY = 0;
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = isSel
          ? "rgba(190, 220, 255, 0.98)"
          : isBridge
            ? "rgba(255, 200, 120, 0.92)"
            : isHover
              ? "rgba(150, 195, 255, 0.88)"
              : "rgba(255, 255, 255, 0.28)";
        ctx.lineWidth =
          (isSel ? 3.4 : isBridge ? 2.8 : isHover ? 2.5 : 1.25) / scale;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();

        const soft = ctx.createRadialGradient(nx - r * 0.35, ny - r * 0.38, r * 0.12, nx, ny, r);
        soft.addColorStop(0, "rgba(255,255,255,0.28)");
        soft.addColorStop(0.65, "rgba(255,255,255,0.02)");
        soft.addColorStop(1, "rgba(22,22,28,0.1)");
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.fillStyle = soft;
        ctx.fill();

        ctx.strokeStyle = isSel
          ? "rgba(28, 36, 52, 0.94)"
          : isBridge
            ? "rgba(195, 150, 65, 0.92)"
            : "rgba(255,255,255,0.55)";
        ctx.lineWidth =
          (isSel ? 2.9 : isBridge ? 2.4 : isHover ? 2.1 : 1.45) / scale;
        ctx.stroke();
      }

      if (fundingHighlight && n.grants > 0) {
        ctx.beginPath();
        ctx.arc(nx, ny, r + 2.8 / scale, 0, Math.PI * 2);
        ctx.strokeStyle =
          graphStylePreset === "constellation"
            ? "rgba(255, 210, 120, 0.5)"
            : "rgba(160, 120, 45, 0.55)";
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();
      }

      ctx.restore();

      if (showNodeLabel(n.id, n.centrality, n.bridgeScore)) {
        const name = truncate(n.name, 36);
        const fs = Math.max(9.5, Math.min(13.2, 11.2 / scale));
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`;
        const padX = 7 / scale;
        const padY = 4 / scale;
        const stagger = (simpleHashId(n.id) % 6) * (3 / scale);
        const tw = ctx.measureText(name).width;
        const th = fs * 1.28;
        const lx = nx + r + 6 / scale;
        const ly = ny + stagger;
        const rx = 6 / scale;

        let fillPill: string;
        let strokePill: string;
        let textFill: string;
        let softShadow: string;

        if (graphStylePreset === "constellation") {
          fillPill = "rgba(12, 22, 42, 0.92)";
          strokePill = "rgba(130, 170, 255, 0.38)";
          textFill = "rgba(232, 240, 255, 0.96)";
          softShadow = "rgba(0, 0, 0, 0.35)";
        } else if (graphStylePreset === "scientific_atlas") {
          fillPill = "rgba(255, 252, 246, 0.96)";
          strokePill = "rgba(62, 48, 38, 0.12)";
          textFill = "rgba(38, 30, 22, 0.94)";
          softShadow = "rgba(62, 48, 32, 0.12)";
        } else {
          fillPill = "rgba(255, 255, 255, 0.98)";
          strokePill = "rgba(24, 28, 36, 0.12)";
          textFill = "rgba(18, 20, 28, 0.94)";
          softShadow = "rgba(32, 36, 48, 0.12)";
        }

        ctx.shadowColor = softShadow;
        ctx.shadowBlur = graphStylePreset === "research_landscape" ? 6 / scale : 8 / scale;
        ctx.shadowOffsetY = 1.5 / scale;
        fillRoundRect(ctx, lx, ly - th / 2, tw + padX * 2, th + padY * 0.5, rx);
        ctx.fillStyle = fillPill;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        fillRoundRect(ctx, lx, ly - th / 2, tw + padX * 2, th + padY * 0.5, rx);
        ctx.strokeStyle = strokePill;
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
        ctx.fillStyle = textFill;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(name, lx + padX, ly);
        ctx.restore();
      }
    },
    [
      graphStylePreset,
      nodeOpacity,
      showNodeLabel,
      selectedNodeId,
      selectedClusterKey,
      highlightBridges,
      bridgeHigh,
      fundingHighlight,
      hoverId,
    ],
  );

  const on3dEngineTick = useCallback(() => {
    const fg = fg3dRef.current;
    if (!fg) return;
    if (!forces3dSetupRef.current) {
      forces3dSetupRef.current = true;
      const charge = fg.d3Force("charge");
      if (charge && typeof charge.strength === "function") charge.strength(-200);
      applyLinkDistance(fg as unknown as ForceGraphMethods2D<GraphNode, LandscapeLink>);
    }

    const vs = vizStateRef.current;
    fg.scene().traverse((obj) => {
      const root = obj as THREE.Group & {
        userData: {
          landscapeRoot?: boolean;
          nodeId?: string;
          mesh?: THREE.Mesh;
          label?: SpriteText;
          ring?: THREE.Mesh;
        };
      };
      if (!root.userData.landscapeRoot || !root.userData.nodeId) return;

      const gn = nodeByIdRef.current.get(root.userData.nodeId);
      if (!gn) return;

      const op = vs.opacity(root.userData.nodeId);
      const mesh = root.userData.mesh;
      const label = root.userData.label;
      const ring = root.userData.ring;

      if (mesh) {
        const m = mesh.material as THREE.MeshLambertMaterial;
        m.transparent = true;
        m.opacity = op;
        try {
          m.color.setStyle(gn.color);
        } catch {
          m.color.setHex(0x6b6288);
        }
        const bridge = vs.highlightBridges && gn.bridgeScore >= vs.bridgeHigh;
        const sel = vs.selectedNodeId === gn.id;
        const clusterSel = vs.selectedClusterKey === gn.louvainCluster;
        if (bridge) {
          m.emissive = new THREE.Color(0x664422);
          m.emissiveIntensity = 0.38;
        } else if (sel || clusterSel) {
          m.emissive = new THREE.Color(0x222233);
          m.emissiveIntensity = 0.22;
        } else {
          m.emissive = new THREE.Color(0x000000);
          m.emissiveIntensity = 0;
        }
      }

      if (label) {
        label.visible = vs.showLabel(root.userData.nodeId, gn.centrality);
        const sm = label.material as THREE.SpriteMaterial;
        sm.transparent = true;
        sm.opacity = op;
      }

      if (ring) {
        ring.visible = vs.networkLens === "emerging_signals" && gn.recentActivity > 0;
        const rm = ring.material as THREE.MeshBasicMaterial;
        rm.transparent = true;
        rm.opacity = op * 0.55;
      }
    });

    const anyFg = fg as unknown as { graphData?: () => { nodes: { z?: number }[] } };
    const gd = anyFg.graphData?.();
    if (gd?.nodes) {
      for (const n of gd.nodes) {
        if (typeof n.z === "number" && Math.abs(n.z) > 24) n.z = Math.sign(n.z) * 24;
      }
    }
  }, [applyLinkDistance]);

  const nudgeCameraZoom = useCallback((factor: number) => {
    const fg = fg3dRef.current;
    if (!fg) return;
    const cam = fg.camera() as THREE.PerspectiveCamera;
    const ctl = fg.controls() as OrbitControls;
    const target = ctl.target.clone();
    const offset = cam.position.clone().sub(target);
    offset.multiplyScalar(factor);
    cam.position.copy(target.clone().add(offset));
    ctl.update();
  }, []);

  const linkPaint2d = useMemo(() => {
    const max = maxLinkStrength;
    const edgeRgb =
      graphStylePreset === "constellation"
        ? { r: 150, g: 175, b: 225 }
        : graphStylePreset === "scientific_atlas"
          ? { r: 96, g: 82, b: 72 }
          : { r: 88, g: 86, b: 108 };
    const widthMul =
      graphStylePreset === "scientific_atlas" ? 0.62 : graphStylePreset === "constellation" ? 0.52 : 0.88;
    const alphaMul =
      graphStylePreset === "constellation" ? 0.42 : graphStylePreset === "scientific_atlas" ? 0.58 : 0.72;

    return {
      color: (l: LinkObject<GraphNode, LandscapeLink>) => {
        const L = l as LandscapeLink;
        if (highlightIds) {
          const touched = highlightIds.has(L.source) && highlightIds.has(L.target);
          if (!touched)
            return graphStylePreset === "constellation"
              ? "rgba(120,150,210,0.02)"
              : "rgba(110,108,125,0.022)";
        }
        if (showEmergingEdges && L.emergingShare < 0.35) {
          return graphStylePreset === "constellation"
            ? "rgba(120,150,210,0.03)"
            : "rgba(110,108,125,0.032)";
        }
        const t = Math.min(1, L.strength / max);
        let alpha = (0.028 + t * 0.12) * alphaMul;
        if (networkLens === "publication_overlap") alpha *= 0.65 + (L.sharedPapers / Math.max(1, L.strength)) * 0.55;
        if (networkLens === "funding_overlap") alpha *= 0.65 + (L.sharedGrants / Math.max(1, L.strength)) * 0.55;
        if (networkLens === "emerging_signals") alpha *= 0.35 + L.emergingShare * 0.85;
        return `rgba(${edgeRgb.r}, ${edgeRgb.g}, ${edgeRgb.b}, ${alpha})`;
      },
      width: (l: LinkObject<GraphNode, LandscapeLink>) => {
        const L = l as LandscapeLink;
        let w = (0.45 + Math.sqrt(L.strength) * 0.82) * widthMul;
        if (networkLens === "publication_overlap") w *= 0.85 + (L.sharedPapers / Math.max(1, L.strength)) * 0.9;
        if (networkLens === "funding_overlap") w *= 0.85 + (L.sharedGrants / Math.max(1, L.strength)) * 0.9;
        return w;
      },
    };
  }, [highlightIds, maxLinkStrength, networkLens, showEmergingEdges, graphStylePreset]);

  const linkPaint3d = useMemo(() => {
    const max = maxLinkStrength;
    const edgeRgb =
      graphStylePreset === "constellation"
        ? { r: 150, g: 178, b: 228 }
        : graphStylePreset === "scientific_atlas"
          ? { r: 92, g: 78, b: 70 }
          : { r: 72, g: 68, b: 102 };
    const widthMul =
      graphStylePreset === "scientific_atlas" ? 0.58 : graphStylePreset === "constellation" ? 0.48 : 0.85;
    const alphaMul =
      graphStylePreset === "constellation" ? 0.38 : graphStylePreset === "scientific_atlas" ? 0.52 : 0.68;

    return {
      color: (l: LinkObject<GraphNode, LandscapeLink>) => {
        const L = l as LandscapeLink;
        if (highlightIds) {
          const touched = highlightIds.has(L.source) && highlightIds.has(L.target);
          if (!touched) return "rgba(120,140,180,0.05)";
        }
        if (showEmergingEdges && L.emergingShare < 0.35) {
          return "rgba(120,140,180,0.06)";
        }
        const t = Math.min(1, L.strength / max);
        let alpha = (0.08 + t * 0.24) * alphaMul;
        if (networkLens === "publication_overlap") alpha *= 0.65 + (L.sharedPapers / Math.max(1, L.strength)) * 0.55;
        if (networkLens === "funding_overlap") alpha *= 0.65 + (L.sharedGrants / Math.max(1, L.strength)) * 0.55;
        if (networkLens === "emerging_signals") alpha *= 0.35 + L.emergingShare * 0.85;
        return `rgba(${edgeRgb.r}, ${edgeRgb.g}, ${edgeRgb.b}, ${alpha})`;
      },
      width: (l: LinkObject<GraphNode, LandscapeLink>) => {
        const L = l as LandscapeLink;
        let w = (0.5 + Math.sqrt(L.strength) * 0.8) * widthMul;
        if (networkLens === "publication_overlap") w *= 0.85 + (L.sharedPapers / Math.max(1, L.strength)) * 0.9;
        if (networkLens === "funding_overlap") w *= 0.85 + (L.sharedGrants / Math.max(1, L.strength)) * 0.9;
        return w;
      },
    };
  }, [highlightIds, maxLinkStrength, networkLens, showEmergingEdges, graphStylePreset]);

  const graphNodeTooltip = useCallback((n: NodeObject<GraphNode>) => {
    const gn = n as GraphNode;
    const topics = gn.topTopics.slice(0, 5).join(", ") || "—";
    return [
      gn.name,
      `Cluster: ${gn.louvainCluster}`,
      `Publications: ${gn.publications} · Grants: ${gn.grants}`,
      `Collaborators: ${gn.collaboratorCount}`,
      `Recent activity (½ window): ${gn.recentActivity}`,
      `Topics: ${topics}`,
    ].join("\n");
  }, []);

  const downloadGraphPng = useCallback(() => {
    const canvas =
      effectiveGraphMode === "3d"
        ? fg3dRef.current?.renderer()?.domElement
        : wrapRef.current?.querySelector("canvas");
    if (!canvas) {
      toast.error("Graph canvas not ready");
      return;
    }
    try {
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = "collaboration-landscape.png";
      a.click();
      toast.success("Graph image downloaded");
    } catch {
      toast.error("Could not export image");
    }
  }, [effectiveGraphMode]);

  const exportStory = useCallback(() => {
    const lines: string[] = [];
    lines.push(`## Collaboration Landscape snapshot`);
    lines.push("");
    lines.push(`**Horizon:** ${TIME_PRESETS.find((t) => t.id === preset)?.label ?? preset}`);
    lines.push(`**Edge lens:** ${EDGE_MODES.find((e) => e.id === edgeMode)?.label ?? edgeMode}`);
    lines.push(
      `**Investigators:** ${model.global.investigatorCount} · **Clusters:** ${model.global.clusterCount} · **Shared pub/funding signals:** ${model.global.sharedSignals}`,
    );
    lines.push(`**Strongest cluster:** ${model.global.strongestCluster}`);
    lines.push("");
    lines.push(`### Bridge investigators`);
    for (const b of model.global.bridgeLeaders.slice(0, 5)) {
      lines.push(`- ${b.name} (score ${b.bridge.toFixed(2)})`);
    }
    lines.push("");
    lines.push(`### Emerging collaboration edges`);
    lines.push(`~${model.global.emergingCollaborations} edges show majority-recency weighting in-window.`);
    lines.push("");
    lines.push(`### Strategic narrative`);
    lines.push(
      model.clusterSummaries[0]?.strategicSummary ??
        "Snapshot captures collaboration fabric from co-listed signals; refine horizon and edge filters to sharpen program narratives.",
    );
    const md = lines.join("\n");
    void navigator.clipboard.writeText(md).then(
      () => toast.success("Landscape summary copied"),
      () => toast.error("Clipboard unavailable"),
    );
  }, [preset, edgeMode, model]);

  const selectedNode = selectedNodeId ? model.nodes.find((n) => n.id === selectedNodeId) : undefined;
  const selectedCluster: LandscapeClusterSummary | undefined = selectedClusterKey
    ? model.clusterSummaries.find((c) => c.key === selectedClusterKey)
    : undefined;

  const itemsInLandscapeWindow = useMemo(
    () => filterLandscapeItems(items, preset, deletingIds),
    [items, preset, deletingIds],
  );

  const recentSignalsForSelected = useMemo(() => {
    if (!selectedNodeId) return [];
    const rows = itemsInLandscapeWindow.filter((it) => volumeEntityIds(it).includes(selectedNodeId));
    return [...rows]
      .sort((a, b) => volumeItemRefMs(b) - volumeItemRefMs(a))
      .slice(0, 8);
  }, [itemsInLandscapeWindow, selectedNodeId]);

  const topCollaboratorsForSelected = useMemo(() => {
    if (!selectedNodeId) return [];
    return model.linksDisplay
      .filter((l) => l.source === selectedNodeId || l.target === selectedNodeId)
      .map((l) => {
        const other = l.source === selectedNodeId ? l.target : l.source;
        return {
          id: other,
          name: entityNameById[other]?.trim() ?? "Unknown",
          strength: l.strength,
        };
      })
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 10);
  }, [selectedNodeId, model.linksDisplay, entityNameById]);

  const opportunitiesForSelected = useMemo(() => {
    if (!selectedNodeId) return [];
    return model.opportunities.filter((o) => o.investigatorIds.includes(selectedNodeId));
  }, [selectedNodeId, model.opportunities]);

  const introPaths = useMemo(() => {
    if (!selectedNodeId) return [];
    const neigh = neighborSet(selectedNodeId, model.linksDisplay);
    if (!neigh) return [];
    const twoHop = new Map<string, string>();
    for (const nb of neigh) {
      if (nb === selectedNodeId) continue;
      for (const l of model.linksDisplay) {
        let other: string | null = null;
        if (l.source === nb) other = l.target;
        else if (l.target === nb) other = l.source;
        if (!other || other === selectedNodeId || neigh.has(other)) continue;
        if (!twoHop.has(other)) twoHop.set(other, nb);
      }
    }
    return [...twoHop.entries()].slice(0, 6).map(([target, via]) => ({
      target,
      via,
      targetName: entityNameById[target]?.trim() ?? "Unknown",
      viaName: entityNameById[via]?.trim() ?? "Unknown",
    }));
  }, [selectedNodeId, model.linksDisplay, entityNameById]);

  const collabRows = useMemo(() => {
    return model.linksDisplay
      .map((l) => {
        let recent = "—";
        let recentWhenLabel = "—";
        let recentMs = 0;
        if (l.recentSignalIds.length) {
          const it = items.find((i) => i.id === l.recentSignalIds[0]);
          if (it) {
            recent = it.title?.trim() ?? "—";
            recentMs = volumeItemRefMs(it);
            recentWhenLabel = recentMs ? new Date(recentMs).toLocaleDateString() : "—";
          }
        }
        return {
          ...l,
          aName: entityNameById[l.source]?.trim() ?? "Unknown",
          bName: entityNameById[l.target]?.trim() ?? "Unknown",
          recent,
          recentWhenLabel,
          recentMs,
        };
      })
      .sort((a, b) => b.strength - a.strength || b.recentMs - a.recentMs)
      .slice(0, 80);
  }, [model.linksDisplay, entityNameById, items]);

  const investigatorRows = useMemo(() => {
    return [...model.nodes].sort(
      (a, b) =>
        b.centrality - a.centrality ||
        b.bridgeScore - a.bridgeScore ||
        b.weightedDegree - a.weightedDegree,
    );
  }, [model.nodes]);

  if (model.nodes.length === 0) {
    return (
      <div className="rounded-[1.35rem] border border-[color:var(--border)]/75 bg-[#faf9f6] px-5 py-14 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
        <p className="text-base font-semibold text-[color:var(--foreground)]">No collaboration landscape yet</p>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-[color:var(--muted-foreground)]">
          Expand the time horizon (e.g. 10 years), lower the minimum edge strength, try{" "}
          <span className="font-medium text-[color:var(--foreground)]/90">All shared signals</span> or{" "}
          <span className="font-medium text-[color:var(--foreground)]/90">Co-mentions</span>, or switch to{" "}
          <span className="font-medium text-[color:var(--foreground)]/90">Shared topics</span> to surface latent
          similarity. Co-listed investigators on PubMed or RePORTER signals create edges.
        </p>
        {isEmbed && onRequestExpand ? (
          <Button type="button" className="mt-6" onClick={onRequestExpand}>
            Open full landscape
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={isEmbed ? "space-y-3" : "space-y-5"}>
      {!isEmbed ? (
        <header className="border-b border-[color:var(--border)]/55 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-2">
              <h3 className="text-xl font-semibold tracking-tight text-[color:var(--foreground)] md:text-2xl">
                Collaboration Landscape
              </h3>
              <p className="text-sm leading-relaxed text-[color:var(--muted-foreground)]">
                Explore investigator communities, shared signals, and emerging collaboration opportunities.
              </p>
            </div>
            <div className="w-full max-w-md shrink-0 lg:pt-1">
              <Input
                placeholder="Search investigator, program, topic, or cluster…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search landscape"
              />
            </div>
          </div>
        </header>
      ) : null}

      {!isEmbed ? (
      <section className="rounded-[1.25rem] border border-[color:var(--border)]/65 bg-[color:var(--card)]/40 p-4 shadow-[0_18px_42px_-36px_rgba(45,38,64,0.55)]">
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[color:var(--muted-foreground)]">
            Time range
            <select
              className="rounded-xl border border-[color:var(--border)] bg-[#fdfcfa] px-3 py-2 text-sm text-[color:var(--foreground)] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              value={preset}
              onChange={(e) => setPreset(e.target.value as LandscapeTimePreset)}
            >
              {TIME_PRESETS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[color:var(--muted-foreground)]">
            Network view
            <select
              className="rounded-xl border border-[color:var(--border)] bg-[#fdfcfa] px-3 py-2 text-sm text-[color:var(--foreground)] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              value={networkLens}
              onChange={(e) => setNetworkLens(e.target.value as LandscapeNetworkLens)}
            >
              {NETWORK_LENS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[color:var(--muted-foreground)]">
            Edge type
            <select
              className="rounded-xl border border-[color:var(--border)] bg-[#fdfcfa] px-3 py-2 text-sm text-[color:var(--foreground)] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              value={edgeMode}
              onChange={(e) => setEdgeMode(e.target.value as LandscapeEdgeMode)}
            >
              {EDGE_MODES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[color:var(--muted-foreground)]">
            Color by
            <select
              className="rounded-xl border border-[color:var(--border)] bg-[#fdfcfa] px-3 py-2 text-sm text-[color:var(--foreground)] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              value={colorBy}
              onChange={(e) => setColorBy(e.target.value as LandscapeColorBy)}
            >
              {COLOR_BY.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[color:var(--muted-foreground)]">
            Size by
            <select
              className="rounded-xl border border-[color:var(--border)] bg-[#fdfcfa] px-3 py-2 text-sm text-[color:var(--foreground)] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              value={sizeBy}
              onChange={(e) => setSizeBy(e.target.value as LandscapeSizeBy)}
            >
              {SIZE_BY.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[color:var(--muted-foreground)]">
              Minimum edge strength ({minEdgeStrength.toFixed(2)})
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(1.25, maxLinkStrength)}
              step={0.25}
              value={Math.min(minEdgeStrength, Math.max(0, Math.max(1.25, maxLinkStrength)))}
              onChange={(e) => setMinEdgeStrength(Number(e.target.value))}
              className="mt-1 w-full accent-[color:var(--accent)]"
            />
          </div>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[color:var(--muted-foreground)]">
            Graph display
            <select
              className="rounded-xl border border-[color:var(--border)] bg-[#fdfcfa] px-3 py-2 text-sm font-medium text-[color:var(--foreground)] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              value={graphDisplayMode}
              onChange={(e) => setGraphDisplayMode(e.target.value as "2d" | "3d")}
            >
              <option value="2d">2D landscape (default)</option>
              <option value="3d">3D Explore (orbit)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[color:var(--muted-foreground)]">
            Style
            <select
              className="rounded-xl border border-[color:var(--border)] bg-[#fdfcfa] px-3 py-2 text-sm font-medium text-[color:var(--foreground)] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              value={graphStylePreset}
              onChange={(e) => setGraphStylePreset(e.target.value as GraphStylePreset)}
              title={GRAPH_STYLE_OPTIONS.find((o) => o.id === graphStylePreset)?.hint ?? ""}
              aria-label="Graph style preset"
            >
              {GRAPH_STYLE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id} title={o.hint}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-[color:var(--border)]/50 pt-4 text-xs">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[color:var(--foreground)]/90">
            <input
              type="checkbox"
              checked={highlightBridges}
              onChange={(e) => setHighlightBridges(e.target.checked)}
              className="rounded border-[color:var(--border)]"
            />
            Highlight bridge investigators
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-[color:var(--foreground)]/90">
            <input
              type="checkbox"
              checked={showEmergingEdges}
              onChange={(e) => setShowEmergingEdges(e.target.checked)}
              className="rounded border-[color:var(--border)]"
            />
            Show emerging edges
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-[color:var(--foreground)]/90">
            <input
              type="checkbox"
              checked={whiteSpaceMode}
              onChange={(e) => setWhiteSpaceMode(e.target.checked)}
              className="rounded border-[color:var(--border)]"
            />
            Find white space
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-[color:var(--foreground)]/90">
            <input
              type="checkbox"
              checked={fundingHighlight}
              onChange={(e) => setFundingHighlight(e.target.checked)}
              className="rounded border-[color:var(--border)]"
            />
            Funding signal overlay
          </label>
          <button
            type="button"
            onClick={exportStory}
            className="font-medium text-[color:var(--accent)] underline-offset-4 hover:underline"
          >
            Copy story / export brief
          </button>
          <button
            type="button"
            onClick={downloadGraphPng}
            className="font-medium text-[color:var(--accent)] underline-offset-4 hover:underline"
          >
            Download graph PNG
          </button>
        </div>
      </section>
      ) : (
        <section className="rounded-[1.15rem] border border-[color:var(--border)]/60 bg-[color:var(--card)]/35 p-3 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
              <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-xs font-medium text-[color:var(--muted-foreground)]">
                Time range
                <select
                  className="rounded-xl border border-[color:var(--border)] bg-[#fdfcfa] px-3 py-2 text-sm text-[color:var(--foreground)] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                  value={preset}
                  onChange={(e) => setPreset(e.target.value as LandscapeTimePreset)}
                >
                  {TIME_PRESETS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs font-medium text-[color:var(--muted-foreground)]">
                Edge type
                <select
                  className="rounded-xl border border-[color:var(--border)] bg-[#fdfcfa] px-3 py-2 text-sm text-[color:var(--foreground)] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                  value={edgeMode}
                  onChange={(e) => setEdgeMode(e.target.value as LandscapeEdgeMode)}
                >
                  {EDGE_MODES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs font-medium text-[color:var(--muted-foreground)]">
                Style
                <select
                  className="rounded-xl border border-[color:var(--border)] bg-[#fdfcfa] px-3 py-2 text-sm text-[color:var(--foreground)] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                  value={graphStylePreset}
                  onChange={(e) => setGraphStylePreset(e.target.value as GraphStylePreset)}
                  aria-label="Graph style preset"
                >
                  {GRAPH_STYLE_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>
      )}

      <div
        className={
          isEmbed ? "flex flex-col gap-4" : "flex flex-col gap-5 xl:flex-row xl:items-start"
        }
      >
        <div className="min-w-0 flex-1 space-y-4">
          {model.isSparse ? (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-xs leading-relaxed text-amber-950/90 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100/90">
              This view looks sparse — {model.sparseHint}
            </div>
          ) : null}

          <div
            ref={wrapRef}
            className={`relative overflow-hidden rounded-[1.35rem] border ${
              graphStylePreset === "constellation" ? "border-white/12" : "border-[color:var(--border)]/65"
            } ${graphCanvasBackgroundClass(graphStylePreset)}`}
            onDoubleClick={(e) => {
              if (!isEmbed || !onRequestExpand) return;
              if ((e.target as HTMLElement).closest("button")) return;
              onRequestExpand();
            }}
          >
            <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-1.5">
              <span
                className={`rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${graphHintChipClass(graphStylePreset)}`}
              >
                {isEmbed
                  ? "Pan · scroll zoom · double-click graph for full view"
                  : effectiveGraphMode === "2d"
                    ? "Pan · scroll zoom · drag nodes · hover for detail"
                    : "3D Explore · orbit · scroll zoom · shallow depth"}
              </span>
            </div>
            <div
              className={`pointer-events-auto absolute right-2 top-2 z-10 flex flex-col gap-1.5 rounded-2xl border p-1.5 ${graphFloatingChromeClass(graphStylePreset)}`}
            >
              <Button
                type="button"
                variant="secondary"
                className="h-8 min-w-[2.75rem] px-2 text-[11px] font-semibold shadow-sm"
                title={effectiveGraphMode === "2d" ? "Zoom in" : "Zoom in"}
                onClick={() =>
                  effectiveGraphMode === "2d"
                    ? fg2dRef.current?.zoom(1.32, 280)
                    : nudgeCameraZoom(0.88)
                }
              >
                +
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-8 min-w-[2.75rem] px-2 text-[11px] font-semibold shadow-sm"
                title="Zoom out"
                onClick={() =>
                  effectiveGraphMode === "2d"
                    ? fg2dRef.current?.zoom(0.76, 280)
                    : nudgeCameraZoom(1.14)
                }
              >
                −
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-8 min-w-[2.75rem] px-2 text-[11px] font-semibold shadow-sm"
                title="Fit view"
                onClick={() =>
                  (effectiveGraphMode === "2d" ? fg2dRef.current : fg3dRef.current)?.zoomToFit(420, 52)
                }
              >
                Fit
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-8 min-w-[2.75rem] px-2 text-[11px] font-semibold shadow-sm"
                title="Re-layout"
                onClick={() =>
                  (effectiveGraphMode === "2d" ? fg2dRef.current : fg3dRef.current)?.d3ReheatSimulation()
                }
              >
                Layout
              </Button>
              {isEmbed && onRequestExpand ? (
                <Button
                  type="button"
                  variant="primary"
                  className="h-8 min-w-[2.75rem] px-2 text-[11px] font-semibold shadow-sm"
                  title="Open full collaboration landscape"
                  onClick={onRequestExpand}
                >
                  Full
                </Button>
              ) : null}
            </div>

            {effectiveGraphMode === "2d" ? (
              <ForceGraph2D
                key="collab-landscape-2d"
                ref={fg2dRef}
                width={box.w}
                height={box.h}
                graphData={graphData2d}
                backgroundColor="transparent"
                nodeRelSize={NODE_REL_2D}
                nodeVal="val"
                nodeLabel={graphNodeTooltip}
                nodeCanvasObjectMode={() => "replace"}
                nodeCanvasObject={paintNode2d}
                linkColor={linkPaint2d.color}
                linkWidth={linkPaint2d.width}
                linkDirectionalParticles={
                  graphStylePreset === "constellation" ? 0.035 : graphStylePreset === "scientific_atlas" ? 0.05 : 0.072
                }
                linkDirectionalParticleSpeed={0.003}
                linkDirectionalParticleWidth={
                  graphStylePreset === "constellation" ? 0.48 : graphStylePreset === "scientific_atlas" ? 0.55 : 0.62
                }
                onNodeHover={(n) => setHoverId(n ? (n as GraphNode).id : null)}
                onNodeClick={(n) => {
                  const gn = n as GraphNode;
                  setSelectedClusterKey(null);
                  setSelectedNodeId((prev) => (prev === gn.id ? null : gn.id));
                }}
                onBackgroundClick={() => {
                  setSelectedNodeId(null);
                  setSelectedClusterKey(null);
                }}
                onEngineTick={on2dEngineTick}
                cooldownTicks={130}
                d3AlphaDecay={0.022}
                d3VelocityDecay={0.36}
                enablePanInteraction
                enableZoomInteraction
                enablePointerInteraction
                enableNodeDrag
              />
            ) : (
              <ForceGraph3D
                key={`collab-landscape-3d-${graphStylePreset}`}
                ref={fg3dRef as never}
                width={box.w}
                height={box.h}
                graphData={graphData3d as never}
                backgroundColor={
                  graphStylePreset === "constellation"
                    ? "#0b172c"
                    : graphStylePreset === "scientific_atlas"
                      ? "#f3ebe3"
                      : "#ebe9e4"
                }
                showNavInfo={false}
                rendererConfig={{ preserveDrawingBuffer: true, antialias: true }}
                nodeThreeObject={nodeThreeObject}
                nodeLabel={graphNodeTooltip}
                linkColor={linkPaint3d.color}
                linkWidth={linkPaint3d.width}
                linkDirectionalParticles={
                  graphStylePreset === "constellation" ? 0.12 : graphStylePreset === "scientific_atlas" ? 0.16 : 0.2
                }
                linkDirectionalParticleSpeed={0.004}
                linkDirectionalParticleWidth={
                  graphStylePreset === "constellation" ? 0.55 : graphStylePreset === "scientific_atlas" ? 0.62 : 0.72
                }
                onNodeHover={(n) => setHoverId(n ? (n as GraphNode).id : null)}
                onNodeClick={(n) => {
                  const gn = n as GraphNode;
                  setSelectedClusterKey(null);
                  setSelectedNodeId((prev) => (prev === gn.id ? null : gn.id));
                }}
                onBackgroundClick={() => {
                  setSelectedNodeId(null);
                  setSelectedClusterKey(null);
                }}
                onEngineTick={on3dEngineTick}
                cooldownTicks={130}
                d3AlphaDecay={0.024}
                d3VelocityDecay={0.38}
                enablePointerInteraction
                enableNavigationControls
                enableNodeDrag
              />
            )}
          </div>

          {!isEmbed ? (
            <>
              <details
                className="rounded-[1.15rem] border border-[color:var(--border)]/60 bg-[#fdfcfa]/90 shadow-sm"
                open={clusterDrawerOpen}
                onToggle={(e) => setClusterDrawerOpen((e.target as HTMLDetailsElement).open)}
              >
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-[color:var(--foreground)]">
                  Clusters & legend
                  <span className="ml-2 font-normal text-[color:var(--muted-foreground)]">
                    ({model.clusterSummaries.length}) · click to isolate
                  </span>
                </summary>
                <div className="flex flex-wrap gap-2 border-t border-[color:var(--border)]/50 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => setSelectedClusterKey(null)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-black/8 transition ${
                      selectedClusterKey === null
                        ? "bg-[color:var(--foreground)] text-[color:var(--background)]"
                        : "bg-white/90"
                    }`}
                  >
                    All clusters
                  </button>
                  {model.clusterSummaries.slice(0, 20).map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => {
                        setSelectedNodeId(null);
                        setSelectedClusterKey((prev) => (prev === c.key ? null : c.key));
                      }}
                      className={`inline-flex max-w-[260px] items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs shadow-sm transition ${
                        selectedClusterKey === c.key
                          ? "border-[color:var(--foreground)]/40 bg-[color:var(--foreground)]/8"
                          : "border-[color:var(--border)]/60 bg-white/95"
                      }`}
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.displayName}</span>
                        <span className="tabular-nums text-[color:var(--muted-foreground)]">
                          {c.investigatorCount} investigators
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </details>

              <LandscapeTables
                tab={tableTab}
                onTab={setTableTab}
                investigatorRows={investigatorRows}
                clusters={model.clusterSummaries}
                clusterGrowthByKey={clusterGrowthByKey}
                collabRows={collabRows}
                opportunities={model.opportunities}
                scrollBody={fullScreenLayout}
                onPickInvestigator={(id) => {
                  setSelectedClusterKey(null);
                  setSelectedNodeId(id);
                }}
                onPickCluster={(key) => {
                  setSelectedNodeId(null);
                  setSelectedClusterKey(key);
                }}
              />
            </>
          ) : null}
        </div>

        {!isEmbed ? (
        <aside className="w-full shrink-0 space-y-4 xl:sticky xl:top-4 xl:w-[360px]">
          <InspectorPanel
            model={model}
            selectedNode={selectedNode}
            selectedCluster={selectedCluster}
            introPaths={introPaths}
            recentSignals={recentSignalsForSelected}
            topCollaborators={topCollaboratorsForSelected}
            opportunitiesForSelected={opportunitiesForSelected}
            fundingHighlight={fundingHighlight}
            pinned={pinned}
            onPin={(id) => {
              setPinned((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            onClearSelection={() => {
              setSelectedNodeId(null);
              setSelectedClusterKey(null);
            }}
          />
        </aside>
        ) : null}
      </div>
    </div>
  );
}

function InspectorPanel({
  model,
  selectedNode,
  selectedCluster,
  introPaths,
  recentSignals,
  topCollaborators,
  opportunitiesForSelected,
  fundingHighlight,
  pinned,
  onPin,
  onClearSelection,
}: {
  model: CollaborationLandscapeModel;
  selectedNode: LandscapeNodeMetrics | undefined;
  selectedCluster: LandscapeClusterSummary | undefined;
  introPaths: { target: string; via: string; targetName: string; viaName: string }[];
  recentSignals: VolumeItem[];
  topCollaborators: { id: string; name: string; strength: number }[];
  opportunitiesForSelected: import("@/lib/collaboration-landscape-model").LandscapeOpportunity[];
  fundingHighlight: boolean;
  pinned: Set<string>;
  onPin: (id: string) => void;
  onClearSelection: () => void;
}) {
  if (selectedNode) {
    const isPinned = pinned.has(selectedNode.id);
    return (
      <div className="rounded-[1.25rem] border border-[color:var(--border)]/70 bg-[#fdfcfa] p-5 shadow-[0_22px_44px_-30px_rgba(38,32,58,0.55)]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Investigator
            </p>
            <h4 className="mt-1 text-lg font-semibold leading-snug text-[color:var(--foreground)]">
              {selectedNode.name}
            </h4>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">{selectedNode.program}</p>
            <p className="text-xs text-[color:var(--muted-foreground)]">{selectedNode.role}</p>
            <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">
              Cluster:{" "}
              <span className="font-medium text-[color:var(--foreground)]/90">{selectedNode.louvainCluster}</span>
            </p>
            {fundingHighlight && selectedNode.grants > 0 ? (
              <p className="mt-1 text-[11px] font-medium text-amber-900/90 dark:text-amber-200/90">
                Funding overlay: {selectedNode.grants} grant-linked signal
                {selectedNode.grants === 1 ? "" : "s"} in horizon
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <Button type="button" variant="secondary" className="h-8 px-2 text-[11px]" onClick={() => onPin(selectedNode.id)}>
              {isPinned ? "Unpin" : "Pin label"}
            </Button>
            <Button type="button" variant="ghost" className="h-8 px-2 text-[11px]" onClick={onClearSelection}>
              Clear
            </Button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <Metric label="Signals (pub/funding)" value={String(selectedNode.signalsCollab)} />
          <Metric label="Publications" value={String(selectedNode.publications)} />
          <Metric label="Grants" value={String(selectedNode.grants)} />
          <Metric label="Collaborators" value={String(selectedNode.collaboratorCount)} />
          <Metric label="Centrality (norm.)" value={selectedNode.centrality.toFixed(2)} />
          <Metric label="Bridge score" value={selectedNode.bridgeScore.toFixed(2)} />
          <Metric label="Recent activity" value={String(selectedNode.recentActivity)} />
        </dl>

        <div className="mt-4 border-t border-[color:var(--border)]/55 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Suggested collaboration opportunities
          </p>
          {opportunitiesForSelected.length === 0 ? (
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
              No latent topical pairs detected with this investigator in the sampled opportunity set.
            </p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs leading-relaxed">
              {opportunitiesForSelected.slice(0, 5).map((o, i) => (
                <li key={i} className="rounded-lg border border-[color:var(--border)]/50 bg-white/60 px-2.5 py-2 dark:bg-black/10">
                  <span className="font-semibold text-[color:var(--foreground)]">{o.investigatorNames.join(" · ")}</span>
                  <p className="mt-1 text-[color:var(--muted-foreground)]">{o.rationale}</p>
                  <p className="mt-1 text-[11px] text-[color:var(--muted-foreground)]">{o.evidence}</p>
                  <p className="mt-1 text-[11px] font-medium text-[color:var(--foreground)]/90">{o.suggestedAction}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 border-t border-[color:var(--border)]/55 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Top topics
          </p>
          <p className="mt-1 text-sm text-[color:var(--foreground)]/95">
            {selectedNode.topTopics.length ? selectedNode.topTopics.join(", ") : "—"}
          </p>
        </div>

        <div className="mt-4 border-t border-[color:var(--border)]/55 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Top collaborators (this view)
          </p>
          {topCollaborators.length === 0 ? (
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">No edges after filters.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs">
              {topCollaborators.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <Link href={`/entities/${c.id}/edit`} className="min-w-0 truncate font-medium hover:underline">
                    {c.name}
                  </Link>
                  <span className="shrink-0 tabular-nums text-[color:var(--muted-foreground)]">{c.strength}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 border-t border-[color:var(--border)]/55 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Recent signals
          </p>
          {recentSignals.length === 0 ? (
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">None in this horizon.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs">
              {recentSignals.map((it) => (
                <li key={it.id}>
                  <Link href={`/items/${it.id}`} className="line-clamp-2 font-medium leading-snug hover:underline">
                    {it.title?.trim() || "(Untitled)"}
                  </Link>
                  <p className="mt-0.5 text-[color:var(--muted-foreground)]">
                    {it.category ?? "—"}
                    {it.published_at
                      ? ` · ${new Date(it.published_at).toLocaleDateString()}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 border-t border-[color:var(--border)]/55 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Why they matter
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
            {selectedNode.centrality >= 0.55
              ? "High centrality — bridges multiple active collaboration streams in this horizon."
              : selectedNode.bridgeScore >= 0.42
                ? "Bridge-like profile — connects distinct clusters; useful for cross-program introductions."
                : selectedNode.recentActivity >= 3
                  ? "Elevated recent signal velocity — good moment for coordinated outreach."
                  : "Important contextual node in the local collaboration fabric; pair with neighbor strength when prioritizing intros."}
          </p>
        </div>

        <div className="mt-4 border-t border-[color:var(--border)]/55 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Suggested introduction paths
          </p>
          {introPaths.length === 0 ? (
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">No non-redundant two-hop paths found.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-xs">
              {introPaths.map((p) => (
                <li key={p.target} className="text-[color:var(--foreground)]/90">
                  Via <span className="font-medium">{p.viaName}</span> →{" "}
                  <Link href={`/entities/${p.target}/edit`} className="font-medium underline-offset-4 hover:underline">
                    {p.targetName}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4">
          <Link
            href={`/entities/${selectedNode.id}/edit`}
            className="text-xs font-semibold text-[color:var(--accent)] underline-offset-4 hover:underline"
          >
            Open investigator profile →
          </Link>
        </div>
      </div>
    );
  }

  if (selectedCluster) {
    return (
      <div className="rounded-[1.25rem] border border-[color:var(--border)]/70 bg-[#fdfcfa] p-5 shadow-[0_22px_44px_-30px_rgba(38,32,58,0.55)]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Cluster
            </p>
            <h4 className="mt-1 text-lg font-semibold leading-snug text-[color:var(--foreground)]">
              {selectedCluster.displayName}
            </h4>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">{selectedCluster.key}</p>
          </div>
          <Button type="button" variant="ghost" className="h-8 shrink-0 px-2 text-[11px]" onClick={onClearSelection}>
            Clear
          </Button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <Metric label="Investigators" value={String(selectedCluster.investigatorCount)} />
          <Metric label="Shared signals (internal)" value={String(selectedCluster.sharedSignalCount)} />
          <Metric label="Recent activity" value={String(selectedCluster.recentActivity)} />
        </dl>

        <div className="mt-4 border-t border-[color:var(--border)]/55 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Dominant topics
          </p>
          <p className="mt-1 text-sm">{selectedCluster.topTopics.join(", ") || "—"}</p>
        </div>

        <div className="mt-4 grid gap-3 border-t border-[color:var(--border)]/55 pt-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Top investigators
            </p>
            <ul className="mt-1 space-y-1 text-xs">
              {selectedCluster.topInvestigators.map((x) => (
                <li key={x.id}>{x.name}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Bridge investigators
            </p>
            <ul className="mt-1 space-y-1 text-xs">
              {selectedCluster.bridgeInvestigators.map((x) => (
                <li key={x.id}>
                  {x.name}{" "}
                  <span className="tabular-nums text-[color:var(--muted-foreground)]">({x.bridge.toFixed(2)})</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 border-t border-[color:var(--border)]/55 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Strategic opportunity
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
            {selectedCluster.strategicSummary}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[1.25rem] border border-[color:var(--border)]/70 bg-[#fdfcfa] p-5 shadow-[0_22px_44px_-30px_rgba(38,32,58,0.55)]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
        Network insights
      </p>
      <h4 className="mt-1 text-lg font-semibold text-[color:var(--foreground)]">Landscape summary</h4>
      <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
        Select an investigator or cluster on the canvas or from the tables. Heuristic detectors surface bridges,
        topical overlap without edges, and recency-weighted ties — refine horizon and edge filters to sharpen the
        narrative.
      </p>
      <dl className="mt-4 space-y-2 border-t border-[color:var(--border)]/55 pt-4 text-xs">
        <Metric label="Investigators" value={String(model.global.investigatorCount)} />
        <Metric label="Clusters (Louvain)" value={String(model.global.clusterCount)} />
        <Metric label="Shared pub/funding signals" value={String(model.global.sharedSignals)} />
        <Metric label="Strongest cluster" value={model.global.strongestCluster} />
        <Metric label="Emerging-heavy edges" value={String(model.global.emergingCollaborations)} />
      </dl>
      <div className="mt-4 border-t border-[color:var(--border)]/55 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Bridge investigators
        </p>
        <ul className="mt-2 space-y-1 text-xs">
          {model.global.bridgeLeaders.map((b) => (
            <li key={b.id}>
              {b.name}{" "}
              <span className="tabular-nums text-[color:var(--muted-foreground)]">({b.bridge.toFixed(2)})</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 border-t border-[color:var(--border)]/55 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Grant strategy overlay (preview)
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
          Clusters with high grant signal totals and bridge investigators are strong anchors for aligned FOAs and
          multi-PI scaffolding — combine with the Opportunities tab for latent topical pairs.
        </p>
      </div>
      <div className="mt-4 border-t border-[color:var(--border)]/55 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Suggested opportunities
        </p>
        {model.opportunities.length === 0 ? (
          <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">No latent overlap pairs in the sampled set.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-xs leading-relaxed">
            {model.opportunities.slice(0, 4).map((o, i) => (
              <li key={i}>
                <span className="font-medium text-[color:var(--foreground)]">{o.type}</span>: {o.rationale}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[color:var(--muted-foreground)]">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums text-[color:var(--foreground)]">{value}</dd>
    </div>
  );
}

function LandscapeTables({
  tab,
  onTab,
  investigatorRows,
  clusters,
  clusterGrowthByKey,
  collabRows,
  opportunities,
  scrollBody = false,
  onPickInvestigator,
  onPickCluster,
}: {
  tab: "investigators" | "clusters" | "collaborations" | "opportunities";
  onTab: (t: "investigators" | "clusters" | "collaborations" | "opportunities") => void;
  investigatorRows: LandscapeNodeMetrics[];
  clusters: LandscapeClusterSummary[];
  clusterGrowthByKey: Map<string, "High" | "Medium" | "Emerging">;
  collabRows: (LandscapeLink & {
    aName: string;
    bName: string;
    recent: string;
    recentWhenLabel: string;
    recentMs: number;
  })[];
  opportunities: import("@/lib/collaboration-landscape-model").LandscapeOpportunity[];
  scrollBody?: boolean;
  onPickInvestigator: (id: string) => void;
  onPickCluster: (key: string) => void;
}) {
  const theadSticky = scrollBody
    ? "sticky top-0 z-[1] bg-[#fdfcfa] shadow-[0_1px_0_rgba(0,0,0,0.06)] dark:bg-[color:var(--card)]"
    : "";
  const tabs: { id: typeof tab; label: string }[] = [
    { id: "investigators", label: "Investigators" },
    { id: "clusters", label: "Clusters" },
    { id: "collaborations", label: "Collaborations" },
    { id: "opportunities", label: "Opportunities" },
  ];
  return (
    <div className="rounded-[1.25rem] border border-[color:var(--border)]/65 bg-[#fdfcfa]/95 shadow-sm">
      <div className="flex flex-wrap gap-1 border-b border-[color:var(--border)]/55 p-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.id ? "bg-[color:var(--foreground)] text-[color:var(--background)]" : "text-[color:var(--muted-foreground)] hover:bg-black/[0.04]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        className={
          scrollBody
            ? "max-h-[min(52vh,560px)] overflow-auto overscroll-contain p-3"
            : "overflow-x-auto p-3"
        }
      >
        {tab === "investigators" ? (
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className={`text-[color:var(--muted-foreground)] ${theadSticky}`}>
              <tr className="border-b border-[color:var(--border)]/60">
                <th className="pb-2 pr-2 font-medium">Name</th>
                <th className="pb-2 pr-2 font-medium">Program</th>
                <th className="pb-2 pr-2 font-medium tabular-nums">Signals</th>
                <th className="pb-2 pr-2 font-medium tabular-nums">Publications</th>
                <th className="pb-2 pr-2 font-medium tabular-nums">Grants</th>
                <th className="pb-2 pr-2 font-medium tabular-nums">Collaborators</th>
                <th className="pb-2 pr-2 font-medium tabular-nums">Centrality</th>
                <th className="pb-2 pr-2 font-medium tabular-nums">Bridge score</th>
                <th className="pb-2 font-medium tabular-nums">Recent activity</th>
              </tr>
            </thead>
            <tbody>
              {investigatorRows.map((n) => (
                <tr key={n.id} className="border-b border-[color:var(--border)]/40 last:border-0">
                  <td className="py-2 pr-2">
                    <button type="button" className="text-left font-medium hover:underline" onClick={() => onPickInvestigator(n.id)}>
                      {n.name}
                    </button>
                  </td>
                  <td className="max-w-[200px] truncate py-2 pr-2 text-[color:var(--muted-foreground)]">{n.program}</td>
                  <td className="py-2 pr-2 tabular-nums">{n.signalsCollab}</td>
                  <td className="py-2 pr-2 tabular-nums">{n.publications}</td>
                  <td className="py-2 pr-2 tabular-nums">{n.grants}</td>
                  <td className="py-2 pr-2 tabular-nums">{n.collaboratorCount}</td>
                  <td className="py-2 pr-2 tabular-nums">{n.centrality.toFixed(2)}</td>
                  <td className="py-2 pr-2 tabular-nums">{n.bridgeScore.toFixed(2)}</td>
                  <td className="py-2 tabular-nums">{n.recentActivity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {tab === "clusters" ? (
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className={`text-[color:var(--muted-foreground)] ${theadSticky}`}>
              <tr className="border-b border-[color:var(--border)]/60">
                <th className="pb-2 pr-2 font-medium">Cluster name</th>
                <th className="pb-2 pr-2 font-medium tabular-nums">Investigators</th>
                <th className="pb-2 pr-2 font-medium tabular-nums">Shared signals</th>
                <th className="pb-2 pr-2 font-medium">Top topics</th>
                <th className="pb-2 pr-2 font-medium">Top investigators</th>
                <th className="pb-2 font-medium">Growth</th>
              </tr>
            </thead>
            <tbody>
              {clusters.map((c) => (
                <tr key={c.key} className="border-b border-[color:var(--border)]/40 last:border-0">
                  <td className="py-2 pr-2">
                    <button type="button" className="inline-flex items-center gap-2 text-left font-medium hover:underline" onClick={() => onPickCluster(c.key)}>
                      <span className="size-2 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: c.color }} />
                      {c.displayName}
                    </button>
                  </td>
                  <td className="py-2 pr-2 tabular-nums">{c.investigatorCount}</td>
                  <td className="py-2 pr-2 tabular-nums">{c.sharedSignalCount}</td>
                  <td className="max-w-[240px] truncate py-2 pr-2">{c.topTopics.join(", ")}</td>
                  <td className="max-w-[220px] truncate py-2 pr-2 text-[color:var(--muted-foreground)]">
                    {c.topInvestigators.map((x) => x.name).join(", ") || "—"}
                  </td>
                  <td className="py-2 font-medium tabular-nums text-[color:var(--foreground)]/90">
                    {clusterGrowthByKey.get(c.key) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {tab === "collaborations" ? (
          <table className="w-full min-w-[880px] text-left text-xs">
            <thead className={`text-[color:var(--muted-foreground)] ${theadSticky}`}>
              <tr className="border-b border-[color:var(--border)]/60">
                <th className="pb-2 pr-2 font-medium">Investigator A</th>
                <th className="pb-2 pr-2 font-medium">Investigator B</th>
                <th className="pb-2 pr-2 font-medium tabular-nums">Shared publications</th>
                <th className="pb-2 pr-2 font-medium tabular-nums">Shared grants</th>
                <th className="pb-2 pr-2 font-medium tabular-nums">Shared topics</th>
                <th className="pb-2 pr-2 font-medium tabular-nums">Strength</th>
                <th className="pb-2 font-medium">Most recent activity</th>
              </tr>
            </thead>
            <tbody>
              {collabRows.map((r, i) => (
                <tr key={`${r.source}-${r.target}-${i}`} className="border-b border-[color:var(--border)]/40 last:border-0">
                  <td className="py-2 pr-2">
                    <button type="button" className="hover:underline" onClick={() => onPickInvestigator(r.source)}>
                      {r.aName}
                    </button>
                  </td>
                  <td className="py-2 pr-2">
                    <button type="button" className="hover:underline" onClick={() => onPickInvestigator(r.target)}>
                      {r.bName}
                    </button>
                  </td>
                  <td className="py-2 pr-2 tabular-nums">{r.sharedPapers}</td>
                  <td className="py-2 pr-2 tabular-nums">{r.sharedGrants}</td>
                  <td className="py-2 pr-2 tabular-nums">{r.sharedTopicScore.toFixed(2)}</td>
                  <td className="py-2 pr-2 tabular-nums">{r.strength}</td>
                  <td className="py-2 text-[color:var(--muted-foreground)]">{r.recentWhenLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {tab === "opportunities" ? (
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className={`text-[color:var(--muted-foreground)] ${theadSticky}`}>
              <tr className="border-b border-[color:var(--border)]/60">
                <th className="pb-2 pr-2 font-medium">Suggested collaboration</th>
                <th className="pb-2 pr-2 font-medium">Why it is promising</th>
                <th className="pb-2 pr-2 font-medium">Evidence</th>
                <th className="pb-2 font-medium">Suggested action</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.slice(0, 40).map((o, i) => (
                <tr key={i} className="border-b border-[color:var(--border)]/40 last:border-0">
                  <td className="py-2 pr-2 align-top font-semibold text-[color:var(--foreground)]">{o.investigatorNames.join(" · ")}</td>
                  <td className="max-w-[260px] py-2 pr-2 align-top text-[color:var(--muted-foreground)]">{o.rationale}</td>
                  <td className="max-w-[240px] py-2 pr-2 align-top text-[color:var(--muted-foreground)]">{o.evidence}</td>
                  <td className="max-w-[260px] py-2 align-top">{o.suggestedAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}

export function CollaborationLandscapeDialog({
  open,
  onClose,
  items,
  entityNameById,
  entityMetaById,
  deletingIds,
}: {
  open: boolean;
  onClose: () => void;
  items: VolumeItem[];
  entityNameById: Record<string, string>;
  entityMetaById: Record<string, DashboardEntityMeta>;
  deletingIds: Set<string>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusT = window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusT);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-[color:var(--background)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="collab-landscape-dialog-title"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--border)] px-4 py-3">
        <h2 id="collab-landscape-dialog-title" className="text-lg font-semibold text-[color:var(--foreground)]">
          Collaboration landscape
        </h2>
        <Button ref={closeRef} type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4 md:px-6">
        <CollaborationLandscape
          variant="full"
          fullScreenLayout
          items={items}
          entityNameById={entityNameById}
          entityMetaById={entityMetaById}
          deletingIds={deletingIds}
        />
      </div>
    </div>,
    document.body,
  );
}
