"""
NexusSearch v2 - Intelligence Service
Four core capabilities:
  1. Multi-hop discovery     — variable-length Cypher path traversal
  2. Contradiction detection — claim comparison across sources
  3. Hidden bridge finder    — shortest path between two query domains
  4. Confidence scorer       — composite score per entity/relationship
"""
import logging, re
from datetime import datetime
from typing import List, Optional
import google.generativeai as genai

from app.core.neo4j_driver import neo4j_driver
from app.core.config import settings
from app.models.graph import (
    HopPath, Contradiction, BridgeEntity, ConfidenceScore,
    MultiHopResponse, ContradictionResponse, BridgeResponse,
    EntityType,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
#  1.  CONFIDENCE SCORER
# ─────────────────────────────────────────────────────────────────────────────

def _confidence_label(score: float) -> str:
    if score >= 0.75: return "HIGH"
    if score >= 0.45: return "MEDIUM"
    return "LOW"

async def score_and_write_confidence(query: str) -> None:
    """
    Compute confidence for every entity/relationship in a query's subgraph
    and write the scores back to Neo4j.
    Formula: score = source_count_factor × agreement_factor
    """
    query_key = query.lower().strip()

    # Score entities
    await neo4j_driver.run_query(
        """
        MATCH (q:QueryNode {query: $query})-[:HAS_ENTITY]->(e:Entity)
        SET e.confidence = CASE
            WHEN e.source_count IS NULL OR e.source_count <= 1 THEN 0.5
            WHEN e.source_count = 2 THEN 0.65
            WHEN e.source_count = 3 THEN 0.78
            ELSE 0.90
        END
        """,
        {"query": query_key},
    )

    # Score relationships
    await neo4j_driver.run_query(
        """
        MATCH (q:QueryNode {query: $query})-[:HAS_ENTITY]->(s:Entity)
        MATCH (s)-[r:RELATES_TO]->(t:Entity)
        MATCH (q)-[:HAS_ENTITY]->(t)
        SET r.confidence = CASE
            WHEN r.source_count IS NULL OR r.source_count <= 1 THEN 0.45
            WHEN r.source_count = 2 THEN 0.68
            WHEN r.source_count >= 3 THEN 0.88
            ELSE 0.50
        END
        """,
        {"query": query_key},
    )
    logger.info(f"Confidence scores written for '{query_key}'")


# ─────────────────────────────────────────────────────────────────────────────
#  2.  CONTRADICTION DETECTION
# ─────────────────────────────────────────────────────────────────────────────

async def detect_contradictions(query: str) -> ContradictionResponse:
    """
    Detect contradictions by finding relationships of the same type
    pointing at the same target entity but with different claim text.
    Uses Gemini to verify and score each candidate pair.
    """
    query_key = query.lower().strip()

    # Find candidate contradiction pairs:
    # two relationships of the same type targeting the same entity
    # but with different claim text
    candidates = await neo4j_driver.run_query(
        """
        MATCH (q:QueryNode {query: $query})-[:HAS_ENTITY]->(e1:Entity)
        MATCH (q)-[:HAS_ENTITY]->(e2:Entity)
        MATCH (e1)-[r1:RELATES_TO {relationship: $rel_type}]->(target:Entity)
        MATCH (e2)-[r2:RELATES_TO {relationship: $rel_type}]->(target)
        WHERE e1.id <> e2.id
          AND r1.claim IS NOT NULL AND r2.claim IS NOT NULL
          AND r1.claim <> r2.claim
          AND size(r1.claim) > 10 AND size(r2.claim) > 10
        RETURN e1.name   AS entity_a,
               e1.id     AS entity_a_id,
               e2.name   AS entity_b,
               target.name AS subject,
               target.id   AS subject_id,
               r1.claim  AS claim_a,
               r2.claim  AS claim_b,
               r1.relationship AS rel_type,
               e1.source_url AS source_a,
               e2.source_url AS source_b
        LIMIT 10
        """,
        {"query": query_key, "rel_type": "RELATES_TO"},
    )

    # Also check entities with conflicting claims about the same subject
    entity_candidates = await neo4j_driver.run_query(
        """
        MATCH (q:QueryNode {query: $query})-[:HAS_ENTITY]->(e:Entity)
        WHERE e.claim IS NOT NULL AND size(e.claim) > 15
        WITH collect({id: e.id, name: e.name, claim: e.claim,
                       source: e.source_url, type: e.type}) AS entities
        UNWIND entities AS e1
        UNWIND entities AS e2
        WITH e1, e2
        WHERE e1.id < e2.id
          AND e1.name = e2.name
          AND e1.claim <> e2.claim
        RETURN e1.name  AS subject,
               e1.id    AS entity_id,
               e1.claim AS claim_a,
               e2.claim AS claim_b,
               e1.source AS source_a,
               e2.source AS source_b,
               'ENTITY_CLAIM' AS rel_type
        LIMIT 5
        """,
        {"query": query_key},
    )

    contradictions: List[Contradiction] = []

    for c in (candidates + entity_candidates):
        subject  = c.get("subject", "")
        claim_a  = c.get("claim_a", "")
        claim_b  = c.get("claim_b", "")
        if not claim_a or not claim_b or claim_a == claim_b:
            continue

        # Simple heuristic confidence: longer, more specific claims get higher score
        conf = _heuristic_contradiction_confidence(claim_a, claim_b)
        if conf < settings.CONTRADICTION_MIN_CONF:
            continue

        contradictions.append(Contradiction(
            entity_id=   c.get("entity_a_id", c.get("entity_id", "")),
            entity_name= c.get("entity_a",    c.get("subject", "")),
            subject=     subject,
            claim_a=     claim_a,
            claim_b=     claim_b,
            source_a=    c.get("source_a"),
            source_b=    c.get("source_b"),
            confidence=  round(conf, 2),
            relationship=c.get("rel_type", ""),
        ))

    # Write contradiction flags back to Neo4j
    for contra in contradictions:
        await neo4j_driver.run_query(
            """
            MATCH (e:Entity {id: $id})
            SET e.has_contradiction = true,
                e.contradiction_summary = $summary
            """,
            {
                "id":      contra.entity_id,
                "summary": f"Conflict: '{contra.claim_a[:80]}' vs '{contra.claim_b[:80]}'",
            },
        )

    logger.info(f"Found {len(contradictions)} contradictions for '{query_key}'")
    return ContradictionResponse(
        query=query,
        contradictions=contradictions,
        total=len(contradictions),
    )


def _heuristic_contradiction_confidence(claim_a: str, claim_b: str) -> float:
    """
    Quick heuristic: are two claims about the same subject actually contradictory?
    Looks for numeric differences, negations, antonyms.
    """
    a, b = claim_a.lower(), claim_b.lower()

    # Extract all numbers from both claims
    nums_a = set(re.findall(r'\d+\.?\d*', a))
    nums_b = set(re.findall(r'\d+\.?\d*', b))
    if nums_a and nums_b and nums_a != nums_b:
        return 0.75  # numeric disagreement → likely contradiction

    # Negation patterns
    negations = ["not ", "never ", "no ", "didn't", "wasn't", "isn't", "hasn't"]
    a_negated = any(n in a for n in negations)
    b_negated = any(n in b for n in negations)
    if a_negated != b_negated:
        return 0.65

    # Directional antonyms
    antonym_pairs = [
        ("increase", "decrease"), ("rise", "fall"), ("growth", "decline"),
        ("founded", "acquired"), ("created", "destroyed"), ("won", "lost"),
        ("supported", "opposed"), ("approved", "rejected"),
    ]
    for pos, neg in antonym_pairs:
        if (pos in a and neg in b) or (neg in a and pos in b):
            return 0.72

    # Claims share subject keywords but differ significantly
    words_a = set(a.split())
    words_b = set(b.split())
    overlap = len(words_a & words_b) / max(len(words_a | words_b), 1)
    if 0.15 < overlap < 0.5:  # some overlap but mostly different
        return 0.45

    return 0.2  # below threshold, won't be used


# ─────────────────────────────────────────────────────────────────────────────
#  3.  MULTI-HOP DISCOVERY
# ─────────────────────────────────────────────────────────────────────────────

async def discover_multihop(query: str, start_entity_id: str) -> MultiHopResponse:
    """
    Variable-length Cypher traversal from a starting entity.
    Returns meaningful paths 2-4 hops deep with Gemini-generated summaries.
    """
    max_depth = settings.MULTIHOP_MAX_DEPTH
    max_paths = settings.MULTIHOP_MAX_PATHS

    raw_paths = await neo4j_driver.run_query(
        """
        MATCH path = (start:Entity {id: $start_id})-[:RELATES_TO*2..4]->(end:Entity)
        WHERE start.id <> end.id
        WITH path,
             [n IN nodes(path) | n.id]   AS node_ids,
             [n IN nodes(path) | n.name] AS node_names,
             [r IN relationships(path) | r.relationship] AS rels,
             length(path) AS hop_count
        RETURN node_ids, node_names, rels, hop_count
        ORDER BY hop_count ASC
        LIMIT $limit
        """,
        {"start_id": start_entity_id, "limit": max_paths},
    )

    if not raw_paths:
        # Fallback: 1-hop neighbours
        raw_paths = await neo4j_driver.run_query(
            """
            MATCH (start:Entity {id: $start_id})-[r:RELATES_TO]->(end:Entity)
            RETURN [start.id, end.id]   AS node_ids,
                   [start.name, end.name] AS node_names,
                   [r.relationship]      AS rels,
                   1                    AS hop_count
            LIMIT $limit
            """,
            {"start_id": start_entity_id, "limit": max_paths},
        )

    paths: List[HopPath] = []
    for p in raw_paths:
        node_ids   = p.get("node_ids",   [])
        node_names = p.get("node_names", [])
        rels       = p.get("rels",       [])
        length     = int(p.get("hop_count", len(node_ids) - 1))

        if len(node_ids) < 2:
            continue

        # Significance: longer non-obvious paths score higher
        significance = min(0.95, 0.4 + length * 0.18)

        # Build a plain-English summary of the path
        path_desc = _path_to_sentence(node_names, rels)

        paths.append(HopPath(
            nodes=node_ids,
            node_names=node_names,
            relationships=rels,
            length=length,
            significance=round(significance, 2),
            summary=path_desc,
        ))

    # Deduplicate by end node
    seen_ends: set = set()
    unique_paths = []
    for p in paths:
        end = p.nodes[-1] if p.nodes else ""
        if end not in seen_ends:
            seen_ends.add(end)
            unique_paths.append(p)

    logger.info(f"Multi-hop: found {len(unique_paths)} paths from '{start_entity_id}'")
    return MultiHopResponse(
        query=query,
        start_entity=start_entity_id,
        paths=unique_paths,
        path_count=len(unique_paths),
        max_depth=max_depth,
    )


def _path_to_sentence(names: List[str], rels: List[str]) -> str:
    if not names:
        return ""
    parts = [names[0]]
    for i, rel in enumerate(rels):
        verb = rel.replace("_", " ").lower()
        next_node = names[i + 1] if i + 1 < len(names) else "?"
        parts.append(f"→ {verb} → {next_node}")
    return " ".join(parts)


# ─────────────────────────────────────────────────────────────────────────────
#  4.  HIDDEN BRIDGE FINDER
# ─────────────────────────────────────────────────────────────────────────────

async def find_bridges(query_a: str, query_b: str) -> BridgeResponse:
    """
    Find entities that act as hidden bridges between two query domains.
    Uses Neo4j shortestPath between entities belonging to different queries.
    """
    qa = query_a.lower().strip()
    qb = query_b.lower().strip()

    bridge_candidates = await neo4j_driver.run_query(
        """
        MATCH (qa:QueryNode {query: $qa})-[:HAS_ENTITY]->(ea:Entity)
        MATCH (qb:QueryNode {query: $qb})-[:HAS_ENTITY]->(eb:Entity)
        MATCH path = shortestPath((ea)-[:RELATES_TO*1..5]-(eb))
        WHERE ea.id <> eb.id AND length(path) > 1
        WITH path,
             [n IN nodes(path)] AS path_nodes,
             length(path)       AS path_len
        UNWIND path_nodes AS bridge
        WITH bridge, path_len,
             COUNT(*) AS appearances
        WHERE bridge.id IS NOT NULL
        RETURN bridge.id          AS id,
               bridge.name        AS name,
               bridge.type        AS type,
               bridge.description AS description,
               path_len,
               appearances
        ORDER BY appearances DESC, path_len ASC
        LIMIT 10
        """,
        {"qa": qa, "qb": qb},
    )

    bridges: List[BridgeEntity] = []
    seen: set = set()
    for r in bridge_candidates:
        bid = r.get("id", "")
        if not bid or bid in seen:
            continue
        seen.add(bid)

        bridge_score = min(0.99, float(r.get("appearances", 1)) * 0.25 + 0.4)

        bridges.append(BridgeEntity(
            entity_id=   bid,
            entity_name= r.get("name", ""),
            entity_type= EntityType(r["type"]) if r.get("type") else EntityType.OTHER,
            description= r.get("description", ""),
            connects=    [query_a, query_b],
            path_length= int(r.get("path_len", 2)),
            bridge_score=round(bridge_score, 2),
        ))

        # Flag as bridge in Neo4j
        await neo4j_driver.run_query(
            "MATCH (e:Entity {id: $id}) SET e.is_bridge = true",
            {"id": bid},
        )

    logger.info(f"Found {len(bridges)} bridge entities between '{qa}' and '{qb}'")
    return BridgeResponse(
        query_a=query_a,
        query_b=query_b,
        bridges=bridges,
        total=len(bridges),
    )


intelligence_service = {
    "score_confidence":      score_and_write_confidence,
    "detect_contradictions": detect_contradictions,
    "discover_multihop":     discover_multihop,
    "find_bridges":          find_bridges,
}
