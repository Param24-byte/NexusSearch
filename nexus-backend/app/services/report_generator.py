"""
NexusSearch v2 - Research Report Generator
Synthesises the Neo4j subgraph + contradictions into a
structured, citable intelligence report using Gemini.
"""
import logging
from datetime import datetime
from typing import List
import google.generativeai as genai

from app.core.config import settings
from app.core.neo4j_driver import neo4j_driver
from app.models.graph import ResearchReport, Contradiction

logger = logging.getLogger(__name__)

REPORT_PROMPT = """You are a senior research analyst generating an intelligence report.
You will be given a knowledge graph summary, entity list, relationships, and detected contradictions.
Generate a structured report in JSON format ONLY — no markdown, no preamble.

OUTPUT SCHEMA:
{
  "executive_summary": "<3-5 sentence synthesis of the most important findings>",
  "key_findings": ["<finding 1>", "<finding 2>", ... up to 6 findings],
  "confidence_overview": "<1-2 sentence assessment of overall source quality and agreement>"
}"""


class ReportGenerator:

    def __init__(self):
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self.model = genai.GenerativeModel(
            model_name=settings.GEMINI_MODEL,
            system_instruction=REPORT_PROMPT,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.2,
                max_output_tokens=2048,
            ),
        )

    async def generate(self, query: str, api_key: str = None, model_name: str = None) -> ResearchReport:
        query_key = query.lower().strip()

        # Pull graph data from Neo4j
        entities = await neo4j_driver.run_query(
            """
            MATCH (q:QueryNode {query: $query})-[:HAS_ENTITY]->(e:Entity)
            RETURN e.name AS name, e.type AS type, e.description AS description,
                   e.claim AS claim, e.confidence AS confidence,
                   e.has_contradiction AS has_contradiction, e.source_url AS source_url
            ORDER BY e.relevance_score DESC LIMIT 20
            """,
            {"query": query_key},
        )

        relationships = await neo4j_driver.run_query(
            """
            MATCH (q:QueryNode {query: $query})-[:HAS_ENTITY]->(s:Entity)
            MATCH (s)-[r:RELATES_TO]->(t:Entity)
            MATCH (q)-[:HAS_ENTITY]->(t)
            RETURN s.name AS from, r.relationship AS rel, t.name AS to,
                   r.claim AS claim, r.confidence AS confidence
            ORDER BY r.weight DESC LIMIT 30
            """,
            {"query": query_key},
        )

        summary_rec = await neo4j_driver.run_query(
            "MATCH (q:QueryNode {query: $query}) RETURN q.summary AS summary",
            {"query": query_key},
        )
        summary = summary_rec[0]["summary"] if summary_rec else ""

        # Collect sources
        sources = list({e["source_url"] for e in entities if e.get("source_url")})

        # Build context for Gemini
        entity_lines = [
            f"- {e['name']} ({e['type']}): {e['description']}"
            + (f" [CLAIM: {e['claim']}]" if e.get("claim") else "")
            + (f" [CONFIDENCE: {e['confidence']:.0%}]" if e.get("confidence") else "")
            + (" [⚠ CONTRADICTED]" if e.get("has_contradiction") else "")
            for e in entities
        ]
        rel_lines = [
            f"- {r['from']} → {r['rel']} → {r['to']}"
            + (f" [{r['claim']}]" if r.get("claim") else "")
            for r in relationships
        ]

        prompt = f"""RESEARCH QUERY: {query}

GRAPH SUMMARY: {summary}

KEY ENTITIES:
{chr(10).join(entity_lines)}

RELATIONSHIPS:
{chr(10).join(rel_lines)}

Generate the intelligence report JSON now."""

        import json
        import re
        actual_key = api_key or settings.GEMINI_API_KEY
        actual_model = model_name or settings.GEMINI_MODEL

        fallback_models = [
            actual_model,
            "gemini-2.0-flash-lite",
            "gemini-flash-latest",
            "gemini-3.1-flash-lite"
        ]

        seen = set()
        fallback_models = [x for x in fallback_models if not (x in seen or seen.add(x))]

        data = None
        last_exception = None

        for current_model_name in fallback_models:
            logger.info(f"Attempting report generation with model: {current_model_name}")
            try:
                model = genai.GenerativeModel(
                    model_name=current_model_name,
                    system_instruction=REPORT_PROMPT,
                    generation_config=genai.GenerationConfig(
                        response_mime_type="application/json",
                        temperature=0.2,
                        max_output_tokens=2048,
                    ),
                )
                if actual_key:
                    import google.ai.generativelanguage as glm
                    model._client = glm.GenerativeServiceClient(client_options={"api_key": actual_key})
                    model._async_client = glm.GenerativeServiceAsyncClient(client_options={"api_key": actual_key})

                response = await model.generate_content_async(prompt)
                raw = response.text
                cleaned = re.sub(r',\s*\}', '}', raw)
                cleaned = re.sub(r',\s*\]', ']', cleaned)
                
                try:
                    data = json.loads(cleaned)
                except json.JSONDecodeError:
                    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
                    if match:
                        data = json.loads(match.group())
                    else:
                        raise ValueError("Gemini returned non-parseable output")
                break
            except Exception as e:
                logger.warning(f"Report generation failed with model {current_model_name}: {e}")
                last_exception = e
                err_str = str(e).lower()
                if "429" in err_str or "quota" in err_str or "exhausted" in err_str or "limit" in err_str:
                    continue
                else:
                    continue
        else:
            logger.error(f"All report generation models failed. Last error: {last_exception}")
            data = {
                "executive_summary": summary,
                "key_findings": [f"Graph contains {len(entities)} entities and {len(relationships)} relationships."],
                "confidence_overview": f"Report generation encountered an error: {last_exception}",
            }

        # Build key_entities list for the report
        key_entities = [
            {
                "name":       e["name"],
                "type":       e["type"],
                "description":e["description"],
                "confidence": round(float(e["confidence"]), 2) if e.get("confidence") else None,
                "source_url": e.get("source_url"),
                "contradicted": bool(e.get("has_contradiction")),
            }
            for e in entities[:8]
        ]

        return ResearchReport(
            query=query,
            executive_summary=data.get("executive_summary", summary),
            key_entities=key_entities,
            key_findings=data.get("key_findings", []),
            contradictions=[],   # Populated by caller from contradiction service
            confidence_overview=data.get("confidence_overview", ""),
            sources=sources[:10],
            generated_at=datetime.utcnow().isoformat() + "Z",
        )


report_generator = ReportGenerator()
