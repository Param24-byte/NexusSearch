"use client";
import { HopPath } from "@/types/graph";

interface Props {
  paths: HopPath[];
  isLoading: boolean;
  startEntity: string;
}

export default function MultiHopPanel({ paths, isLoading, startEntity }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="text-[10px] font-mono text-violet-400/70 tracking-widest">MULTI-HOP DISCOVERY</div>
        <div className="text-xs text-slate-600 animate-pulse font-mono">Traversing knowledge graph...</div>
      </div>
    );
  }

  if (!paths.length) {
    return (
      <div className="space-y-2">
        <div className="text-[10px] font-mono text-slate-500 tracking-widest">MULTI-HOP DISCOVERY</div>
        <p className="text-xs text-slate-600">No multi-hop paths found from "{startEntity}". Try expanding the graph first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-mono text-violet-400 tracking-widest">DISCOVERY PATHS</div>
        <span className="text-[9px] font-mono text-violet-400/60">{paths.length} PATHS</span>
      </div>

      <div className="space-y-2.5">
        {paths.map((path, i) => (
          <div key={i} className="rounded-lg p-3 border space-y-2"
            style={{ backgroundColor: "rgba(124,58,237,0.05)", borderColor: "rgba(124,58,237,0.2)" }}>
            {/* Path chain */}
            <div className="flex flex-wrap items-center gap-1">
              {path.node_names.map((name, j) => (
                <div key={j} className="flex items-center gap-1">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded text-white"
                    style={{ backgroundColor: "rgba(124,58,237,0.25)", border: "1px solid rgba(124,58,237,0.4)" }}>
                    {name.length > 14 ? name.slice(0, 12) + "…" : name}
                  </span>
                  {j < path.relationships.length && (
                    <span className="text-[8px] font-mono text-violet-400/50">
                      →{path.relationships[j]?.replace(/_/g, " ")}→
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Summary */}
            <p className="text-[11px] text-slate-400">{path.summary}</p>

            {/* Stats */}
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-mono text-slate-600">{path.length} HOP{path.length !== 1 ? "S" : ""}</span>
              <div className="flex items-center gap-1.5">
                <div className="h-px flex-1 w-12 bg-slate-800 rounded overflow-hidden">
                  <div className="h-full rounded bg-violet-500"
                    style={{ width: `${path.significance * 100}%` }} />
                </div>
                <span className="text-[9px] font-mono text-violet-400/70">
                  {Math.round(path.significance * 100)}% SIG
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
