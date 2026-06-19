# NexusSearch — FastAPI Backend

Visual Knowledge Graph Discovery Engine — GraphRAG-as-a-Service

## Architecture

```
User Query
    │
    ▼
FastAPI SSE Endpoint (/api/v1/search)
    │
    ├── 1. Cache Check ──────────────► Neo4j AuraDB (INSTANT if cached)
    │
    ├── 2. Brave Search API ─────────► Top 8 web results
    │
    ├── 3. httpx + BeautifulSoup ────► Concurrent scraping (5 parallel)
    │
    ├── 4. Gemini 2.0 Flash ─────────► JSON-mode entity extraction
    │        (strict prompt → structured entities + relationships)
    │
    ├── 5. Neo4j Write ──────────────► MERGE entities + relationships (idempotent)
    │
    └── 6. SSE Complete Event ───────► Full GraphResponse to frontend
```

## Setup

```bash
# 1. Clone and navigate
cd nexus-backend

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 5. Run development server
uvicorn app.main:app --reload --port 8000
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health + Neo4j status |
| GET | `/api/v1/search?q=<query>` | **Main SSE pipeline endpoint** |
| GET | `/api/v1/graph?q=<query>` | Read cached graph from Neo4j |
| GET | `/api/v1/graph/node/{id}` | Get single node details |
| GET | `/api/v1/graph/history` | Recent search queries |
| GET | `/api/v1/graph/stats` | Global knowledge base stats |
| DELETE | `/api/v1/graph?q=<query>` | Force-delete cache for re-run |

## SSE Event Stream

Connect to `/api/v1/search?q=your+query` and listen for events:

```javascript
const source = new EventSource(`/api/v1/search?q=${encodeURIComponent(query)}`);

source.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // data.stage: SEARCHING | SCRAPING | EXTRACTING | WRITING_GRAPH | COMPLETE | ERROR
  // data.message: Human-readable status
  // data.progress: 0-100
  // data.data: GraphResponse (only on COMPLETE)
  // data.error: string (only on ERROR)
};
```

## Query Chaining

Every entity node has an `id`. When a user clicks a node to expand it,
the frontend calls the same SSE endpoint with the node's name as the new query.
Neo4j acts as a growing cache — second visits to any topic are instant.

## Deployment (Railway)

```bash
# railway.json is auto-detected
# Set all .env variables in Railway dashboard
# Start command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```
