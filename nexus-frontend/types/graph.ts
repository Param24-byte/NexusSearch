// NexusSearch v2 — TypeScript types (mirrors backend Pydantic models)

export type EntityType =
  | "PERSON" | "ORGANIZATION" | "CONCEPT" | "EVENT"
  | "PLACE"  | "TECHNOLOGY"   | "PRODUCT" | "DATE" | "OTHER";

export type PipelineStage =
  | "SEARCHING" | "SCRAPING" | "EXTRACTING"
  | "WRITING_GRAPH" | "ANALYZING" | "COMPLETE" | "ERROR";

// ── Core graph types ──────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  name: string;
  type: EntityType;
  description: string;
  relevance_score: number;
  is_query_node: boolean;
  neighbor_count: number;
  source_url?: string | null;
  val: number;
  color?: string;
  // v2 intelligence fields
  confidence?: number | null;
  has_contradiction?: boolean;
  is_bridge?: boolean;
  claim?: string | null;
  // D3 runtime
  x?: number; y?: number;
  fx?: number; fy?: number;
  __bckgDimensions?: [number, number];
}

export interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  relationship: string;
  weight: number;
  // v2
  confidence?: number | null;
  is_contradicted?: boolean;
  contradiction_detail?: string | null;
  claim?: string | null;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphEdge[];
}

export interface GraphResponse {
  query: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: string;
  node_count: number;
  edge_count: number;
  cached: boolean;
  // v2
  contradiction_count: number;
  has_contradictions: boolean;
  bridge_count: number;
  avg_confidence: number;
}

export interface SSEEvent {
  stage: PipelineStage;
  message: string;
  progress: number;
  data?: GraphResponse;
  error?: string;
}

// ── Intelligence types ────────────────────────────────────────────────────────

export interface Contradiction {
  entity_id: string;
  entity_name: string;
  subject: string;
  claim_a: string;
  claim_b: string;
  source_a?: string | null;
  source_b?: string | null;
  confidence: number;
  relationship: string;
}

export interface HopPath {
  nodes: string[];
  node_names: string[];
  relationships: string[];
  length: number;
  significance: number;
  summary: string;
}

export interface BridgeEntity {
  entity_id: string;
  entity_name: string;
  entity_type: EntityType;
  description: string;
  connects: string[];
  path_length: number;
  bridge_score: number;
}

export interface ResearchReport {
  query: string;
  executive_summary: string;
  key_entities: Array<{
    name: string; type: string; description: string;
    confidence?: number; source_url?: string; contradicted?: boolean;
  }>;
  key_findings: string[];
  contradictions: Contradiction[];
  confidence_overview: string;
  sources: string[];
  generated_at: string;
}

// ── Entity metadata ────────────────────────────────────────────────────────────

export const ENTITY_META: Record<EntityType, { label: string; color: string; bgColor: string }> = {
  PERSON:       { label: "Person",       color: "#60A5FA", bgColor: "rgba(96,165,250,0.15)"  },
  ORGANIZATION: { label: "Organization", color: "#A78BFA", bgColor: "rgba(167,139,250,0.15)" },
  CONCEPT:      { label: "Concept",      color: "#34D399", bgColor: "rgba(52,211,153,0.15)"  },
  EVENT:        { label: "Event",        color: "#F59E0B", bgColor: "rgba(245,158,11,0.15)"  },
  PLACE:        { label: "Place",        color: "#F87171", bgColor: "rgba(248,113,113,0.15)" },
  TECHNOLOGY:   { label: "Technology",   color: "#22D3EE", bgColor: "rgba(34,211,238,0.15)"  },
  PRODUCT:      { label: "Product",      color: "#FB923C", bgColor: "rgba(251,146,60,0.15)"  },
  DATE:         { label: "Date",         color: "#94A3B8", bgColor: "rgba(148,163,184,0.15)" },
  OTHER:        { label: "Other",        color: "#6B7280", bgColor: "rgba(107,114,128,0.15)" },
};
