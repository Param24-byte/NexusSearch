# NexusSearch — Master Setup & Integration Guide
## HACKHAZARDS '26

---

## Project Structure

```
nexussearch/
├── nexus-backend/         ← FastAPI + Python
└── nexus-frontend/        ← Next.js 14 + React
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.11+ | python.org |
| Node.js | 18+ | nodejs.org |
| Git | any | git-scm.com |

---

## Step 1 — Clone / Create Project Root

```bash
mkdir nexussearch && cd nexussearch
# Copy nexus-backend/ and nexus-frontend/ into this directory
```

---

## Step 2 — API Keys You Need

Get these before anything else:

### Neo4j AuraDB (Free)
1. Go to https://console.neo4j.io
2. Create a free AuraDB instance
3. Download the credentials file when prompted — you only see the password ONCE
4. Save: `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`
5. **Pro tip:** Ping your instance once before the demo — free tier idles after inactivity

### Serper Search API (Free: 2,500 queries, no credit card)
1. Go to https://serper.dev
2. Sign up → Dashboard → API Key (generated instantly)
3. Save: `SERPER_API_KEY`

### Google Gemini (Free tier: generous)
1. Go to https://aistudio.google.com/app/apikey
2. Create API key
3. Save: `GEMINI_API_KEY`

---

## Step 3 — Backend Setup

```bash
cd nexus-backend

# Create virtual environment
python -m venv venv

# Activate it
source venv/bin/activate        # Mac/Linux
# venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
```

Now edit `.env` with your real keys:

```env
NEO4J_URI=neo4j+s://xxxxxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-actual-password

BRAVE_API_KEY=BSA_your_actual_key

GEMINI_API_KEY=AIza_your_actual_key
```

### Test the backend

```bash
# Start the server
uvicorn app.main:app --reload --port 8000

# In another terminal — test health
curl http://localhost:8000/health
# Expected: {"status":"ok","services":{"api":"ok","neo4j":"ok"}}

# Test a live search (watch SSE events stream in)
curl -N "http://localhost:8000/api/v1/search?q=test+query"
```

If Neo4j shows "unreachable" in health — check your URI starts with `neo4j+s://` (not `bolt://`).

---

## Step 4 — Frontend Setup

```bash
cd ../nexus-frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Start the frontend

```bash
npm run dev
# Opens at http://localhost:3000
```

The frontend auto-detects if `NEXT_PUBLIC_API_URL` is set:
- **Set** → Live mode: connects to your FastAPI backend via SSE
- **Not set** → Demo mode: uses pre-loaded mock data (safe for offline demos)

---

## Step 5 — Verify Full Integration

With both servers running:

1. Open http://localhost:3000
2. Search for **"Economic history of India"**
3. You should see SSE stage pills advance: `SEARCHING → SCRAPING → EXTRACTING → WRITING_GRAPH → COMPLETE`
4. The graph renders with ~15-18 nodes
5. Click a node — sidebar shows detail
6. Right-click a node — triggers query chaining (new search on that entity)
7. Search the same topic again — should return instantly (Neo4j cache hit)

---

## Step 6 — Deploy to Production

### Backend → Railway

```bash
cd nexus-backend

# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

In Railway dashboard → Variables, add all your `.env` values.

Your backend URL will be: `https://nexus-backend-<hash>.railway.app`

### Frontend → Vercel

```bash
cd nexus-frontend

# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

When prompted, set environment variable:
```
NEXT_PUBLIC_API_URL = https://nexus-backend-<hash>.railway.app
```

Update `vercel.json` with your actual Railway URL too.

---

## Step 7 — CORS Fix for Production

Once deployed, update `nexus-backend/.env` (Railway variables):

```env
ALLOWED_ORIGINS=["https://your-app.vercel.app","http://localhost:3000"]
```

Redeploy backend after this change.

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| `neo4j: unreachable` | Wrong URI scheme | Use `neo4j+s://` not `bolt://` |
| Gemini returns garbage | Prompt too loose | Check `gemini_extractor.py` system prompt |
| Graph renders empty | No edges from LLM | Lower entity count, check extraction logs |
| SSE connection drops | Nginx buffering | Ensure `X-Accel-Buffering: no` header (already set) |
| Railway cold start | Free tier sleep | Add a /health ping before demo |
| CORS errors | Missing origin | Update `ALLOWED_ORIGINS` in backend env |
| `react-force-graph-2d` SSR error | Next.js SSR | Already handled with `dynamic(..., { ssr: false })` |

---

## Demo Script (for judges)

1. **Open the app** — explain the split-screen: graph canvas (75%) + inspector (25%)
2. **Search "The rise of artificial intelligence"** — let SSE stages play out live
3. **Point out** — "You're watching the pipeline: Brave Search → scrape → Gemini → Neo4j write"
4. **Click "OpenAI" node** — sidebar shows detail, relevance bar, connections
5. **Right-click "OpenAI"** — query chains! New graph expands
6. **Search same query again** — instant cache hit from Neo4j
7. **Open Neo4j console** — show the actual graph DB filling up in real time

---

## Architecture Recap

```
User types query
      │
      ▼ SSE stream opens
FastAPI /api/v1/search
      │
      ├─ [Cache check] ──────────────────► Neo4j AuraDB
      │       └─ HIT → return instantly ◄─┘
      │
      ├─ Brave Search API → 8 URLs
      │
      ├─ httpx + BeautifulSoup → parallel scrape
      │
      ├─ Gemini 2.0 Flash → JSON extraction
      │       └─ entities[] + relationships[]
      │
      ├─ Neo4j MERGE → write graph
      │
      └─ SSE COMPLETE event → GraphResponse
                │
                ▼
      Next.js receives GraphResponse
                │
                ▼
      react-force-graph-2d renders
      D3 force simulation runs:
        - Charge repulsion (anti-overlap)
        - Link springs (clustering)
        - Center gravity (anchoring)
        - Mass-by-relevance (query node stays central)
```
