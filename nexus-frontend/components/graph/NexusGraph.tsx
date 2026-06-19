"use client";
import { useEffect, useRef, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { GraphNode, GraphEdge, GraphResponse, ENTITY_META, EntityType } from "@/types/graph";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-cyan-400/40 text-sm font-mono tracking-widest animate-pulse">INITIALIZING CANVAS...</div>
    </div>
  ),
});

interface NexusGraphProps {
  graphData: GraphResponse;
  onNodeClick: (node: GraphNode) => void;
  onNodeExpand: (node: GraphNode) => void;
  selectedNodeId: string | null;
  highlightContradictions: boolean;
  highlightBridges: boolean;
}

function toForceData(g: GraphResponse) {
  return {
    nodes: g.nodes.map(n => ({ ...n })),
    links: g.edges.map(e => ({
      ...e,
      source: typeof e.source === "object" ? (e.source as GraphNode).id : e.source,
      target: typeof e.target === "object" ? (e.target as GraphNode).id : e.target,
    })),
  };
}

export default function NexusGraph({
  graphData, onNodeClick, onNodeExpand,
  selectedNodeId, highlightContradictions, highlightBridges,
}: NexusGraphProps) {
  const fgRef = useRef<any>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const forceData = toForceData(graphData);

  useEffect(() => {
    if (fgRef.current) {
      const ref = fgRef.current;
      // Increased repulsion for better spacing
      ref.d3Force("charge")?.strength((n: GraphNode) => n.is_query_node ? -1800 : -600 - n.val * 60);
      // Increased link distance and reduced strength for a more breathable layout
      ref.d3Force("link")?.distance((l: GraphEdge) => 220 / (typeof l.weight === "number" ? Math.max(l.weight, 0.5) : 1)).strength(0.35);
      ref.d3Force("center")?.strength(0.06);
      
      setTimeout(() => ref.zoomToFit(400, 80), 600);
    }
  }, [graphData]);

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, gs: number) => {
    const { x = 0, y = 0 } = node;
    const isSel    = node.id === selectedNodeId;
    const isHov    = node.id === hoveredId;
    const isQuery  = node.is_query_node;
    const isContra = node.has_contradiction && highlightContradictions;
    const isBridge = node.is_bridge && highlightBridges;

    const baseR = isQuery ? 22 : 6 + node.val * 2.2;
    const radius = isSel ? baseR * 1.25 : baseR;
    const color  = isBridge ? "#00D4FF" : isContra ? "#F87171" : (node.color || "#6B7280");

    // Outer glow
    if (isSel || isQuery || isHov || isContra || isBridge) {
      const glowR = radius + (isSel ? 12 : 7);
      const g = ctx.createRadialGradient(x, y, radius * 0.4, x, y, glowR);
      g.addColorStop(0, color + "55");
      g.addColorStop(1, color + "00");
      ctx.beginPath(); ctx.arc(x, y, glowR, 0, 2 * Math.PI);
      ctx.fillStyle = g; ctx.fill();
    }

    // Contradiction pulsing ring
    if (isContra) {
      ctx.beginPath(); ctx.arc(x, y, radius + 5, 0, 2 * Math.PI);
      ctx.strokeStyle = "#F87171AA"; ctx.lineWidth = 1.5 / gs; ctx.stroke();
    }

    // Bridge ring (cyan dashed)
    if (isBridge) {
      ctx.save();
      ctx.setLineDash([3 / gs, 3 / gs]);
      ctx.beginPath(); ctx.arc(x, y, radius + 4, 0, 2 * Math.PI);
      ctx.strokeStyle = "#00D4FFAA"; ctx.lineWidth = 1.5 / gs; ctx.stroke();
      ctx.restore();
    }

    // Node fill
    ctx.beginPath(); ctx.arc(x, y, radius, 0, 2 * Math.PI);
    if (isQuery) {
      const fill = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 1, x, y, radius);
      fill.addColorStop(0, "#60efff"); fill.addColorStop(1, "#00A8CC");
      ctx.fillStyle = fill;
    } else {
      ctx.fillStyle = color + (isSel ? "ff" : isHov ? "dd" : "bb");
    }
    ctx.fill();
    ctx.strokeStyle = isSel ? "#fff" : color;
    ctx.lineWidth = (isSel ? 2 : 1) / gs;
    ctx.stroke();

    // Confidence dot (bottom-right corner)
    if (node.confidence != null && !isQuery && gs > 0.5) {
      const conf = node.confidence;
      const dotColor = conf >= 0.75 ? "#10B981" : conf >= 0.45 ? "#F59E0B" : "#F87171";
      const dotR = Math.max(3 / gs, 1.5);
      ctx.beginPath();
      ctx.arc(x + radius * 0.65, y + radius * 0.65, dotR, 0, 2 * Math.PI);
      ctx.fillStyle = dotColor; ctx.fill();
    }

    // Label
    const fz = isQuery ? Math.max(14 / gs, 3.5) : Math.max(11 / gs, 2.5);
    if (gs > 0.4 || isQuery || isSel) {
      ctx.font = `${isQuery ? "700" : "500"} ${fz}px "Space Grotesk", sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const label = node.name.length > 24 ? node.name.slice(0, 22) + "…" : node.name;
      const ly = y + radius + fz * 1.4;
      const tw = ctx.measureText(label).width;
      
      // Softer, rounded background for text readability
      ctx.fillStyle = "rgba(4,7,15,0.85)";
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(x - tw / 2 - 5, ly - fz * 0.75, tw + 10, fz * 1.5, 4 / gs);
        ctx.fill();
      } else {
        ctx.fillRect(x - tw / 2 - 5, ly - fz * 0.75, tw + 10, fz * 1.5);
      }
      
      // Optional subtle border
      if (typeof ctx.roundRect === "function") {
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 1 / gs;
        ctx.stroke();
      }

      ctx.fillStyle = isQuery ? "#00D4FF" : isSel ? "#ffffff" : color + "ee";
      ctx.fillText(label, x, ly);
    }

    // Icons on hover
    if (isHov && !isQuery && gs > 0.5) {
      const iz = Math.max(9 / gs, 3);
      ctx.font = `${iz}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff88";
      ctx.fillText("⊕", x + radius * 0.72, y - radius * 0.72);
    }

    // Contradiction badge
    if (isContra && gs > 0.5) {
      const bz = Math.max(8 / gs, 2.5);
      ctx.font = `${bz}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("⚠", x - radius * 0.72, y - radius * 0.72);
    }

    node.__bckgDimensions = [radius * 2, radius * 2];
  }, [selectedNodeId, hoveredId, highlightContradictions, highlightBridges]);

  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, gs: number) => {
    const { source: s, target: t } = link;
    if (!s?.x || !t?.x) return;

    const isSel      = s.id === selectedNodeId || t.id === selectedNodeId;
    const isContra   = link.is_contradicted && highlightContradictions;
    const w          = link.weight || 1;

    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y);

    if (isContra) {
      ctx.save();
      ctx.setLineDash([4 / gs, 4 / gs]);
      ctx.strokeStyle = "#F8717188";
      ctx.lineWidth   = (1.5 + w * 0.4) / gs;
      ctx.stroke(); ctx.restore();
    } else if (isSel) {
      ctx.strokeStyle = "#00D4FF66";
      ctx.lineWidth   = (1 + w * 0.5) / gs;
      ctx.stroke();
    } else {
      ctx.strokeStyle = `rgba(148,163,184,${0.07 + w * 0.05})`;
      ctx.lineWidth   = (0.5 + w * 0.25) / gs;
      ctx.stroke();
    }

    // Edge label on selection
    if (isSel && gs > 0.6) {
      const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
      const fz = Math.max(7 / gs, 2);
      ctx.font = `${fz}px "Space Grotesk", sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = isContra ? "#F8717188" : "#00D4FF88";
      ctx.fillText((link.relationship || "").replace(/_/g, " "), mx, my);
    }

    // Confidence score on edge
    if (link.confidence != null && isSel && gs > 0.8) {
      const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
      const conf = link.confidence as number;
      const cc = conf >= 0.75 ? "#10B981" : conf >= 0.45 ? "#F59E0B" : "#F87171";
      const fz = Math.max(6 / gs, 2);
      ctx.font = `${fz}px "Space Grotesk", sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = cc;
      ctx.fillText(`${Math.round(conf * 100)}%`, mx, my + 8 / gs);
    }
  }, [selectedNodeId, highlightContradictions]);

  return (
    <div className="w-full h-full relative bg-[#04070F]">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,212,255,0.04) 0%, rgba(124,58,237,0.03) 40%, transparent 70%)"
      }} />

      <ForceGraph2D
        ref={fgRef}
        graphData={forceData}
        nodeId="id" nodeVal="val" nodeColor="color"
        linkSource="source" linkTarget="target"
        nodeCanvasObject={paintNode} nodeCanvasObjectMode={() => "replace"}
        linkCanvasObject={paintLink} linkCanvasObjectMode={() => "replace"}
        linkDirectionalParticles={(l: any) => ((l.is_contradicted && highlightContradictions) || l.source.id === selectedNodeId || l.target.id === selectedNodeId) ? 2 : 0}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleColor={(l: any) => l.is_contradicted ? "#F87171" : "#00D4FF"}
        onNodeClick={(n: any) => onNodeClick(n as GraphNode)}
        onNodeRightClick={(n: any) => onNodeExpand(n as GraphNode)}
        onNodeHover={(n: any) => setHoveredId(n?.id || null)}
        onNodeDragEnd={(n: any) => { n.fx = n.x; n.fy = n.y; }}
        onBackgroundClick={() => forceData.nodes.forEach((n: any) => { n.fx = undefined; n.fy = undefined; })}
        cooldownTicks={120}
        backgroundColor="transparent"
        enableZoomInteraction enablePanInteraction
        minZoom={0.3} maxZoom={6}
        d3AlphaDecay={0.02} d3VelocityDecay={0.35}
      />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-4 text-[9px] font-mono text-slate-600 tracking-widest">
        <span>{graphData.node_count} NODES · {graphData.edge_count} EDGES</span>
        {graphData.has_contradictions && (
          <span className="text-red-500/70">⚠ {graphData.contradiction_count} CONTRADICTION{graphData.contradiction_count !== 1 ? "S" : ""}</span>
        )}
        {graphData.bridge_count > 0 && (
          <span className="text-cyan-600/70">◈ {graphData.bridge_count} BRIDGE{graphData.bridge_count !== 1 ? "S" : ""}</span>
        )}
        {graphData.avg_confidence > 0 && (
          <span className="text-emerald-700/70">CONF {Math.round(graphData.avg_confidence * 100)}%</span>
        )}
        {graphData.cached && <span className="text-cyan-800">CACHED</span>}
      </div>

      <div className="absolute bottom-4 right-4 text-[9px] font-mono text-slate-700 tracking-widest text-right">
        CLICK INSPECT · RIGHT-CLICK EXPAND
      </div>
    </div>
  );
}
