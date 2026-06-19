"""
NexusSearch - Serper Search Service
Replaces Brave Search. Uses Serper.dev (Google results).
Free tier: 2,500 queries, no credit card required.
Sign up: https://serper.dev
"""

import httpx
from typing import List, Dict
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

SERPER_URL = "https://google.serper.dev/search"


class SerperSearchService:
    def __init__(self):
        self.headers = {
            "X-API-KEY": settings.SERPER_API_KEY,
            "Content-Type": "application/json",
        }

    async def search(self, query: str) -> List[Dict[str, str]]:
        """
        Search Google via Serper and return a list of result dicts.
        Each dict has: { url, title, description, snippet }
        """
        payload = {
            "q": query,
            "num": settings.SERPER_RESULTS_COUNT,
            "gl": "us",
            "hl": "en",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                response = await client.post(
                    SERPER_URL,
                    headers=self.headers,
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"Serper API HTTP error: {e.response.status_code} — {e.response.text}")
                raise
            except httpx.RequestError as e:
                logger.error(f"Serper API request failed: {e}")
                raise

        results = []

        # Serper returns organic results under "organic" key
        for item in data.get("organic", []):
            results.append({
                "url":         item.get("link", ""),
                "title":       item.get("title", ""),
                "description": item.get("snippet", ""),
                "snippet":     item.get("snippet", ""),
            })

        # Also pull Knowledge Graph snippet if present (great for entity-heavy queries)
        kg = data.get("knowledgeGraph", {})
        if kg.get("description"):
            results.insert(0, {
                "url":         kg.get("website", ""),
                "title":       kg.get("title", query),
                "description": kg.get("description", ""),
                "snippet":     kg.get("description", ""),
            })

        logger.info(f"Serper returned {len(results)} results for: '{query}'")
        return results


serper_search_service = SerperSearchService()
