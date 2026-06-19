"use client";
import { useState } from "react";
import { GraphNode, GraphResponse, ENTITY_META, EntityType, Contradiction, HopPath, ResearchReport } from "@/types/graph";
import { PipelineState } from "@/hooks/useNexusSearch";
import ContradictionPanel from "@/components/intelligence/ContradictionPanel";
import MultiHopPanel from "@/components/intelligence/MultiHopPanel";
import ReportPanel from "@/components/intelligence/ReportPanel";

type Tab = "inspect" | "contradict" | "discover" | "report";

interface SidebarProps {
  selectedNode: GraphNode | null;
  graphData: GraphResponse | null;
  pipeline: PipelineState;
  onExpandNode: (node: GraphNode) => void;
  searchHistory: string[];
  onHistoryClick: (q: string) => void;
  contradictions: Contradiction[];
  contradictionsLoading: boolean;
  hopPaths: HopPath[];
  hopPathsLoading: boolean;
  report: ResearchReport | null;
  reportLoading: boolean;
  onGenerateReport: () => void;
  onDiscoverHops: (node: GraphNode) => void;
}

// ── Pipeline progress ─────────────────────────────────────────────────────────
function PipelineProgress({ pipeline }: { pipeline: PipelineState }) {
  const stageOrder = ["SEARCHING","SCRAPING","EXTRACTING","WRITING_GRAPH","ANALYZING","COMPLETE"];
  const colors: Record<string, string> = {
    SEARCHING:"bg-blue-500", SCRAPING:"bg-violet-500", EXTRACTING:"bg-amber-500",
    WRITING_GRAPH:"bg-emerald-500", ANALYZING:"bg-cyan-400", COMPLETE:"bg-cyan-400", ERROR:"bg-red-500",
  };
  const icons: Record<string, string> = {
    SEARCHING:"⌕", SCRAPING:"⬇", EXTRACTING:"⚡", WRITING_GRAPH:"◈", ANALYZING:"⊕", COMPLETE:"✓", ERROR:"✗",
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-mono ${pipeline.stage === "ERROR" ? "text-red-400" : "text-cyan-400"} animate-pulse`}>
          {icons[pipeline.stage || "SEARCHING"] || "○"}
        </span>
        <span className="text-xs text-slate-300 font-mono">{pipeline.message}</span>
      </div>
      <div className="h-0.5 w-full bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${colors[pipeline.stage || "SEARCHING"]}`}
          style={{ width: `${pipeline.progress}%` }} />
      </div>
      <div className="flex gap-1 flex-wrap">
        {stageOrder.map((stage) => {
          const ci = stageOrder.indexOf(pipeline.stage || "");
          const si = stageOrder.indexOf(stage);
          const done = si < ci || pipeline.stage === "COMPLETE";
          const cur  = stage === pipeline.stage;
          return (
            <span key={stage} className={`text-[8px] font-mono px-1.5 py-0.5 rounded tracking-widest transition-all ${
              cur  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40" :
              done ? "bg-slate-700/50 text-slate-500" : "bg-slate-800/50 text-slate-700"
            }`}>{stage}</span>
          );
        })}
      </div>
    </div>
  );
}

// ── Node inspect card ─────────────────────────────────────────────────────────
function NodeCard({ node, onExpand, onDiscover }: { node: GraphNode; onExpand: () => void; onDiscover: () => void }) {
  const meta = ENTITY_META[node.type as EntityType] || ENTITY_META.OTHER;
  const conf = node.confidence;
  const confColor = conf == null ? null : conf >= 0.75 ? "#10B981" : conf >= 0.45 ? "#F59E0B" : "#F87171";
  const confLabel = conf == null ? null : conf >= 0.75 ? "HIGH" : conf >= 0.45 ? "MEDIUM" : "LOW";

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full tracking-widest"
            style={{ backgroundColor: meta.bgColor, color: meta.color, border: `1px solid ${meta.color}33` }}>
            {meta.label.toUpperCase()}
          </span>
          {node.is_query_node && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full tracking-widest bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">ROOT</span>
          )}
          {node.has_contradiction && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full tracking-widest bg-red-500/10 text-red-400 border border-red-500/30">⚠ CONFLICT</span>
          )}
          {node.is_bridge && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full tracking-widest bg-cyan-500/10 text-cyan-300 border border-cyan-400/30">◈ BRIDGE</span>
          )}
        </div>
        <h2 className="text-lg font-bold text-white leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {node.name}
        </h2>
      </div>

      {/* Relevance + confidence bars */}
      <div className="space-y-2">
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-mono text-slate-500">
            <span>RELEVANCE</span><span style={{ color: meta.color }}>{Math.round(node.relevance_score * 100)}%</span>
          </div>
          <div className="h-0.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${node.relevance_score * 100}%`, backgroundColor: meta.color }} />
          </div>
        </div>
        {conf != null && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>CONFIDENCE</span>
              <span style={{ color: confColor! }}>{confLabel} · {Math.round(conf * 100)}%</span>
            </div>
            <div className="h-0.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${conf * 100}%`, backgroundColor: confColor! }} />
            </div>
          </div>
        )}
      </div>

      <p className="text-sm text-slate-300 leading-relaxed" style={{ fontFamily: "Inter, sans-serif" }}>
        {node.description}
      </p>

      {node.claim && (
        <div className="rounded-lg p-2.5 border text-[11px] text-slate-400 italic"
          style={{ backgroundColor: "rgba(148,163,184,0.05)", borderColor: "rgba(148,163,184,0.1)" }}>
          "{node.claim}"
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700/50">
          <div className="text-[10px] font-mono text-slate-500 mb-1">CONNECTIONS</div>
          <div className="text-base font-bold" style={{ color: meta.color }}>{node.neighbor_count}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700/50">
          <div className="text-[10px] font-mono text-slate-500 mb-1">MASS</div>
          <div className="text-base font-bold text-slate-300">{node.val.toFixed(1)}×</div>
        </div>
      </div>

      {node.source_url && (
        <a href={node.source_url} target="_blank" rel="noopener noreferrer"
          className="block text-xs font-mono text-slate-500 hover:text-cyan-400 transition-colors truncate border border-slate-700/50 hover:border-cyan-500/30 rounded px-2.5 py-1.5">
          ↗ {node.source_url.replace(/https?:\/\/(www\.)?/, "").slice(0, 45)}
        </a>
      )}

      {!node.is_query_node && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onExpand}
            className="py-2 rounded-lg text-xs font-semibold transition-all border"
            style={{ fontFamily: "'Space Grotesk', sans-serif", backgroundColor: `${meta.color}10`, borderColor: `${meta.color}30`, color: meta.color }}>
            ⊕ Expand
          </button>
          <button onClick={onDiscover}
            className="py-2 rounded-lg text-xs font-semibold transition-all border"
            style={{ fontFamily: "'Space Grotesk', sans-serif", backgroundColor: "rgba(124,58,237,0.1)", borderColor: "rgba(124,58,237,0.3)", color: "#A78BFA" }}>
            ◈ Discover
          </button>
        </div>
      )}
    </div>
  );
}

// ── Graph summary ─────────────────────────────────────────────────────────────
function GraphSummary({ graphData }: { graphData: GraphResponse }) {
  const typeCounts = graphData.nodes.reduce<Record<string, number>>((a, n) => {
    if (!n.is_query_node) a[n.type] = (a[n.type] || 0) + 1;
    return a;
  }, {});

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-mono text-slate-500 tracking-widest mb-1">GRAPH OVERVIEW</div>
        <h2 className="text-base font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{graphData.query}</h2>
      </div>

      {/* Intelligence badges */}
      <div className="flex gap-2 flex-wrap">
        {graphData.avg_confidence > 0 && (
          <span className="text-[9px] font-mono px-2 py-1 rounded-full border"
            style={{ color: graphData.avg_confidence >= 0.7 ? "#10B981" : "#F59E0B",
              borderColor: graphData.avg_confidence >= 0.7 ? "#10B98133" : "#F59E0B33",
              backgroundColor: graphData.avg_confidence >= 0.7 ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.08)" }}>
            CONF {Math.round(graphData.avg_confidence * 100)}%
          </span>
        )}
        {graphData.has_contradictions && (
          <span className="text-[9px] font-mono px-2 py-1 rounded-full border text-red-400 border-red-500/30 bg-red-500/08">
            ⚠ {graphData.contradiction_count} CONFLICT{graphData.contradiction_count !== 1 ? "S" : ""}
          </span>
        )}
        {graphData.bridge_count > 0 && (
          <span className="text-[9px] font-mono px-2 py-1 rounded-full border text-cyan-400 border-cyan-500/30 bg-cyan-500/08">
            ◈ {graphData.bridge_count} BRIDGE{graphData.bridge_count !== 1 ? "S" : ""}
          </span>
        )}
      </div>

      <p className="text-sm text-slate-300 leading-relaxed" style={{ fontFamily: "Inter, sans-serif" }}>{graphData.summary}</p>

      <div className="space-y-1.5">
        <div className="text-[10px] font-mono text-slate-500 tracking-widest">ENTITY BREAKDOWN</div>
        {Object.entries(typeCounts).sort(([,a],[,b]) => b-a).map(([type, count]) => {
          const meta = ENTITY_META[type as EntityType] || ENTITY_META.OTHER;
          return (
            <div key={type} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
              <span className="text-xs text-slate-400 flex-1">{meta.label}</span>
              <span className="text-xs font-mono" style={{ color: meta.color }}>{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────
export default function Sidebar({
  selectedNode, graphData, pipeline, onExpandNode, searchHistory,
  onHistoryClick, contradictions, contradictionsLoading, hopPaths,
  hopPathsLoading, report, reportLoading, onGenerateReport, onDiscoverHops,
}: SidebarProps) {
  const [tab, setTab] = useState<Tab>("inspect");

  const tabs: { id: Tab; label: string; icon: string; color: string; badge?: number }[] = [
    { id: "inspect",    label: "Inspect",   icon: "◎", color: "#00D4FF" },
    { id: "contradict", label: "Conflicts", icon: "⚠", color: "#F87171",
      badge: graphData?.contradiction_count || 0 },
    { id: "discover",   label: "Paths",     icon: "◈", color: "#A78BFA" },
    { id: "report",     label: "Report",    icon: "≡", color: "#10B981" },
  ];

  return (
    <div className="h-full flex flex-col border-l overflow-hidden"
      style={{ backgroundColor: "rgba(4,7,15,0.88)", borderColor: "rgba(0,212,255,0.1)",
               backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>

      {/* Top accent */}
      <div className="h-px w-full flex-shrink-0"
        style={{ background: "linear-gradient(90deg, transparent, rgba(0,212,255,0.45), transparent)" }} />

      {/* Header */}
      <div className="px-4 py-3 flex-shrink-0 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[10px] font-mono text-cyan-400/70 tracking-[0.2em]">NEXUS INTELLIGENCE</span>
        </div>
      </div>

      {/* Tab bar */}
      {graphData && !pipeline.isRunning && (
        <div className="flex-shrink-0 border-b border-slate-800/60 px-2 pt-2">
          <div className="flex gap-0.5">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="relative flex-1 py-1.5 text-[9px] font-mono tracking-widest rounded-t transition-all"
                style={{
                  color: tab === t.id ? t.color : "#64748B",
                  backgroundColor: tab === t.id ? `${t.color}12` : "transparent",
                  borderBottom: tab === t.id ? `1px solid ${t.color}` : "1px solid transparent",
                }}>
                <span>{t.icon}</span>
                <span className="ml-1 hidden sm:inline">{t.label}</span>
                {t.badge ? (
                  <span className="absolute -top-1 -right-0.5 w-3.5 h-3.5 rounded-full text-[7px] flex items-center justify-center"
                    style={{ backgroundColor: t.color, color: "#04070F" }}>
                    {t.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">

        {/* Pipeline running */}
        {pipeline.isRunning && (
          <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/40">
            <PipelineProgress pipeline={pipeline} />
          </div>
        )}

        {/* Error */}
        {pipeline.stage === "ERROR" && pipeline.error && (
          <div className="bg-red-950/40 rounded-xl p-4 border border-red-800/40">
            <div className="text-xs font-mono text-red-400 mb-1 tracking-widest">PIPELINE ERROR</div>
            <p className="text-xs text-red-300">{pipeline.error}</p>
          </div>
        )}

        {/* Tab content */}
        {!pipeline.isRunning && graphData && (
          <div className="bg-slate-900/40 rounded-xl p-4 border border-slate-700/30">
            {tab === "inspect" && (
              selectedNode
                ? <NodeCard node={selectedNode}
                    onExpand={() => onExpandNode(selectedNode)}
                    onDiscover={() => onDiscoverHops(selectedNode)} />
                : <GraphSummary graphData={graphData} />
            )}
            {tab === "contradict" && (
              <ContradictionPanel
                contradictions={contradictions}
                isLoading={contradictionsLoading}
                query={graphData.query} />
            )}
            {tab === "discover" && (
              <MultiHopPanel
                paths={hopPaths}
                isLoading={hopPathsLoading}
                startEntity={selectedNode?.name || graphData.query} />
            )}
            {tab === "report" && (
              <ReportPanel
                report={report}
                isLoading={reportLoading}
                onGenerate={onGenerateReport}
                hasGraph={true} />
            )}
          </div>
        )}

        {/* Search history */}
        {searchHistory.length > 0 && !pipeline.isRunning && tab === "inspect" && (
          <div className="space-y-2">
            <div className="text-[10px] font-mono text-slate-600 tracking-widest">RECENT QUERIES</div>
            {searchHistory.slice(0, 6).map(q => (
              <button key={q} onClick={() => onHistoryClick(q)}
                className="w-full text-left text-xs text-slate-500 hover:text-slate-300 px-2.5 py-1.5 rounded hover:bg-slate-800/50 transition-all font-mono truncate">
                ↩ {q}
              </button>
            ))}
          </div>
        )}

        {!pipeline.isRunning && !graphData && pipeline.stage !== "ERROR" && (
          <div className="text-center py-8 space-y-2">
            <div className="text-4xl opacity-20">◈</div>
            <p className="text-xs text-slate-600 font-mono tracking-widest">SEARCH TO BEGIN</p>
          </div>
        )}
      </div>
    </div>
  );
}
