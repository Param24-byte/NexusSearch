"""
NexusSearch v2 - Intelligence Router
Four new endpoints powering the intelligence layer.
"""
import logging
from fastapi import APIRouter, Query, HTTPException
from app.models.graph import (
    MultiHopResponse, ContradictionResponse,
    BridgeResponse, ReportResponse,
)
from app.services.intelligence import (
    discover_multihop, detect_contradictions, find_bridges,
)
from app.services.report_generator import report_generator
from app.services.neo4j_graph import neo4j_graph_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/discover", response_model=MultiHopResponse)
async def multihop_discovery(
    q:          str = Query(..., description="Original query context"),
    entity_id:  str = Query(..., description="Starting entity ID for traversal"),
    max_depth:  int = Query(4, ge=2, le=6),
):
    """
    Multi-hop path traversal from a given entity.
    Returns non-obvious 2-4 hop paths through the knowledge graph.
    Called when user clicks 'Discover connections' on a node.
    """
    return await discover_multihop(q, entity_id)


@router.get("/contradict", response_model=ContradictionResponse)
async def contradiction_detection(
    q: str = Query(..., description="Query to check for contradictions"),
):
    """
    Detect contradictions across sources for a given query's subgraph.
    Returns pairs of conflicting claims with confidence scores.
    """
    exists = await neo4j_graph_service.query_exists(q)
    if not exists:
        raise HTTPException(
            status_code=404,
            detail=f"No graph found for '{q}'. Run a search first.",
        )
    return await detect_contradictions(q)


@router.get("/bridge", response_model=BridgeResponse)
async def bridge_finder(
    q_a: str = Query(..., description="First query / topic"),
    q_b: str = Query(..., description="Second query / topic"),
):
    """
    Find hidden bridge entities connecting two different query domains.
    Uses Neo4j shortestPath across the full persistent knowledge base.
    Both queries must have been searched at least once.
    """
    for q in [q_a, q_b]:
        exists = await neo4j_graph_service.query_exists(q)
        if not exists:
            raise HTTPException(
                status_code=404,
                detail=f"No graph found for '{q}'. Search it first.",
            )
    return await find_bridges(q_a, q_b)


@router.get("/report", response_model=ReportResponse)
async def generate_report(
    q:          str = Query(..., description="Query to generate report for"),
    gemini_key: str = Query(None),
    model:      str = Query(None),
):
    """
    Generate a full AI research report from the graph.
    Synthesises entities, relationships, confidence scores
    and contradictions into a structured citable document.
    """
    exists = await neo4j_graph_service.query_exists(q)
    if not exists:
        raise HTTPException(
            status_code=404,
            detail=f"No graph found for '{q}'. Run a search first.",
        )

    # Get contradictions to embed in report
    contradictions = await detect_contradictions(q)
    report = await report_generator.generate(q, api_key=gemini_key, model_name=model)
    report.contradictions = contradictions.contradictions

    return ReportResponse(report=report)
