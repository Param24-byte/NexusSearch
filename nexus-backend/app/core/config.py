"""
NexusSearch v2 - Configuration
"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # App
    APP_ENV:         str       = "development"
    DEBUG:           bool      = True
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "https://nexussearch.vercel.app",
    ]

    # Neo4j AuraDB
    NEO4J_URI:      str = "neo4j+s://your-instance.databases.neo4j.io"
    NEO4J_USERNAME: str = "neo4j"
    NEO4J_PASSWORD: str = "your-password"

    # Tavily (no key = keyless mode)
    TAVILY_API_KEY:       str = ""
    TAVILY_RESULTS_COUNT: int = 8

    # Serper Search
    SERPER_API_KEY:       str = ""
    SERPER_RESULTS_COUNT: int = 8

    # Gemini
    GEMINI_API_KEY: str = "your-gemini-api-key"
    GEMINI_MODEL:   str = "gemini-2.0-flash"

    # Pipeline tuning
    SCRAPE_TIMEOUT_SECONDS: int = 10
    MAX_CONTENT_CHARS:      int = 8000
    MAX_CONCURRENT_SCRAPES: int = 5

    # Intelligence layer
    MULTIHOP_MAX_DEPTH:     int   = 4
    MULTIHOP_MAX_PATHS:     int   = 8
    CONTRADICTION_MIN_CONF: float = 0.3
    BRIDGE_MAX_PATH_LEN:    int   = 5

    class Config:
        env_file            = ".env"
        env_file_encoding   = "utf-8"
        extra               = "ignore"


settings = Settings()
