"use client";

import { useState, useRef, useEffect } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  isRunning: boolean;
  onCancel: () => void;
  currentQuery?: string;
}

const PLACEHOLDER_QUERIES = [
  "Economic history of India",
  "The rise of artificial intelligence",
  "Climate change and global policy",
  "History of the internet",
  "The space race and Cold War",
];

export default function SearchBar({
  onSearch,
  isRunning,
  onCancel,
  currentQuery,
}: SearchBarProps) {
  const [query, setQuery] = useState(currentQuery || "");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Rotate placeholder text
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_QUERIES.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    onSearch(trimmed);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 w-full max-w-2xl"
    >
      <div
        className="relative flex-1 group"
        style={{
          filter: isRunning ? "none" : undefined,
        }}
      >
        {/* Search icon */}
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors pointer-events-none">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={PLACEHOLDER_QUERIES[placeholderIdx]}
          disabled={isRunning}
          className="w-full pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 bg-slate-900/80 border border-slate-700/60 rounded-lg outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            backdropFilter: "blur(10px)",
          }}
        />

        {/* Active glow on focus */}
        <div
          className="absolute inset-0 rounded-lg pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity"
          style={{ boxShadow: "0 0 0 1px rgba(0,212,255,0.15), 0 0 20px rgba(0,212,255,0.05)" }}
        />
      </div>

      {isRunning ? (
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 text-sm font-semibold rounded-lg border border-red-800/50 text-red-400 hover:bg-red-950/40 transition-all"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Cancel
        </button>
      ) : (
        <button
          type="submit"
          disabled={query.trim().length < 2}
          className="px-4 py-2.5 text-sm font-semibold rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            background: "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(124,58,237,0.15))",
            border: "1px solid rgba(0,212,255,0.3)",
            color: "#00D4FF",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background =
              "linear-gradient(135deg, rgba(0,212,255,0.25), rgba(124,58,237,0.25))";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background =
              "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(124,58,237,0.15))";
          }}
        >
          Search
        </button>
      )}
    </form>
  );
}
