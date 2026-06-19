# 🌐 NexusSearch — Visual Knowledge Graph Discovery Engine

> **GraphRAG-as-a-Service**: Transform unstructured web search queries into dynamic, interactive, and persistent visual knowledge graphs in real time.

---

## 🚀 Overview

**NexusSearch** is a state-of-the-art visual research engine built for the **HACKHAZARDS '26** hackathon. It combines the power of web scraping, large language models (Google Gemini), and graph databases (Neo4j) to deliver a real-time **GraphRAG (Retrieval-Augmented Generation)** experience.

Unlike traditional search engines that return flat list views of links, NexusSearch crawls web sources, extracts semantic relationships, stores them in a knowledge graph, and renders them interactively. 

```
                       [ User Search Query ]
                                │
                                ▼ SSE Stream Open
              ┌──────────────────────────────────┐
              │      FastAPI Search Pipeline     │
              └───────┬──────────────────┬───────┘
                      │                  │
            [Cache Hit?]                 [Cache Miss?]
                  │                              │
                  ▼                              ▼
          ┌───────────────┐              ┌───────────────┐
          │  Neo4j Read   │              │ Brave Search  │
          │  (Instant)    │              │ (Top 8 links) │
          └───────┬───────┘              └───────┬───────┘
                  │                              │
                  │                              ▼
                  │                      ┌───────────────┐
                  │                      │ Scrape URLs   │
                  │                      └───────┬───────┘
                  │                              │
                  │                              ▼
                  │                      ┌───────────────┐
                  │                      │ Gemini 2.0 LLM│
                  │                      │ (Extract JSON)│
                  │                      └───────┬───────┘
                  │                              │
                  │                              ▼
                  │                      ┌───────────────┐
                  │                      │  Neo4j Write  │
                  │                      │ (MERGE Graph) │
                  │                      └───────┬───────┘
                  │                              │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                     [ Render Interactive Graph ]
                      (Next.js & Force-Graph-2D)
```

---

## ✨ Features

- **⚡ Real-Time SSE Pipeline**: Experience the backend pipeline step-by-step with Server-Sent Events showing progress: `SEARCHING → SCRAPING → EXTRACTING → WRITING_GRAPH → COMPLETE`.
- **🕸️ Interactive Graph Visualization**: Powered by D3 force-directed simulations, explore nodes (entities) and edges (relationships) with physics-based drag, hover-inspectors, and custom color-coding.
- **🔄 Query Chaining (Expansion)**: Right-click any entity node in the graph to immediately trigger a sub-query, expanding your knowledge graph recursively.
- **💾 Smart Graph Caching**: Every search is cached in Neo4j AuraDB. Subsequent searches on identical queries or entity sub-queries fetch immediately, building a cumulative city/topic scale database.
- **📱 Responsive & Premium UI**: Designed with glassmorphism, responsive sidebar details, live node scaling by relevance, and high-fidelity dark mode.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Custom CSS Animations
- **Visuals**: `react-force-graph-2d` (HTML5 Canvas & D3)
- **Icons**: Lucide React

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **LLM/Extraction**: Google Gemini 2.0 Flash
- **Database**: Neo4j AuraDB (Graph Database)
- **Search API**: Serper API / Brave Search API
- **Scraper**: HTTPX + BeautifulSoup4 (Asynchronous pool)

---

## 📂 Project Structure

```
nexussearch/
├── README.md               # Master Project documentation (This file)
├── nexus-backend/          # FastAPI Backend (Python)
│   ├── app/                # Main app router, database, LLM helpers
│   ├── requirements.txt    # Backend package dependencies
│   ├── railway.json        # Railway deployment config
│   └── nixpacks.toml       # Nixpacks builder override
└── nexus-frontend/         # Next.js Frontend (React)
    ├── app/                # Next.js App Router pages
    ├── components/         # Graph canvas and inspector panel components
    ├── package.json        # Frontend scripts and package details
    └── vercel.json         # Vercel deployment routes and CORS config
```

---

## ⚙️ Quick Start

Ensure you have **Python 3.11+** and **Node.js 18+** installed.

### 🔑 Get API Keys
1. **Neo4j AuraDB (Free)**: Sign up at [Neo4j Console](https://console.neo4j.io/) and create an instance. Copy the URI, username, and password.
2. **Google Gemini API Key**: Generate a free key at [Google AI Studio](https://aistudio.google.com/app/apikey).
3. **Serper API Key**: Generate a key at [Serper.dev](https://serper.dev/) for search results.

---

### 1. Run the FastAPI Backend
```bash
cd nexus-backend

# Create & activate a virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
```
Edit `.env` and fill in your keys:
```env
NEO4J_URI=neo4j+s://xxxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password

BRAVE_API_KEY=your_search_api_key
GEMINI_API_KEY=your_gemini_api_key
```
Start the server:
```bash
uvicorn app.main:app --reload --port 8000
```
Verify the server status at `http://localhost:8000/health`.

---

### 2. Run the Next.js Frontend
In a new terminal window:
```bash
cd nexus-frontend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
```
Edit `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```
Start the development server:
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser to run the platform locally.

---

## ☁️ Deployment

### Backend (Railway/Render)
The backend is ready to deploy on **Railway** (using `railway.json` and `nixpacks.toml`) or **Render** (via docker/nixpacks).
- Make sure to set the environment variables in your deployment portal matching the ones in your `.env`.
- Set `ALLOWED_ORIGINS` to allow requests from your production Vercel frontend URL.

### Frontend (Vercel)
The frontend is configured for deployment on **Vercel**.
- Set the environment variable `NEXT_PUBLIC_API_URL` to point to your deployed backend URL.
- Update `vercel.json` rewrite paths if needed.

---

## 📝 License
This project is built for HackHazards '26. All rights reserved.
