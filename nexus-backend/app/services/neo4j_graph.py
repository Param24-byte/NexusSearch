"""
NexusSearch v2 - Neo4j Graph Service
Stores claims, confidence scores, contradiction flags.
Reads them back with intelligence annotations.
"""
import logging
from typing import Optional
from app.core.neo4j_driver import neo4j_driver
from app.models.graph import (
    ExtractionResult, GraphResponse, GraphNode,
    GraphEdge, EntityType,
)

logger = logging.getLogger(__name__)

NODE_COLORS = {
    EntityType.PERSON:       "#60A5FA",
    EntityType.ORGANIZATION: "#A78BFA",
    EntityType.CONCEPT:      "#34D399",
    EntityType.EVENT:        "#F59E0B",
    EntityType.PLACE:        "#F87171",
    EntityType.TECHNOLOGY:   "#22D3EE",
    EntityType.PRODUCT:      "#FB923C",
    EntityType.DATE:         "#94A3B8",
    EntityType.OTHER:        "#6B7280",
}


class Neo4jGraphService:

    async def query_exists(self, query: str) -> bool:
        result = await neo4j_driver.run_query(
            "MATCH (q:QueryNode {query: $query}) RETURN q LIMIT 1",
            {"query": query.lower().strip()},
        )
        return len(result) > 0

    async def write_graph(self, extraction: ExtractionResult) -> None:
        query_key = extraction.query.lower().strip()

        # 1. QueryNode
        await neo4j_driver.run_query(
            """
            MERGE (q:QueryNode {query: $query})
            SET q.summary    = $summary,
                q.updated_at = datetime()
            """,
            {"query": query_key, "summary": extraction.summary},
        )

        # 2. Entities — store claim for contradiction detection
        for entity in extraction.entities:
            await neo4j_driver.run_query(
                """
                MERGE (e:Entity {id: $id})
                SET e.name            = $name,
                    e.type            = $type,
                    e.description     = $description,
                    e.relevance_score = $relevance_score,
                    e.source_url      = $source_url,
                    e.color           = $color,
                    e.claim           = $claim,
                    e.source_count    = COALESCE(e.source_count, 0) + 1
                WITH e
                MATCH (q:QueryNode {query: $query})
                MERGE (q)-[:HAS_ENTITY {relevance: $relevance_score}]->(e)
                """,
                {
                    "id":              entity.id,
                    "name":            entity.name,
                    "type":            entity.type.value,
                    "description":     entity.description,
                    "relevance_score": entity.relevance_score,
                    "source_url":      entity.source_url or "",
                    "color":           NODE_COLORS.get(entity.type, "#6B7280"),
                    "claim":           entity.claim or "",
                    "query":           query_key,
                },
            )

        # 3. Relationships — store claim on edge
        for rel in extraction.relationships:
            await neo4j_driver.run_query(
                """
                MATCH (s:Entity {id: $source_id})
                MATCH (t:Entity {id: $target_id})
                MERGE (s)-[r:RELATES_TO {relationship: $relationship}]->(t)
                SET r.weight        = $weight,
                    r.claim         = $claim,
                    r.source_count  = COALESCE(r.source_count, 0) + 1
                """,
                {
                    "source_id":    rel.source_id,
                    "target_id":    rel.target_id,
                    "relationship": rel.relationship,
                    "weight":       rel.weight,
                    "claim":        rel.claim or "",
                },
            )

        logger.info(
            f"Wrote {len(extraction.entities)} entities, "
            f"{len(extraction.relationships)} rels for '{query_key}'"
        )

    async def read_graph(self, query: str) -> Optional[GraphResponse]:
        query_key = query.lower().strip()

        node_records = await neo4j_driver.run_query(
            """
            MATCH (q:QueryNode {query: $query})-[r:HAS_ENTITY]->(e:Entity)
            RETURN e.id              AS id,
                   e.name            AS name,
                   e.type            AS type,
                   e.description     AS description,
                   e.relevance_score AS relevance_score,
                   e.source_url      AS source_url,
                   e.color           AS color,
                   e.claim           AS claim,
                   e.confidence      AS confidence,
                   e.has_contradiction AS has_contradiction,
                   e.is_bridge       AS is_bridge,
                   e.source_count    AS source_count,
                   r.relevance       AS edge_relevance
            ORDER BY e.relevance_score DESC
            """,
            {"query": query_key},
        )

        if not node_records:
            return None

        summary_rec = await neo4j_driver.run_query(
            "MATCH (q:QueryNode {query: $query}) RETURN q.summary AS summary",
            {"query": query_key},
        )
        summary = summary_rec[0]["summary"] if summary_rec else ""
        entity_ids = [r["id"] for r in node_records]

        edge_records = await neo4j_driver.run_query(
            """
            MATCH (s:Entity)-[r:RELATES_TO]->(t:Entity)
            WHERE s.id IN $ids AND t.id IN $ids
            RETURN s.id             AS source,
                   t.id             AS target,
                   r.relationship   AS relationship,
                   r.weight         AS weight,
                   r.claim          AS claim,
                   r.confidence     AS confidence,
                   r.is_contradicted AS is_contradicted,
                   r.contradiction_detail AS contradiction_detail
            """,
            {"ids": entity_ids},
        )

        # Build query root node
        query_node = GraphNode(
            id=f"query::{query_key}",
            name=query,
            type=EntityType.CONCEPT,
            description=summary[:200] + "..." if len(summary) > 200 else summary,
            relevance_score=1.0,
            is_query_node=True,
            val=8.0,
            color="#00D4FF",
            confidence=1.0,
        )

        nodes = [query_node]
        contradiction_count = 0

        for r in node_records:
            relevance   = float(r["relevance_score"] or 0.5)
            confidence  = float(r["confidence"]) if r.get("confidence") else None
            has_contra  = bool(r.get("has_contradiction", False))
            is_bridge   = bool(r.get("is_bridge", False))
            if has_contra:
                contradiction_count += 1

            nodes.append(GraphNode(
                id=r["id"],
                name=r["name"],
                type=EntityType(r["type"]) if r["type"] else EntityType.OTHER,
                description=r["description"] or "",
                relevance_score=relevance,
                is_query_node=False,
                source_url=r["source_url"] or None,
                val=1.0 + relevance * 3.0,
                color=r["color"] or "#6B7280",
                confidence=confidence,
                has_contradiction=has_contra,
                is_bridge=is_bridge,
                claim=r.get("claim") or None,
            ))

        edges = []
        for r in node_records:
            edges.append(GraphEdge(
                source=f"query::{query_key}",
                target=r["id"],
                relationship="HAS_ENTITY",
                weight=float(r["edge_relevance"] or 1.0),
            ))

        for r in edge_records:
            is_contra = bool(r.get("is_contradicted", False))
            edges.append(GraphEdge(
                source=r["source"],
                target=r["target"],
                relationship=r["relationship"],
                weight=float(r["weight"] or 1.0),
                confidence=float(r["confidence"]) if r.get("confidence") else None,
                is_contradicted=is_contra,
                contradiction_detail=r.get("contradiction_detail") or None,
                claim=r.get("claim") or None,
            ))

        # Neighbor counts
        nmap: dict = {}
        for edge in edges:
            nmap[edge.source] = nmap.get(edge.source, 0) + 1
            nmap[edge.target] = nmap.get(edge.target, 0) + 1
        for node in nodes:
            node.neighbor_count = nmap.get(node.id, 0)

        confs = [n.confidence for n in nodes if n.confidence is not None]
        avg_conf = round(sum(confs) / len(confs), 3) if confs else 0.0

        return GraphResponse(
            query=query,
            nodes=nodes,
            edges=edges,
            summary=summary,
            node_count=len(nodes),
            edge_count=len(edges),
            cached=True,
            contradiction_count=contradiction_count,
            has_contradictions=contradiction_count > 0,
            bridge_count=sum(1 for n in nodes if n.is_bridge),
            avg_confidence=avg_conf,
        )


neo4j_graph_service = Neo4jGraphService()
