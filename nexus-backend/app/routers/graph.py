"""
NexusSearch v2 - Graph Router (upgraded)
"""
import logging
from fastapi import APIRouter, HTTPException, Query
from typing import List
from app.services.neo4j_graph import neo4j_graph_service
from app.core.neo4j_driver import neo4j_driver
from app.models.graph import GraphResponse, GraphNode, EntityType

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/graph", response_model=GraphResponse)
async def get_graph(q: str = Query(...)):
    graph = await neo4j_graph_service.read_graph(q)
    if not graph:
        raise HTTPException(status_code=404,
                            detail=f"No graph for '{q}'. Run a search first.")
    return graph


@router.get("/graph/node/{node_id}", response_model=GraphNode)
async def get_node(node_id: str):
    records = await neo4j_driver.run_query(
        """
        MATCH (e:Entity {id: $id})
        OPTIONAL MATCH (e)-[r:RELATES_TO]-(n:Entity)
        RETURN e.id AS id, e.name AS name, e.type AS type,
               e.description AS description, e.relevance_score AS relevance_score,
               e.source_url AS source_url, e.color AS color,
               e.confidence AS confidence,
               e.has_contradiction AS has_contradiction,
               e.is_bridge AS is_bridge,
               e.claim AS claim,
               count(n) AS neighbor_count
        """,
        {"id": node_id},
    )
    if not records:
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found.")
    r = records[0]
    return GraphNode(
        id=r["id"], name=r["name"],
        type=EntityType(r["type"]) if r["type"] else EntityType.OTHER,
        description=r["description"] or "",
        relevance_score=float(r["relevance_score"] or 0.5),
        source_url=r["source_url"] or None,
        neighbor_count=r["neighbor_count"] or 0,
        val=1.0 + float(r["relevance_score"] or 0.5) * 3.0,
        color=r["color"] or "#6B7280",
        confidence=float(r["confidence"]) if r.get("confidence") else None,
        has_contradiction=bool(r.get("has_contradiction", False)),
        is_bridge=bool(r.get("is_bridge", False)),
        claim=r.get("claim") or None,
    )


@router.get("/graph/history", response_model=List[str])
async def get_history(limit: int = Query(20, le=100)):
    records = await neo4j_driver.run_query(
        "MATCH (q:QueryNode) RETURN q.query AS query ORDER BY q.updated_at DESC LIMIT $limit",
        {"limit": limit},
    )
    return [r["query"] for r in records]


@router.get("/graph/stats")
async def get_stats():
    try:
        records = await neo4j_driver.run_query(
            """
            MATCH (e:Entity) WITH count(e) AS ec
            MATCH (q:QueryNode) WITH ec, count(q) AS qc
            MATCH ()-[r:RELATES_TO]->() WITH ec, qc, count(r) AS rc
            MATCH (e2:Entity) WHERE e2.has_contradiction = true
            RETURN ec, qc, rc, count(e2) AS cc
            """
        )
        if not records:
            return {"entity_count": 0, "query_count": 0,
                    "relationship_count": 0, "contradiction_count": 0}
        r = records[0]
        return {
            "entity_count":       r["ec"],
            "query_count":        r["qc"],
            "relationship_count": r["rc"],
            "contradiction_count":r["cc"],
        }
    except Exception:
        return {"entity_count": 0, "query_count": 0,
                "relationship_count": 0, "contradiction_count": 0}


@router.delete("/graph")
async def delete_graph(q: str = Query(...)):
    await neo4j_driver.run_query(
        "MATCH (q:QueryNode {query: $q}) DETACH DELETE q",
        {"q": q.lower().strip()},
    )
    return {"message": f"Graph for '{q}' deleted."}
