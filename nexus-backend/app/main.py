"""
NexusSearch v2 - Main Application
# Triggering uvicorn reload
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import settings
from app.core.neo4j_driver import neo4j_driver
from app.routers import search, graph, intelligence


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("NexusSearch v2 starting...")
    await neo4j_driver.connect()
    print("Neo4j AuraDB connected")
    yield
    await neo4j_driver.disconnect()
    print("Shutdown complete")


app = FastAPI(
    title="NexusSearch v2 API",
    description="AI Research Discovery Engine — GraphRAG-as-a-Service",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search.router,        prefix="/api/v1", tags=["Search"])
app.include_router(graph.router,         prefix="/api/v1", tags=["Graph"])
app.include_router(intelligence.router,  prefix="/api/v1", tags=["Intelligence"])


@app.get("/health")
async def health():
    ok = await neo4j_driver.ping()
    return {
        "status": "ok" if ok else "degraded",
        "version": "2.0.0",
        "services": {"api": "ok", "neo4j": "ok" if ok else "unreachable"},
    }
