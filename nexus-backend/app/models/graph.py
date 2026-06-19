"""
NexusSearch v2 - Data Models
Extended Pydantic schemas for intelligence layer:
confidence scoring, contradiction detection, multi-hop, bridge discovery
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum


# ── Entity Types ───────────────────────────────────────────────────────────────

class EntityType(str, Enum):
    PERSON       = "PERSON"
    ORGANIZATION = "ORGANIZATION"
    CONCEPT      = "CONCEPT"
    EVENT        = "EVENT"
    PLACE        = "PLACE"
    TECHNOLOGY   = "TECHNOLOGY"
    PRODUCT      = "PRODUCT"
    DATE         = "DATE"
    OTHER        = "OTHER"


# ── LLM Extraction Schema ──────────────────────────────────────────────────────

class ExtractedEntity(BaseModel):
    id:              str   = Field(..., description="Slugified unique ID")
    name:            str
    type:            EntityType
    description:     str
    relevance_score: float = Field(..., ge=0.0, le=1.0)
    source_url:      Optional[str] = None
    # v2: claim text for contradiction matching
    claim:           Optional[str] = Field(None, description="Key factual claim about this entity from this source")


class ExtractedRelationship(BaseModel):
    source_id:    str
    target_id:    str
    relationship: str   = Field(..., description="SCREAMING_SNAKE_CASE verb phrase")
    weight:       float = Field(default=1.0, ge=0.5, le=3.0)
    # v2: claim stored on edge for contradiction detection
    claim:        Optional[str] = Field(None, description="The specific factual claim this relationship asserts")


class ExtractionResult(BaseModel):
    query:         str
    entities:      List[ExtractedEntity]
    relationships: List[ExtractedRelationship]
    summary:       str


# ── Confidence & Intelligence Models ──────────────────────────────────────────

class ConfidenceScore(BaseModel):
    """Composite confidence for a relationship or entity."""
    score:          float = Field(..., ge=0.0, le=1.0, description="0-1 composite confidence")
    source_count:   int   = Field(default=1,  description="Number of sources asserting this")
    agreement_ratio:float = Field(default=1.0,description="Fraction of sources that agree")
    recency_weight: float = Field(default=1.0,description="How recent the sources are")
    label:          str   = Field(default="",  description="Human-readable: HIGH / MEDIUM / LOW")


class Contradiction(BaseModel):
    """A detected contradiction between two sources on the same claim."""
    entity_id:    str
    entity_name:  str
    subject:      str   = Field(..., description="What the contradiction is about")
    claim_a:      str
    claim_b:      str
    source_a:     Optional[str] = None
    source_b:     Optional[str] = None
    confidence:   float = Field(default=0.5, description="Confidence that this is a real contradiction")
    relationship: str   = Field(default="", description="Which relationship type is contradicted")


class HopPath(BaseModel):
    """A single path in a multi-hop traversal result."""
    nodes:         List[str] = Field(..., description="Ordered list of entity IDs in path")
    node_names:    List[str]
    relationships: List[str] = Field(..., description="Ordered relationship labels")
    length:        int
    significance:  float     = Field(default=0.5, description="Path significance score")
    summary:       str       = Field(default="",  description="Gemini-generated plain-English explanation")


class BridgeEntity(BaseModel):
    """A hidden bridge entity connecting two otherwise-unlinked topics."""
    entity_id:   str
    entity_name: str
    entity_type: EntityType
    description: str
    connects:    List[str] = Field(..., description="The two topic/entity names it bridges")
    path_length: int
    bridge_score:float     = Field(..., description="How unexpectedly central this bridge is")


class ResearchReport(BaseModel):
    """Full AI-generated research report from the graph."""
    query:            str
    executive_summary:str
    key_entities:     List[Dict[str, Any]]
    key_findings:     List[str]
    contradictions:   List[Contradiction]
    confidence_overview: str
    sources:          List[str]
    generated_at:     str


# ── Graph Node & Edge (v2 extended) ───────────────────────────────────────────

class GraphNode(BaseModel):
    id:              str
    name:            str
    type:            EntityType
    description:     str
    relevance_score: float
    is_query_node:   bool  = False
    neighbor_count:  int   = 0
    source_url:      Optional[str] = None
    val:             float = Field(default=1.0, description="D3 mass/size multiplier")
    color:           Optional[str] = None
    # v2 intelligence fields
    confidence:      Optional[float] = Field(None, description="Confidence score 0-1")
    has_contradiction: bool = False
    is_bridge:       bool  = False
    claim:           Optional[str] = None


class GraphEdge(BaseModel):
    source:       str
    target:       str
    relationship: str
    weight:       float = 1.0
    # v2 intelligence fields
    confidence:          Optional[float] = None
    is_contradicted:     bool  = False
    contradiction_detail:Optional[str] = None
    claim:               Optional[str] = None


class GraphResponse(BaseModel):
    query:      str
    nodes:      List[GraphNode]
    edges:      List[GraphEdge]
    summary:    str
    node_count: int
    edge_count: int
    cached:     bool = False
    # v2 intelligence summary
    contradiction_count: int   = 0
    has_contradictions:  bool  = False
    bridge_count:        int   = 0
    avg_confidence:      float = 0.0


# ── SSE Events ────────────────────────────────────────────────────────────────

class PipelineStage(str, Enum):
    SEARCHING    = "SEARCHING"
    SCRAPING     = "SCRAPING"
    EXTRACTING   = "EXTRACTING"
    WRITING_GRAPH= "WRITING_GRAPH"
    ANALYZING    = "ANALYZING"
    COMPLETE     = "COMPLETE"
    ERROR        = "ERROR"


class SSEEvent(BaseModel):
    stage:    PipelineStage
    message:  str
    progress: int = Field(..., ge=0, le=100)
    data:     Optional[GraphResponse] = None
    error:    Optional[str]           = None


# ── Intelligence API Responses ────────────────────────────────────────────────

class MultiHopResponse(BaseModel):
    query:       str
    start_entity:str
    paths:       List[HopPath]
    path_count:  int
    max_depth:   int


class ContradictionResponse(BaseModel):
    query:          str
    contradictions: List[Contradiction]
    total:          int


class BridgeResponse(BaseModel):
    query_a:  str
    query_b:  str
    bridges:  List[BridgeEntity]
    total:    int


class ReportResponse(BaseModel):
    report: ResearchReport
