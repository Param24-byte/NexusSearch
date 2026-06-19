"""
NexusSearch v2 - Neo4j Async Driver
Extended indexes for intelligence queries.
"""
from neo4j import AsyncGraphDatabase, AsyncDriver
from typing import Optional, List, Dict, Any
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


class Neo4jDriver:
    def __init__(self):
        self._driver: Optional[AsyncDriver] = None

    async def connect(self):
        self._driver = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD),
            max_connection_pool_size=20,
        )
        await self._create_indexes()

    async def disconnect(self):
        if self._driver:
            await self._driver.close()

    async def ping(self) -> bool:
        try:
            async with self._driver.session() as session:
                await session.run("RETURN 1")
            return True
        except Exception:
            return False

    async def _create_indexes(self):
        indexes = [
            "CREATE INDEX entity_id    IF NOT EXISTS FOR (e:Entity)    ON (e.id)",
            "CREATE INDEX entity_name  IF NOT EXISTS FOR (e:Entity)    ON (e.name)",
            "CREATE INDEX entity_type  IF NOT EXISTS FOR (e:Entity)    ON (e.type)",
            "CREATE INDEX query_node   IF NOT EXISTS FOR (q:QueryNode) ON (q.query)",
            # v2: index on confidence and contradiction flag for fast intelligence queries
            "CREATE INDEX entity_conf  IF NOT EXISTS FOR (e:Entity)    ON (e.confidence)",
        ]
        async with self._driver.session() as session:
            for idx in indexes:
                try:
                    await session.run(idx)
                except Exception as ex:
                    logger.warning(f"Index creation skipped: {ex}")

    async def run_query(
        self,
        cypher: str,
        parameters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        async with self._driver.session() as session:
            result = await session.run(cypher, parameters or {})
            return await result.data()

    async def run_write_query(
        self,
        cypher: str,
        parameters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        async def _write(tx):
            r = await tx.run(cypher, parameters or {})
            return await r.data()
        async with self._driver.session() as session:
            return await session.execute_write(_write)


neo4j_driver = Neo4jDriver()
