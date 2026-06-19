"""
NexusSearch v2 - Search Router
SSE pipeline now includes ANALYZING stage:
Tavily → Gemini → Neo4j → Confidence Scoring → Contradiction Detection → Complete
"""
import logging
from typing import AsyncGenerator
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.models.graph import SSEEvent, PipelineStage
from app.services.tavily_search import tavily_search_service
from app.services.serper_search import serper_search_service
from app.services.scraper import scraper_service
from app.services.gemini_extractor import gemini_service
from app.services.neo4j_graph import neo4j_graph_service
from app.services.intelligence import score_and_write_confidence, detect_contradictions

logger = logging.getLogger(__name__)
router = APIRouter()


def _sse(event: SSEEvent) -> str:
    return f"data: {event.model_dump_json()}\n\n"


async def _run_pipeline(
    query: str,
    expand: bool = False,
    gemini_key: str = None,
    tavily_key: str = None,
    serper_key: str = None,
    model: str = None,
) -> AsyncGenerator[str, None]:
    try:
        # ── 0. Cache check ────────────────────────────────────────────────────
        yield _sse(SSEEvent(stage=PipelineStage.SEARCHING,
                            message="Checking knowledge base for cached results...",
                            progress=5))

        cached = await neo4j_graph_service.query_exists(query)
        if cached:
            yield _sse(SSEEvent(stage=PipelineStage.SEARCHING,
                                message="Found cached graph — loading from Neo4j...",
                                progress=80))
            graph = await neo4j_graph_service.read_graph(query)
            if graph:
                graph.cached = True
                yield _sse(SSEEvent(stage=PipelineStage.COMPLETE,
                                    message=f"Loaded {graph.node_count} nodes from cache.",
                                    progress=100, data=graph))
                return

        # ── 1. Search + Scrape ────────────────────────────────────────────────
        yield _sse(SSEEvent(stage=PipelineStage.SEARCHING,
                            message=f'Searching the web for "{query}"...',
                            progress=10))

        use_serper = bool(serper_key or (getattr(settings, "SERPER_API_KEY", "") and getattr(settings, "SERPER_API_KEY", "") != "your_serper_key_here"))
        if use_serper:
            logger.info("Using Serper Search + BeautifulSoup Scraper")
            raw_results = await serper_search_service.search(query, api_key=serper_key)
            if not raw_results:
                yield _sse(SSEEvent(stage=PipelineStage.ERROR,
                                    message="No search results returned from Serper.",
                                    progress=0,
                                    error="Serper returned 0 results. Check API key or query."))
                return
            yield _sse(SSEEvent(stage=PipelineStage.SEARCHING,
                                message=f"Scraping content from {len(raw_results)} sources...",
                                progress=20))
            results = await scraper_service.scrape_urls(raw_results)
        else:
            logger.info("Using Tavily Search Service")
            results = await tavily_search_service.search(query, api_key=tavily_key)

        if not results:
            yield _sse(SSEEvent(stage=PipelineStage.ERROR,
                                message="No search results returned or scraped.",
                                progress=0,
                                error="Search pipeline returned 0 results. Check API keys or query."))
            return

        yield _sse(SSEEvent(stage=PipelineStage.SEARCHING,
                            message=f"Retrieved {len(results)} sources with full content.",
                            progress=25))

        # ── 2. Gemini extraction ──────────────────────────────────────────────
        yield _sse(SSEEvent(stage=PipelineStage.EXTRACTING,
                            message="Extracting entities, relationships and claims...",
                            progress=40))

        extraction = await gemini_service.extract(query, results, api_key=gemini_key, model_name=model)

        yield _sse(SSEEvent(stage=PipelineStage.EXTRACTING,
                            message=(f"Extracted {len(extraction.entities)} entities, "
                                     f"{len(extraction.relationships)} relationships."),
                            progress=58))

        # ── 3. Neo4j write ────────────────────────────────────────────────────
        yield _sse(SSEEvent(stage=PipelineStage.WRITING_GRAPH,
                            message="Writing knowledge graph to Neo4j AuraDB...",
                            progress=68))

        await neo4j_graph_service.write_graph(extraction)

        # ── 4. Intelligence layer ─────────────────────────────────────────────
        yield _sse(SSEEvent(stage=PipelineStage.ANALYZING,
                            message="Scoring confidence across all sources...",
                            progress=76))

        await score_and_write_confidence(query)

        yield _sse(SSEEvent(stage=PipelineStage.ANALYZING,
                            message="Running contradiction detection engine...",
                            progress=86))

        contradictions = await detect_contradictions(query)
        contra_msg = (
            f"Found {contradictions.total} contradiction(s) — flagged on graph."
            if contradictions.total else "No contradictions detected across sources."
        )

        yield _sse(SSEEvent(stage=PipelineStage.ANALYZING,
                            message=contra_msg,
                            progress=93))

        # ── 5. Read back and complete ─────────────────────────────────────────
        graph = await neo4j_graph_service.read_graph(query)
        if not graph:
            raise ValueError("Graph written but could not be read back.")

        graph.cached = False
        yield _sse(SSEEvent(
            stage=PipelineStage.COMPLETE,
            message=(f"Graph ready — {graph.node_count} nodes, "
                     f"{graph.edge_count} edges, "
                     f"{graph.contradiction_count} contradiction(s)."),
            progress=100,
            data=graph,
        ))

    except Exception as e:
        logger.exception(f"Pipeline failed for '{query}': {e}")
        yield _sse(SSEEvent(stage=PipelineStage.ERROR,
                            message="Pipeline encountered an error.",
                            progress=0, error=str(e)))


@router.get("/search")
async def search_and_stream(
    q:          str  = Query(..., min_length=2, max_length=200),
    expand:     bool = Query(False),
    gemini_key: str  = Query(None),
    tavily_key: str  = Query(None),
    serper_key: str  = Query(None),
    model:      str  = Query(None),
):
    """
    SSE endpoint. Streams pipeline progress then delivers full GraphResponse.
    GET /api/v1/search?q=your+query
    GET /api/v1/search?q=Sam+Altman&expand=true   (query chaining)
    """
    return StreamingResponse(
        _run_pipeline(q, expand, gemini_key=gemini_key, tavily_key=tavily_key, serper_key=serper_key, model=model),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering":"no",
            "Connection":       "keep-alive",
        },
    )
