"""
NexusSearch - Tavily Search + Extract Service
Replaces both brave_search.py AND scraper.py in one call.

Tavily is purpose-built for LLM/RAG pipelines:
- Returns extracted page content alongside search results
- No credit card, no signup — keyless mode works out of the box
- 1,000 free credits/month when you do sign up at app.tavily.com

Keyless mode (zero setup): TavilyClient() — rate-limited but works instantly
Keyed mode (1000/mo free): TavilyClient(api_key="tvly-...")
"""

from tavily import TavilyClient, AsyncTavilyClient
from typing import List, Dict
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


class TavilySearchService:

    def _get_client(self, api_key: str = None):
        """
        Returns keyed client if TAVILY_API_KEY or the passed api_key is set,
        otherwise falls back to keyless mode automatically.
        """
        actual_key = (api_key or getattr(settings, "TAVILY_API_KEY", "")).strip()
        if actual_key and actual_key != "your-tavily-api-key":
            return AsyncTavilyClient(api_key=actual_key)
        # Keyless — no signup, no card, rate-limited
        logger.info("Tavily running in keyless mode (no API key set)")
        return AsyncTavilyClient()

    async def search(self, query: str, api_key: str = None) -> List[Dict[str, str]]:
        """
        Search + extract in ONE API call.
        Returns list of dicts: { url, title, description, content, snippet }
        content = full extracted page text (replaces the scraper entirely)
        """
        client = self._get_client(api_key=api_key)
        count = getattr(settings, "TAVILY_RESULTS_COUNT", 8)

        try:
            response = await client.search(
                query=query,
                max_results=count,
                search_depth="basic",       # 1 credit per call (not 2)
                include_raw_content=True,   # full extracted page text — kills the scraper
                include_answer=False,       # we use Gemini for summarisation, not Tavily
                topic="general",
            )
        except Exception as e:
            logger.error(f"Tavily search failed: {e}")
            raise

        results = []
        for item in response.get("results", []):
            # raw_content is the full cleaned page text Tavily extracted
            # fall back to the snippet if raw_content is empty
            full_content = (item.get("raw_content") or item.get("content") or "").strip()

            results.append({
                "url":         item.get("url", ""),
                "title":       item.get("title", ""),
                "description": item.get("content", ""),   # snippet
                "snippet":     item.get("content", ""),
                # This is what gets passed to Gemini — full page text
                "content":     full_content[:settings.MAX_CONTENT_CHARS] if full_content else item.get("content", ""),
            })

        logger.info(f"Tavily returned {len(results)} results for: '{query}'")
        return results


tavily_search_service = TavilySearchService()
