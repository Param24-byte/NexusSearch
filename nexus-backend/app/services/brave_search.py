"""
NexusSearch - Brave Search Service
Fetches top web results for a query using the Brave Search API
"""

import httpx
from typing import List, Dict
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


class BraveSearchService:
    def __init__(self):
        self.headers = {
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": settings.BRAVE_API_KEY,
        }

    async def search(self, query: str) -> List[Dict[str, str]]:
        """
        Search Brave for a query and return a list of result dicts.
        Each dict has: { url, title, description }
        """
        params = {
            "q": query,
            "count": settings.BRAVE_RESULTS_COUNT,
            "search_lang": "en",
            "result_filter": "web",
            "text_decorations": False,
            "extra_snippets": True,
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                response = await client.get(
                    settings.BRAVE_SEARCH_URL,
                    headers=self.headers,
                    params=params,
                )
                response.raise_for_status()
                data = response.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"Brave API HTTP error: {e.response.status_code}")
                raise
            except httpx.RequestError as e:
                logger.error(f"Brave API request failed: {e}")
                raise

        results = []
        web_results = data.get("web", {}).get("results", [])

        for item in web_results:
            results.append({
                "url": item.get("url", ""),
                "title": item.get("title", ""),
                "description": item.get("description", ""),
                # extra_snippets gives richer text, fall back to description
                "snippet": " ".join(item.get("extra_snippets", [item.get("description", "")])),
            })

        logger.info(f"Brave returned {len(results)} results for query: '{query}'")
        return results


brave_search_service = BraveSearchService()
