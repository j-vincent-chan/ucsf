"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d";
import type { DashboardEntityMeta, DashboardPayload } from "@/lib/dashboard-aggregate";
import {
  buildCollaborationGraphBundle,
  type CollaborationClusterMode,
} from "@/lib/dashboard-collaboration-graph";
import { Button } from "@/components/ui/button";

type VolumeItem = DashboardPayload["itemsForVolume"][number];

const CLUSTER_OPTIONS: { id: CollaborationClusterMode; label: string; hint: string }[] = [
  {
    id: "research_focus",
    label: "Primary Research Focus",
    hint: "Colored by People list role (faculty, lab, center, community).",
  },
  {
    id: "disease_area",
    label: "Primary Disease Area",
    hint: "Colored by program tier today; swap to disease tags when added to profiles.",
  },
  {
    id: "collaboration_cluster",
    label: "Collaboration cluster",
    hint: "Colored by network communities (Louvain): who tends to share publications or funding signals together.",
  },
];

type GraphNode = ReturnType<typeof buildCollaborationGraphBundle>["nodes"][number];
type GraphLink = ReturnType<typeof buildCollaborationGraphBundle>["links"][number];

function truncateLabel(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/** Match default node radius: sqrt(val) * nodeRelSize (see force-graph). */
function nodeRadius(n: GraphNode, nodeRelSize: number): number {
  const v = typeof n.val === "number" && n.val > 0 ? n.val : 1;
  return Math.sqrt(v) * nodeRelSize;
}

export function CollaborationNetworkGraph({
  items,
  entityNameById,
  entityMetaById,
  deletingIds,
}: {
  items: VolumeItem[];
  entityNameById: Record<string, string>;
  entityMetaById: Record<string, DashboardEntityMeta>;
  deletingIds: Set<string>;
}) {
  const [clusterMode, setClusterMode] = useState<CollaborationClusterMode>("collaboration_cluster");
  const fgRef = useRef<
    ForceGraphMethods<NodeObject<GraphNode>, LinkObject<GraphNode, GraphLink>> | undefined
  >(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 420 });

  const bundle = useMemo(
    () =>
      buildCollaborationGraphBundle(items, entityNameById, entityMetaById, clusterMode, deletingIds),
    [items, entityNameById, entityMetaById, clusterMode, deletingIds],
  );

  const graphData = useMemo(
    () => ({ nodes: bundle.nodes, links: bundle.links }),
    [bundle.nodes, bundle.links],
  );

  const maxLinkValue = useMemo(
    () => Math.max(1, ...bundle.links.map((l) => l.value)),
    [bundle.links],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const w = Math.max(280, Math.floor(r.width));
      const h = Math.max(360, Math.min(520, Math.floor(r.width * 0.42)));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || bundle.nodes.length === 0) return;
    const t = window.setTimeout(() => {
      fg.zoomToFit(400, 36);
    }, 500);
    return () => window.clearTimeout(t);
  }, [clusterMode, bundle.nodes.length, bundle.links.length]);

  const forcesSetupRef = useRef(false);
  useEffect(() => {
    forcesSetupRef.current = false;
  }, [clusterMode, bundle.nodes.length, bundle.links.length]);

  const onEngineTick = useCallback(() => {
    const fg = fgRef.current;
    if (!fg || forcesSetupRef.current) return;
    forcesSetupRef.current = true;
    const charge = fg.d3Force("charge");
    if (charge && typeof charge.strength === "function") {
      charge.strength(-140);
    }
    const link = fg.d3Force("link");
    if (link && typeof link.distance === "function") {
      link.distance((l: { value?: number }) => {
        const v = (l as GraphLink).value ?? 1;
        return 36 + Math.min(100, v * 14);
      });
    }
  }, []);

  const clusterHint = CLUSTER_OPTIONS.find((o) => o.id === clusterMode)?.hint ?? "";
  const clusterDimensionTitle =
    CLUSTER_OPTIONS.find((o) => o.id === clusterMode)?.label ?? "Clusters";

  const NODE_REL_SIZE = 5;
  const paintNodeLabels = useCallback(
    (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode;
      const r = nodeRadius(n, NODE_REL_SIZE);
      const mainPx = Math.max(7.5, Math.min(15, 11 / globalScale));
      const subPx = Math.max(6.5, Math.min(13, 9.25 / globalScale));
      const name = truncateLabel(n.name, 32);
      const cluster = truncateLabel(n.clusterKey, 40);

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const halo = Math.max(2, 2.8 / globalScale);
      const yName = r + 5 / globalScale;

      ctx.font = `600 ${mainPx}px ui-sans-serif, system-ui, sans-serif`;
      ctx.lineWidth = halo;
      ctx.strokeStyle = "rgba(255, 252, 248, 0.95)";
      ctx.fillStyle = "rgba(28, 26, 24, 0.94)";
      ctx.strokeText(name, 0, yName);
      ctx.fillText(name, 0, yName);

      ctx.font = `500 ${subPx}px ui-sans-serif, system-ui, sans-serif`;
      const yCluster = yName + mainPx * 1.22;
      ctx.strokeStyle = "rgba(255, 252, 248, 0.9)";
      ctx.fillStyle = "rgba(88, 82, 74, 0.92)";
      ctx.strokeText(cluster, 0, yCluster);
      ctx.fillText(cluster, 0, yCluster);
    },
    [],
  );

  if (bundle.nodes.length === 0) {
    return (
      <div className="rounded-2xl border border-[color:var(--border)]/80 bg-gradient-to-br from-[#faf7f2] via-white to-[#f0f4fa] px-4 py-10 text-center text-sm text-[color:var(--muted-foreground)]">
        No publication or funding signals with linked investigators in this range. Add co-listed
        investigators on shared PubMed or RePORTER items to see collaborations.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-[color:var(--muted-foreground)]">Cluster by</label>
          <select
            className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-1.5 text-sm text-[color:var(--foreground)] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            value={clusterMode}
            onChange={(e) => setClusterMode(e.target.value as CollaborationClusterMode)}
          >
            {CLUSTER_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => fgRef.current?.zoom(2, 400)}
          >
            Zoom in
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => fgRef.current?.zoom(0.5, 400)}
          >
            Zoom out
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => fgRef.current?.zoomToFit(400, 36)}
          >
            Fit view
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => fgRef.current?.d3ReheatSimulation()}
          >
            Re-layout
          </Button>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-[color:var(--muted-foreground)]">{clusterHint}</p>
      <p className="text-xs text-[color:var(--muted-foreground)]/90">
        Edges connect investigators who appear together on the same publication or funding signal (
        {bundle.collaborationItemCount} shared signals in range). Drag the canvas to pan; scroll or pinch
        to zoom; drag nodes to rearrange.
      </p>

      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-2xl border border-[color:var(--border)]/70 bg-gradient-to-b from-[#fbf9f5] via-white to-[#eef3fb] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
      >
        <ForceGraph2D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={graphData}
          backgroundColor="rgba(0,0,0,0)"
          nodeRelSize={NODE_REL_SIZE}
          nodeVal="val"
          nodeLabel={(n) => {
            const gn = n as GraphNode;
            return `${gn.name}\n${clusterDimensionTitle}: ${gn.clusterKey}`;
          }}
          nodeColor={(n) => (n as GraphNode).color}
          nodeCanvasObjectMode={() => "after"}
          nodeCanvasObject={paintNodeLabels}
          linkLabel={(l) => {
            const L = l as GraphLink;
            const w = L.value ?? 1;
            return `${w} shared signal${w === 1 ? "" : "s"}`;
          }}
          linkColor={(l) => {
            const v = (l as GraphLink).value ?? 1;
            const t = Math.min(1, v / maxLinkValue);
            const alpha = 0.12 + t * 0.45;
            return `rgba(72, 62, 120, ${alpha})`;
          }}
          linkWidth={(l) => 0.6 + Math.sqrt((l as GraphLink).value) * 0.85}
          linkDirectionalParticles={1}
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleWidth={1.2}
          onEngineTick={onEngineTick}
          cooldownTicks={120}
          d3AlphaDecay={0.022}
          d3VelocityDecay={0.35}
          enablePanInteraction
          enableZoomInteraction
        />
      </div>

      {bundle.legend.length > 0 ? (
        <div className="space-y-2 border-t border-[color:var(--border)]/60 pt-3">
          <p className="text-xs leading-snug text-[color:var(--foreground)]">
            <span className="font-semibold">{clusterDimensionTitle}</span>
            <span className="text-[color:var(--muted-foreground)]">
              {" "}
              — each color is one cluster on the graph. Count is investigators in that cluster.
            </span>
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-2.5">
            {bundle.legend.slice(0, 16).map((row) => (
              <span
                key={row.key}
                className="inline-flex max-w-[min(100%,280px)] items-start gap-2 rounded-lg border border-[color:var(--border)]/50 bg-[color:var(--card)]/80 px-2 py-1.5 text-xs text-[color:var(--foreground)]/95 shadow-sm"
              >
                <span
                  className="mt-0.5 size-2.5 shrink-0 rounded-full shadow-sm ring-1 ring-black/5"
                  style={{ backgroundColor: row.color }}
                  aria-hidden
                />
                <span className="min-w-0 leading-snug">
                  <span className="font-medium break-words" title={row.key}>
                    {row.key}
                  </span>
                  <span className="block tabular-nums text-[color:var(--muted-foreground)]">
                    {row.count} investigator{row.count === 1 ? "" : "s"}
                  </span>
                </span>
              </span>
            ))}
            {bundle.legend.length > 16 ? (
              <span className="self-center text-xs text-[color:var(--muted-foreground)]">
                +{bundle.legend.length - 16} more clusters (hover nodes for full labels)
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
