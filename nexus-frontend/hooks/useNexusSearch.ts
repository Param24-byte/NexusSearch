"use client";
import { useState, useCallback, useRef } from "react";
import { SSEEvent, GraphResponse, PipelineStage } from "@/types/graph";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface PipelineState {
  stage: PipelineStage | null;
  message: string;
  progress: number;
  isRunning: boolean;
  error: string | null;
}

export function useNexusSearch() {
  const [pipeline, setPipeline] = useState<PipelineState>({
    stage: null, message: "", progress: 0, isRunning: false, error: null,
  });
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const search = useCallback((query: string, expand = false) => {
    esRef.current?.close();
    setPipeline({ stage: "SEARCHING", message: "Initializing...", progress: 0, isRunning: true, error: null });
    setGraphData(null);

    const geminiKey = localStorage.getItem("nexus_gemini_key") || "";
    const tavilyKey = localStorage.getItem("nexus_tavily_key") || "";
    const geminiModel = localStorage.getItem("nexus_gemini_model") || "";

    let url = `${API_BASE}/api/v1/search?q=${encodeURIComponent(query)}`;
    if (expand) url += "&expand=true";
    if (geminiKey) url += `&gemini_key=${encodeURIComponent(geminiKey)}`;
    if (tavilyKey) url += `&tavily_key=${encodeURIComponent(tavilyKey)}`;
    if (geminiModel) url += `&model=${encodeURIComponent(geminiModel)}`;

    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (ev) => {
      try {
        const event: SSEEvent = JSON.parse(ev.data);
        setPipeline({
          stage: event.stage, message: event.message, progress: event.progress,
          isRunning: event.stage !== "COMPLETE" && event.stage !== "ERROR",
          error: event.error || null,
        });
        if (event.stage === "COMPLETE" && event.data) {
          setGraphData(event.data);
          es.close();
        }
        if (event.stage === "ERROR") es.close();
      } catch {}
    };

    es.onerror = () => {
      setPipeline(p => ({ ...p, stage: "ERROR", isRunning: false,
        error: "Cannot connect to NexusSearch backend. Is it running?" }));
      es.close();
    };
  }, []);

  const cancel = useCallback(() => {
    esRef.current?.close();
    setPipeline(p => ({ ...p, isRunning: false }));
  }, []);

  // Intelligence API helpers
  const fetchContradictions = useCallback(async (query: string) => {
    const r = await fetch(`${API_BASE}/api/v1/contradict?q=${encodeURIComponent(query)}`);
    if (!r.ok) return null;
    return r.json();
  }, []);

  const fetchMultiHop = useCallback(async (query: string, entityId: string) => {
    const r = await fetch(`${API_BASE}/api/v1/discover?q=${encodeURIComponent(query)}&entity_id=${encodeURIComponent(entityId)}`);
    if (!r.ok) return null;
    return r.json();
  }, []);

  const fetchBridges = useCallback(async (qa: string, qb: string) => {
    const r = await fetch(`${API_BASE}/api/v1/bridge?q_a=${encodeURIComponent(qa)}&q_b=${encodeURIComponent(qb)}`);
    if (!r.ok) return null;
    return r.json();
  }, []);

  const fetchReport = useCallback(async (query: string) => {
    const geminiKey = localStorage.getItem("nexus_gemini_key") || "";
    const geminiModel = localStorage.getItem("nexus_gemini_model") || "";
    let url = `${API_BASE}/api/v1/report?q=${encodeURIComponent(query)}`;
    if (geminiKey) url += `&gemini_key=${encodeURIComponent(geminiKey)}`;
    if (geminiModel) url += `&model=${encodeURIComponent(geminiModel)}`;
    
    const r = await fetch(url);
    if (!r.ok) return null;
    return r.json();
  }, []);

  return {
    search, cancel, pipeline, graphData, setGraphData,
    fetchContradictions, fetchMultiHop, fetchBridges, fetchReport,
  };
}
