"""
NexusSearch v2 - Gemini 2.0 Flash Extraction Service
Upgraded prompt extracts claims on entities and relationships
enabling contradiction detection and confidence scoring.
"""

import google.generativeai as genai
import json, re, logging
from typing import List, Dict

from app.core.config import settings
from app.models.graph import (
    ExtractionResult, ExtractedEntity,
    ExtractedRelationship, EntityType,
)

logger = logging.getLogger(__name__)

# ── System Prompt ─────────────────────────────────────────────────────────────
EXTRACTION_SYSTEM_PROMPT = """You are a precision knowledge graph extraction engine for an AI research intelligence platform.
Your ONLY output is a single valid JSON object — no markdown, no explanation, no preamble.

TASK: Extract entities, relationships, and key factual claims from web content.
The claim fields are critical — they enable contradiction detection across sources.

STRICT RULES:
- Extract 10-20 of the MOST IMPORTANT entities. Quality over quantity.
- Entity IDs must be lowercase-slugified (e.g. "sam-altman", "openai-gpt4")
- Relationship labels: SCREAMING_SNAKE_CASE active verbs (FOUNDED, LED_TO, ACQUIRED, CONTRADICTS)
- relevance_score: 1.0=is the query, 0.8-0.9=core entity, 0.5-0.7=supporting, 0.1-0.4=peripheral
- claim on an entity: the single most important factual assertion from THIS source about it
- claim on a relationship: the specific fact this relationship asserts (crucial for contradiction detection)
- weight: 3.0=defining relationship, 2.0=strong, 1.0=standard
- Only create relationships between entities in your entity list

OUTPUT SCHEMA (follow exactly):
{
  "query": "<original query>",
  "summary": "<3-4 sentence synthesis from all sources>",
  "entities": [
    {
      "id": "<slug>",
      "name": "<Display Name>",
      "type": "<PERSON|ORGANIZATION|CONCEPT|EVENT|PLACE|TECHNOLOGY|PRODUCT|DATE|OTHER>",
      "description": "<1-2 sentence context-rich description>",
      "relevance_score": <0.0-1.0>,
      "source_url": "<primary source url or null>",
      "claim": "<the key factual claim this source makes about this entity, e.g. 'Founded in 2015 by Sam Altman and Elon Musk'>"
    }
  ],
  "relationships": [
    {
      "source_id": "<entity id>",
      "target_id": "<entity id>",
      "relationship": "<VERB_PHRASE>",
      "weight": <0.5-3.0>,
      "claim": "<specific factual claim this relationship asserts, e.g. 'Microsoft invested $13B in OpenAI between 2019-2023'>"
    }
  ]
}"""


def _build_prompt(query: str, pages: List[Dict[str, str]]) -> str:
    blocks = []
    for i, p in enumerate(pages[:8], 1):
        blocks.append(
            f"--- SOURCE {i}: {p['title']} ({p['url']}) ---\n{p['content'][:3000]}"
        )
    return f"RESEARCH QUERY: {query}\n\nWEB SOURCES:\n" + "\n\n".join(blocks) + "\n\nExtract the knowledge graph now. Return ONLY the JSON object."


class GeminiExtractionService:
    def __init__(self):
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self.model = genai.GenerativeModel(
            model_name=settings.GEMINI_MODEL,
            system_instruction=EXTRACTION_SYSTEM_PROMPT,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1,
                max_output_tokens=4096,
            ),
        )

    async def extract(self, query: str, pages: List[Dict[str, str]], api_key: str = None, model_name: str = None) -> ExtractionResult:
        actual_key = api_key or settings.GEMINI_API_KEY
        actual_model = model_name or settings.GEMINI_MODEL

        # Create fallback models queue (starting with requested model)
        fallback_models = [
            actual_model,
            "gemini-2.0-flash-lite",
            "gemini-flash-latest",
            "gemini-3.1-flash-lite"
        ]

        # Deduplicate models while preserving order
        seen = set()
        fallback_models = [x for x in fallback_models if not (x in seen or seen.add(x))]

        prompt = _build_prompt(query, pages)
        raw = None
        last_exception = None

        for current_model_name in fallback_models:
            logger.info(f"Attempting extraction with model: {current_model_name}")
            try:
                model = genai.GenerativeModel(
                    model_name=current_model_name,
                    system_instruction=EXTRACTION_SYSTEM_PROMPT,
                    generation_config=genai.GenerationConfig(
                        response_mime_type="application/json",
                        temperature=0.1,
                        max_output_tokens=4096,
                    ),
                )
                if actual_key:
                    import google.ai.generativelanguage as glm
                    model._client = glm.GenerativeServiceClient(client_options={"api_key": actual_key})
                    model._async_client = glm.GenerativeServiceAsyncClient(client_options={"api_key": actual_key})

                response = await model.generate_content_async(prompt)
                raw = response.text
                
                # Attempt to parse JSON inside the loop to allow retries on failure
                # 1. Clean common LLM JSON errors (trailing commas)
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
                        
                break # Success!
                
            except Exception as e:
                logger.warning(f"Extraction failed with model {current_model_name}: {e}")
                last_exception = e
                continue
        else:
            raise RuntimeError(f"LLM extraction failed (all models exhausted): {last_exception}")

        return self._build(query, data)

    def _build(self, query: str, data: dict) -> ExtractionResult:
        entities, valid_ids = [], set()
        for e in data.get("entities", []):
            try:
                entity = ExtractedEntity(
                    id=e["id"],
                    name=e["name"],
                    type=EntityType(e.get("type", "OTHER")),
                    description=e.get("description", ""),
                    relevance_score=float(e.get("relevance_score", 0.5)),
                    source_url=e.get("source_url"),
                    claim=e.get("claim"),          # v2
                )
                entities.append(entity)
                valid_ids.add(entity.id)
            except Exception as ex:
                logger.warning(f"Skipping entity {e.get('id')}: {ex}")

        relationships = []
        for r in data.get("relationships", []):
            if r.get("source_id") in valid_ids and r.get("target_id") in valid_ids:
                try:
                    relationships.append(ExtractedRelationship(
                        source_id=r["source_id"],
                        target_id=r["target_id"],
                        relationship=r.get("relationship", "RELATED_TO"),
                        weight=float(r.get("weight", 1.0)),
                        claim=r.get("claim"),       # v2
                    ))
                except Exception as ex:
                    logger.warning(f"Skipping relationship: {ex}")

        logger.info(f"Extracted {len(entities)} entities, {len(relationships)} relationships")
        return ExtractionResult(
            query=query,
            entities=entities,
            relationships=relationships,
            summary=data.get("summary", f"Knowledge graph for: {query}"),
        )


gemini_service = GeminiExtractionService()
