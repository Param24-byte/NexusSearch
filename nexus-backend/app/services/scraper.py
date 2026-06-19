"""
NexusSearch - Web Scraper Service
Fast async scraping with httpx + BeautifulSoup.
Strips boilerplate, extracts meaningful text content only.
"""

import asyncio
import httpx
from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import logging
import re

from app.core.config import settings

logger = logging.getLogger(__name__)

# Headers that help bypass basic bot detection
SCRAPE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
}

# Tags that are almost always boilerplate
BOILERPLATE_TAGS = [
    "script", "style", "nav", "footer", "header",
    "aside", "advertisement", "form", "button", "iframe",
]


class ScraperService:

    async def scrape_url(self, url: str) -> Optional[str]:
        """
        Scrape a single URL and return cleaned text content.
        Returns None if scraping fails (silently — we don't want one bad URL to kill the pipeline).
        """
        try:
            async with httpx.AsyncClient(
                timeout=settings.SCRAPE_TIMEOUT_SECONDS,
                follow_redirects=True,
                headers=SCRAPE_HEADERS,
            ) as client:
                response = await client.get(url)
                response.raise_for_status()
                content_type = response.headers.get("content-type", "")
                if "text/html" not in content_type:
                    return None
                html = response.text

            return self._extract_text(html, url)

        except httpx.TimeoutException:
            logger.warning(f"Timeout scraping: {url}")
            return None
        except httpx.HTTPStatusError as e:
            logger.warning(f"HTTP {e.response.status_code} scraping: {url}")
            return None
        except Exception as e:
            logger.warning(f"Failed to scrape {url}: {e}")
            return None

    def _extract_text(self, html: str, url: str) -> str:
        """Parse HTML and extract clean, meaningful text."""
        soup = BeautifulSoup(html, "html.parser")

        # Remove all boilerplate tags
        for tag in BOILERPLATE_TAGS:
            for element in soup.find_all(tag):
                element.decompose()

        # Try to find the main content area first
        main_content = (
            soup.find("main")
            or soup.find("article")
            or soup.find(id=re.compile(r"content|main|article", re.I))
            or soup.find(class_=re.compile(r"content|main|article|post", re.I))
            or soup.body
        )

        if not main_content:
            return ""

        # Extract text with spacing between block elements
        lines = []
        for element in main_content.find_all(
            ["p", "h1", "h2", "h3", "h4", "li", "blockquote", "td"]
        ):
            text = element.get_text(separator=" ", strip=True)
            if len(text) > 40:  # Skip noise like single words or short labels
                lines.append(text)

        full_text = "\n".join(lines)

        # Trim to max chars for cost control
        if len(full_text) > settings.MAX_CONTENT_CHARS:
            full_text = full_text[: settings.MAX_CONTENT_CHARS] + "..."

        return full_text

    async def scrape_urls(
        self, search_results: List[Dict[str, str]]
    ) -> List[Dict[str, str]]:
        """
        Scrape all URLs concurrently (up to MAX_CONCURRENT_SCRAPES at a time).
        Returns enriched list with 'content' added to each result dict.
        """
        semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_SCRAPES)

        async def scrape_with_semaphore(result: Dict[str, str]) -> Dict[str, str]:
            async with semaphore:
                url = result["url"]
                content = await self.scrape_url(url)
                return {
                    **result,
                    # Fall back to the Brave snippet if scraping fails
                    "content": content or result.get("snippet", result.get("description", "")),
                }

        tasks = [scrape_with_semaphore(r) for r in search_results]
        scraped = await asyncio.gather(*tasks)

        # Filter out results with no usable content
        valid = [r for r in scraped if r.get("content") and len(r["content"]) > 100]
        logger.info(f"Successfully scraped {len(valid)}/{len(search_results)} URLs")
        return valid


scraper_service = ScraperService()
