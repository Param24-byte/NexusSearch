"use client";
import { Contradiction } from "@/types/graph";

interface Props {
  contradictions: Contradiction[];
  isLoading: boolean;
  query: string;
}

function ConfidencePill({ score }: { score: number }) {
  const color = score >= 0.7 ? "#F87171" : score >= 0.45 ? "#F59E0B" : "#94A3B8";
  const label = score >= 0.7 ? "HIGH" : score >= 0.45 ? "MED" : "LOW";
  return (
    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded tracking-widest"
      style={{ color, border: `1px solid ${color}33`, backgroundColor: `${color}11` }}>
      {label} {Math.round(score * 100)}%
    </span>
  );
}

export default function ContradictionPanel({ contradictions, isLoading, query }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="text-[10px] font-mono text-red-400/70 tracking-widest">CONTRADICTION SCAN</div>
        <div className="text-xs text-slate-600 animate-pulse font-mono">Analysing claims across sources...</div>
      </div>
    );
  }

  if (!contradictions.length) {
    return (
      <div className="space-y-2">
        <div className="text-[10px] font-mono text-emerald-500 tracking-widest">✓ NO CONTRADICTIONS</div>
        <p className="text-xs text-slate-600">All sources are consistent for "{query}".</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-mono text-red-400 tracking-widest">⚠ CONTRADICTIONS DETECTED</div>
        <span className="text-[9px] font-mono text-red-400/60">{contradictions.length} FOUND</span>
      </div>

      <div className="space-y-2.5">
        {contradictions.map((c, i) => (
          <div key={i} className="rounded-lg p-3 border space-y-2"
            style={{ backgroundColor: "rgba(248,113,113,0.04)", borderColor: "rgba(248,113,113,0.2)" }}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {c.subject}
              </span>
              <ConfidencePill score={c.confidence} />
            </div>

            <div className="space-y-1.5">
              <div className="flex gap-2">
                <span className="text-[9px] font-mono text-slate-500 mt-0.5 flex-shrink-0">A:</span>
                <p className="text-[11px] text-slate-300">{c.claim_a}</p>
              </div>
              <div className="flex gap-2">
                <span className="text-[9px] font-mono text-red-400/70 mt-0.5 flex-shrink-0">B:</span>
                <p className="text-[11px] text-red-300/80">{c.claim_b}</p>
              </div>
            </div>

            {(c.source_a || c.source_b) && (
              <div className="pt-1 flex gap-3 flex-wrap">
                {c.source_a && (
                  <a href={c.source_a} target="_blank" rel="noopener noreferrer"
                    className="text-[9px] font-mono text-slate-600 hover:text-cyan-400 transition-colors truncate max-w-[45%]">
                    ↗ {c.source_a.replace(/https?:\/\/(www\.)?/, "").slice(0, 30)}
                  </a>
                )}
                {c.source_b && (
                  <a href={c.source_b} target="_blank" rel="noopener noreferrer"
                    className="text-[9px] font-mono text-slate-600 hover:text-red-400 transition-colors truncate max-w-[45%]">
                    ↗ {c.source_b.replace(/https?:\/\/(www\.)?/, "").slice(0, 30)}
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
