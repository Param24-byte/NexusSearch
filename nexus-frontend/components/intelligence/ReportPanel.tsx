"use client";
import { ResearchReport } from "@/types/graph";

interface Props {
  report: ResearchReport | null;
  isLoading: boolean;
  onGenerate: () => void;
  hasGraph: boolean;
}

function ConfidenceDot({ score }: { score?: number }) {
  if (score == null) return null;
  const color = score >= 0.75 ? "#10B981" : score >= 0.45 ? "#F59E0B" : "#F87171";
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: color }} />
      <span className="text-[9px] font-mono" style={{ color }}>{Math.round(score * 100)}%</span>
    </span>
  );
}

export default function ReportPanel({ report, isLoading, onGenerate, hasGraph }: Props) {
  if (!hasGraph) {
    return (
      <div className="text-center py-6 space-y-2">
        <div className="text-2xl opacity-20">◈</div>
        <p className="text-xs text-slate-600 font-mono tracking-widest">SEARCH FIRST TO GENERATE REPORT</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="text-[10px] font-mono text-cyan-400/70 tracking-widest animate-pulse">
          GENERATING INTELLIGENCE REPORT...
        </div>
        <div className="space-y-1.5">
          {["Synthesising entities...", "Analysing relationships...", "Compiling findings..."].map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/40 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
              <span className="text-[10px] text-slate-600 font-mono">{s}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-3">
        <div className="text-[10px] font-mono text-slate-500 tracking-widest">RESEARCH REPORT</div>
        <p className="text-xs text-slate-500">Generate a full AI intelligence report with citations, confidence scores and contradiction analysis.</p>
        <button onClick={onGenerate}
          className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all border"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            background: "linear-gradient(135deg, rgba(0,212,255,0.1), rgba(124,58,237,0.1))",
            borderColor: "rgba(0,212,255,0.25)", color: "#00D4FF",
          }}>
          ◈ Generate Intelligence Report
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-mono text-cyan-400 tracking-widest">INTELLIGENCE REPORT</div>
        <button onClick={onGenerate}
          className="text-[9px] font-mono text-slate-600 hover:text-cyan-400 transition-colors">
          ↺ REGENERATE
        </button>
      </div>

      {/* Executive summary */}
      <div className="rounded-lg p-3 border space-y-1.5"
        style={{ backgroundColor: "rgba(0,212,255,0.04)", borderColor: "rgba(0,212,255,0.15)" }}>
        <div className="text-[9px] font-mono text-cyan-500 tracking-widest">EXECUTIVE SUMMARY</div>
        <p className="text-xs text-slate-300 leading-relaxed">{report.executive_summary}</p>
      </div>

      {/* Key findings */}
      {report.key_findings.length > 0 && (
        <div className="space-y-2">
          <div className="text-[9px] font-mono text-slate-500 tracking-widest">KEY FINDINGS</div>
          <div className="space-y-1.5">
            {report.key_findings.map((f, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-cyan-500 text-xs flex-shrink-0 mt-0.5">→</span>
                <p className="text-xs text-slate-300 leading-relaxed">{f}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key entities with confidence */}
      {report.key_entities.length > 0 && (
        <div className="space-y-2">
          <div className="text-[9px] font-mono text-slate-500 tracking-widest">KEY ENTITIES</div>
          <div className="space-y-1">
            {report.key_entities.slice(0, 5).map((e, i) => (
              <div key={i} className="flex items-center justify-between py-1 border-b border-slate-800/40">
                <div className="flex items-center gap-2">
                  {e.contradicted && <span className="text-red-400 text-[9px]">⚠</span>}
                  <span className="text-xs text-slate-300">{e.name}</span>
                  <span className="text-[9px] text-slate-600">{e.type}</span>
                </div>
                <ConfidenceDot score={e.confidence} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contradictions in report */}
      {report.contradictions.length > 0 && (
        <div className="rounded-lg p-3 border space-y-2"
          style={{ backgroundColor: "rgba(248,113,113,0.04)", borderColor: "rgba(248,113,113,0.2)" }}>
          <div className="text-[9px] font-mono text-red-400 tracking-widest">
            ⚠ {report.contradictions.length} CONTRADICTION{report.contradictions.length !== 1 ? "S" : ""}
          </div>
          {report.contradictions.slice(0, 2).map((c, i) => (
            <div key={i} className="text-[10px] text-slate-500">
              <span className="text-red-400/80">{c.subject}</span>: {c.claim_a.slice(0, 60)}… vs {c.claim_b.slice(0, 60)}…
            </div>
          ))}
        </div>
      )}

      {/* Confidence overview */}
      {report.confidence_overview && (
        <div className="space-y-1">
          <div className="text-[9px] font-mono text-slate-500 tracking-widest">SOURCE CONFIDENCE</div>
          <p className="text-[11px] text-slate-500 italic">{report.confidence_overview}</p>
        </div>
      )}

      {/* Sources */}
      {report.sources.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[9px] font-mono text-slate-600 tracking-widest">SOURCES ({report.sources.length})</div>
          <div className="space-y-1">
            {report.sources.slice(0, 4).map((s, i) => (
              <a key={i} href={s} target="_blank" rel="noopener noreferrer"
                className="block text-[9px] font-mono text-slate-600 hover:text-cyan-400 transition-colors truncate">
                [{i + 1}] {s.replace(/https?:\/\/(www\.)?/, "").slice(0, 50)}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="text-[9px] font-mono text-slate-700">
        GENERATED {new Date(report.generated_at).toLocaleString()}
      </div>
    </div>
  );
}
