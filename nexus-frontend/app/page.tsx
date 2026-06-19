"use client";
import { useState, useCallback, useEffect } from "react";
import { GraphNode, GraphResponse, Contradiction, HopPath, ResearchReport } from "@/types/graph";
import { useNexusSearch } from "@/hooks/useNexusSearch";
import { MOCK_GRAPH } from "@/lib/mockData";
import SearchBar from "@/components/ui/SearchBar";
import Sidebar from "@/components/sidebar/Sidebar";
import dynamic from "next/dynamic";

const NexusGraph = dynamic(() => import("@/components/graph/NexusGraph"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#04070F]">
      <div className="text-center space-y-3">
        <div className="text-2xl text-cyan-400/30 animate-pulse">◈</div>
        <div className="text-[10px] font-mono text-slate-700 tracking-widest">LOADING GRAPH ENGINE...</div>
      </div>
    </div>
  ),
});

const IS_DEMO = !process.env.NEXT_PUBLIC_API_URL;

export default function NexusPage() {
  const {
    search, cancel, pipeline, graphData, setGraphData,
    fetchContradictions, fetchMultiHop, fetchReport,
  } = useNexusSearch();

  const [selectedNode, setSelectedNode]         = useState<GraphNode | null>(null);
  const [activeQuery, setActiveQuery]           = useState("");
  const [searchHistory, setSearchHistory]       = useState<string[]>([]);

  // Intelligence state
  const [contradictions, setContradictions]     = useState<Contradiction[]>([]);
  const [contraLoading, setContraLoading]       = useState(false);
  const [hopPaths, setHopPaths]                 = useState<HopPath[]>([]);
  const [hopLoading, setHopLoading]             = useState(false);
  const [report, setReport]                     = useState<ResearchReport | null>(null);
  const [reportLoading, setReportLoading]       = useState(false);

  // Graph display toggles
  const [showContradictions, setShowContradictions] = useState(true);
  const [showBridges, setShowBridges]               = useState(true);

  // Settings state
  const [showSettings, setShowSettings]             = useState(false);
  const [geminiKey, setGeminiKey]                   = useState("");
  const [tavilyKey, setTavilyKey]                   = useState("");
  const [geminiModel, setGeminiModel]               = useState("gemini-2.0-flash");

  // Load settings from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      setGeminiKey(localStorage.getItem("nexus_gemini_key") || "");
      setTavilyKey(localStorage.getItem("nexus_tavily_key") || "");
      setGeminiModel(localStorage.getItem("nexus_gemini_model") || "gemini-2.0-flash");
    }
  }, []);

  const handleSaveSettings = () => {
    localStorage.setItem("nexus_gemini_key", geminiKey);
    localStorage.setItem("nexus_tavily_key", tavilyKey);
    localStorage.setItem("nexus_gemini_model", geminiModel);
    setShowSettings(false);
  };

  // Load demo data
  useEffect(() => {
    if (IS_DEMO) { setGraphData(MOCK_GRAPH); setActiveQuery(MOCK_GRAPH.query); }
  }, [setGraphData]);

  // Auto-run contradiction detection when graph is ready
  useEffect(() => {
    const g = graphData as GraphResponse | null;
    if (!g || IS_DEMO) return;
    setContraLoading(true);
    fetchContradictions(g.query)
      .then(r => setContradictions(r?.contradictions || []))
      .finally(() => setContraLoading(false));
  }, [graphData, fetchContradictions]);

  const handleSearch = useCallback((query: string, expand = false) => {
    setSelectedNode(null);
    setContradictions([]);
    setHopPaths([]);
    setReport(null);
    setActiveQuery(query);
    setSearchHistory(prev => [query, ...prev.filter(q => q !== query)].slice(0, 10));

    if (IS_DEMO) {
      setGraphData(null);
      setTimeout(() => setGraphData(MOCK_GRAPH), 1800);
    } else {
      search(query, expand);
    }
  }, [search, setGraphData]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node);
  }, []);

  const handleNodeExpand = useCallback((node: GraphNode) => {
    if (!node.is_query_node) handleSearch(node.name, true);
  }, [handleSearch]);

  const handleDiscoverHops = useCallback(async (node: GraphNode) => {
    if (!graphData || node.is_query_node) return;
    setHopLoading(true);
    setHopPaths([]);
    const result = await fetchMultiHop((graphData as GraphResponse).query, node.id);
    setHopPaths(result?.paths || []);
    setHopLoading(false);
  }, [graphData, fetchMultiHop]);

  const handleGenerateReport = useCallback(async () => {
    if (!graphData) return;
    setReportLoading(true);
    setReport(null);
    const result = await fetchReport((graphData as GraphResponse).query);
    if (result?.report) {
      result.report.contradictions = contradictions;
      setReport(result.report);
    }
    setReportLoading(false);
  }, [graphData, fetchReport, contradictions]);

  const activeGraph = IS_DEMO ? (graphData as GraphResponse | null) : graphData;
  const activePipeline = IS_DEMO
    ? { stage: activeGraph ? "COMPLETE" as const : "SEARCHING" as const,
        message: activeGraph ? "Graph ready." : "Loading demo...",
        progress: activeGraph ? 100 : 40,
        isRunning: !activeGraph, error: null }
    : pipeline;

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: "#04070F", fontFamily: "'Space Grotesk', sans-serif" }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-4 px-5 py-3 flex-shrink-0 border-b z-10 relative"
        style={{ backgroundColor: "rgba(4,7,15,0.75)", borderColor: "rgba(0,212,255,0.15)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", boxShadow: "0 4px 30px rgba(0, 0, 0, 0.5)" }}>
        
        {/* Subtle header glow */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

        {/* Wordmark */}
        <div className="flex items-center gap-2.5 flex-shrink-0 group cursor-pointer">
          <div className="relative w-5 h-5 transition-transform duration-500 group-hover:rotate-180">
            <div className="absolute inset-0 rounded-full"
              style={{ background: "radial-gradient(circle, #00D4FF, #7C3AED)", boxShadow: "0 0 16px rgba(0,212,255,0.6)" }} />
            <div className="absolute inset-[2px] rounded-full" style={{ backgroundColor: "#04070F" }} />
            <div className="absolute inset-[6px] rounded-full"
              style={{ background: "radial-gradient(circle, #00D4FF, #7C3AED)" }} />
          </div>
          <span className="text-sm font-bold tracking-tight text-white">
            Nexus<span className="text-cyan-400">Search</span>
            <span className="ml-1 text-[9px] font-mono text-slate-600 tracking-widest">v2</span>
          </span>
        </div>

        <div className="flex-1 flex justify-center">
          <SearchBar onSearch={handleSearch} isRunning={activePipeline.isRunning}
            onCancel={cancel} currentQuery={activeQuery} />
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setShowContradictions(v => !v)}
            className="text-[9px] font-mono px-2 py-1 rounded transition-all border"
            style={{ color: showContradictions ? "#F87171" : "#475569",
              borderColor: showContradictions ? "#F8717133" : "#1E2D45",
              backgroundColor: showContradictions ? "rgba(248,113,113,0.08)" : "transparent" }}>
            ⚠ CONFLICTS
          </button>
          <button onClick={() => setShowBridges(v => !v)}
            className="text-[9px] font-mono px-2 py-1 rounded transition-all border"
            style={{ color: showBridges ? "#00D4FF" : "#475569",
              borderColor: showBridges ? "#00D4FF33" : "#1E2D45",
              backgroundColor: showBridges ? "rgba(0,212,255,0.08)" : "transparent" }}>
            ◈ BRIDGES
          </button>
          <button onClick={() => setShowSettings(true)}
            className="text-[9px] font-mono px-2 py-1 rounded transition-all border border-slate-800 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30"
            style={{ backgroundColor: "transparent" }}>
            ⚙ CONFIG
          </button>
          {IS_DEMO && (
            <span className="text-[9px] font-mono px-2 py-1 rounded bg-amber-950/50 text-amber-500 border border-amber-800/40 tracking-widest">DEMO</span>
          )}
          {activeGraph?.cached && (
            <span className="text-[9px] font-mono px-2 py-1 rounded bg-cyan-950/50 text-cyan-500 border border-cyan-800/40 tracking-widest">CACHED</span>
          )}
        </div>
      </header>

      {/* ── Split layout ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* 75% graph */}
        <main className="flex-1 relative overflow-hidden" style={{ flexBasis: "75%" }}>
          {activeGraph ? (
            <NexusGraph
              graphData={activeGraph}
              onNodeClick={handleNodeClick}
              onNodeExpand={handleNodeExpand}
              selectedNodeId={selectedNode?.id || null}
              highlightContradictions={showContradictions}
              highlightBridges={showBridges} />
          ) : (
            <EmptyState isRunning={activePipeline.isRunning}
              message={activePipeline.message} progress={activePipeline.progress} />
          )}
        </main>

        {/* 25% sidebar */}
        <aside className="flex-shrink-0 overflow-hidden"
          style={{ flexBasis: "25%", minWidth: "280px", maxWidth: "390px" }}>
          <Sidebar
            selectedNode={selectedNode}
            graphData={activeGraph}
            pipeline={activePipeline}
            onExpandNode={handleNodeExpand}
            searchHistory={searchHistory}
            onHistoryClick={q => handleSearch(q)}
            contradictions={contradictions}
            contradictionsLoading={contraLoading}
            hopPaths={hopPaths}
            hopPathsLoading={hopLoading}
            report={report}
            reportLoading={reportLoading}
            onGenerateReport={handleGenerateReport}
            onDiscoverHops={handleDiscoverHops} />
        </aside>
      </div>

      {/* ── Settings Modal ───────────────────────────────────────────────── */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="w-[480px] rounded-xl border border-cyan-500/20 bg-[#080B15]/95 p-6 shadow-[0_0_50px_-12px_rgba(0,212,255,0.25)] relative overflow-hidden">
            {/* Glow effects */}
            <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
            <div className="absolute bottom-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-violet-500 to-transparent" />
            
            <div className="flex items-center justify-between border-b border-slate-900 pb-4 mb-6">
              <div className="flex items-center gap-2">
                <span className="text-cyan-400 text-sm">⚙</span>
                <h2 className="text-sm font-bold tracking-wider text-white uppercase">Engine Configuration</h2>
              </div>
              <button 
                onClick={() => setShowSettings(false)}
                className="text-xs font-mono text-slate-500 hover:text-white transition-colors"
              >
                ESC
              </button>
            </div>

            <div className="space-y-5">
              {/* Gemini Model Selector */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono text-slate-400 tracking-wider uppercase">Gemini Model</label>
                <select
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  className="w-full bg-[#04070F] border border-slate-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                >
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash (Default)</option>
                  <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash-Lite</option>
                  <option value="gemini-flash-latest">Gemini 1.5 Flash (Legacy)</option>
                  <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                </select>
                <p className="text-[9px] font-mono text-slate-600 leading-normal">
                  Model used for entity/claim extraction and research reporting.
                </p>
              </div>

              {/* Gemini API Key */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono text-slate-400 tracking-wider uppercase">Gemini API Key</label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="Using default system key if empty"
                  className="w-full bg-[#04070F] border border-slate-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 placeholder-slate-700 font-mono"
                />
                <p className="text-[9px] font-mono text-slate-600 leading-normal">
                  Provide your Google AI Studio API key to bypass default backend quota limits.
                </p>
              </div>

              {/* Tavily API Key */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono text-slate-400 tracking-wider uppercase">Tavily API Key</label>
                <input
                  type="password"
                  value={tavilyKey}
                  onChange={(e) => setTavilyKey(e.target.value)}
                  placeholder="Using keyless / default key if empty"
                  className="w-full bg-[#04070F] border border-slate-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 placeholder-slate-700 font-mono"
                />
                <p className="text-[9px] font-mono text-slate-600 leading-normal">
                  Used for scraping the web. Keyless mode works out of the box but is rate-limited.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-8 pt-4 border-t border-slate-900">
              <button
                onClick={() => setShowSettings(false)}
                className="text-[10px] font-mono text-slate-500 hover:text-slate-350 transition-colors uppercase px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                className="text-[10px] font-mono font-bold tracking-wider text-[#04070F] bg-gradient-to-r from-cyan-400 to-violet-500 rounded px-4 py-1.5 hover:from-cyan-300 hover:to-violet-400 transition-all uppercase shadow-[0_0_15px_rgba(0,212,255,0.2)] active:scale-[0.98]"
              >
                Save Config
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ isRunning, message, progress }: { isRunning: boolean; message: string; progress: number }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-8"
      style={{ background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,212,255,0.04) 0%, transparent 70%)" }}>
      {isRunning ? (
        <>
          <div className="relative w-24 h-24 flex items-center justify-center">
            {/* Outer spinning ring */}
            <div className="absolute inset-0 rounded-full border border-t-cyan-400 border-r-violet-500 border-b-transparent border-l-transparent animate-spin"
              style={{ animationDuration: "3s" }} />
            {/* Middle pulsing glow */}
            <div className="absolute inset-2 rounded-full animate-pulse"
              style={{ background: "radial-gradient(circle, rgba(0,212,255,0.15), rgba(124,58,237,0.1))", animationDuration: "2s" }} />
            {/* Core */}
            <div className="absolute w-8 h-8 rounded-full"
              style={{ background: "radial-gradient(circle, #00D4FF, #7C3AED)", boxShadow: "0 0 20px #00D4FF88" }} />
          </div>
          <div className="text-center space-y-3">
            <p className="text-xs font-mono text-cyan-400 tracking-[0.3em] animate-pulse">{message.toUpperCase()}</p>
            <div className="w-64 h-0.5 bg-slate-800/80 rounded-full overflow-hidden mx-auto shadow-[0_0_10px_rgba(0,0,0,0.5)_inset]">
              <div className="h-full bg-gradient-to-r from-cyan-400 to-violet-500 rounded-full transition-all duration-700 ease-out relative"
                style={{ width: `${progress}%` }}>
                <div className="absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-r from-transparent to-white/40" />
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="relative flex items-center justify-center w-32 h-32 opacity-30 group-hover:opacity-60 transition-opacity duration-1000">
            <div className="absolute inset-0 rounded-full border border-slate-700 border-dashed animate-spin" style={{ animationDuration: "20s" }} />
            <div className="absolute inset-4 rounded-full border border-slate-800 animate-spin" style={{ animationDuration: "15s", animationDirection: "reverse" }} />
            <div className="text-5xl bg-clip-text text-transparent bg-gradient-to-b from-slate-400 to-slate-700">◈</div>
          </div>
          <div className="text-center space-y-3 relative z-10">
            <h1 className="text-xl font-bold tracking-tight text-white/90" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Nexus Intelligence Engine
            </h1>
            <p className="text-[10px] font-mono text-slate-500 tracking-[0.2em] uppercase">
              Enter a research topic to synthesize knowledge
            </p>
          </div>
        </>
      )}
    </div>
  );
}
