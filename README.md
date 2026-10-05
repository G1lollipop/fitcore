# FitCore

An AI-powered fitness coaching app. The frontend and backend are managed together in a single monorepo:

```
Fitcore/
├── web/   # Frontend: Next.js 16 (App Router) + React 19 + Supabase (Auth + data)
└── rag/   # Backend: FastAPI + LangChain RAG retrieval service (Google Gemini)
```

## Architecture

```mermaid
flowchart TD
    Browser["Browser (React 19 client components)"]
    Auth["Supabase Auth<br/>(proxy.ts middleware · Google + email/password)"]
    Actions["Server Actions<br/>(web/app/actions/*)"]
    ChatAPI["/api/ai/chat (SSE)<br/>route.ts"]
    Supabase[("Supabase<br/>Auth + logs/plans/stats/chat")]
    LLM["Google Gemini<br/>(chat / parsing / vision / embedding)"]
    RAG["RAG service FastAPI (rag/)<br/>/v1/retrieve · /v1/chat · /v1/chat/stream"]

    Browser -->|"protected routes"| Auth
    Browser -->|"data read/write<br/>(userId injected server-side via requireUserId())"| Actions
    Browser -->|"chat"| ChatAPI
    Actions --> Supabase
    ChatAPI -->|"personal context user-context.ts"| Supabase
    ChatAPI -->|"generation"| LLM
    ChatAPI -->|"knowledge retrieval rag-client.ts"| RAG
    RAG -->|"vector + BM25 fusion · rerank"| RAG
```

> Note: the frontend never talks to Supabase directly — all data access goes through Server Actions (`web/lib/supabaseClient.ts` is `server-only` + service-role). The frontend calls the backend RAG service via `RAG_SERVICE_URL` (default `http://127.0.0.1:8000`).
>
> For the full development guide (architecture details, API contracts, ingestion, testing, troubleshooting), see [`DEVELOPMENT.md`](./DEVELOPMENT.md).

### Mobile-first UX principle

FitCore is designed as a phone app first. **Every main page must fit entirely inside one phone viewport without vertical scrolling.** Cards show only the highest-priority summary; longer lists, charts, and detailed editors live behind taps that open full-screen sheets. Cards themselves may be internally scrollable, but the main page scroll is avoided.

For the next AI logging validation round, use the [measurement definitions](./docs/ai-logging-metrics.md) and [five-person phone test kit](./docs/mobile-usability-test.md).

## Subprojects

| Directory | Description | Docs |
|------|------|------|
| [`web/`](./web) | Frontend single-page app; the home route `/` contains two tabs: **Today / Record** (Today = daily command center with Quick Log + AI coach; Record = past nutrition + training under one shared date, with 7-day trend charts). The app is **AI-logging-first**: the fastest path from "I want to log this" to "it's logged" is the protagonist; the coach answers evidence-grounded questions, while plan creation and editing live on Today. | [`web/README.md`](./web/README.md) |
| [`rag/`](./rag) | RAG retrieval service: vector retrieval + BM25 fusion, optional reranking, adaptive topK | [`DEVELOPMENT.md`](./DEVELOPMENT.md) |

## Local setup

### 1. Backend RAG service (rag/)

```bash
cd rag
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt   # Windows
# source .venv/bin/activate && pip install -r requirements-dev.txt  # macOS/Linux

cp .env.example .env          # at minimum set GOOGLE_AI_STUDIO_API_KEY
python scripts/ingest_seed_kb.py   # ingest the seed knowledge base (first run)
uvicorn backend_api:app --host 0.0.0.0 --port 8000
```

### 2. Frontend (web/)

```bash
cd web
cp .env.local.example .env.local   # configure Supabase / RAG_SERVICE_URL, etc.
npm install
npm run dev
```

Open http://localhost:3000 to use the app.

## Deployment

In the monorepo the frontend and backend deploy independently:

### Frontend → Vercel

When creating/linking a project on Vercel, set the **Root Directory** to `web` (Settings → General → Root Directory).
Everything else follows Next.js defaults; for environment variables see `web/.env.local.example`.

### Backend → Render

The repo root already has `render.yaml` (a Blueprint) whose `rootDir: rag` points at the backend subdirectory.
Connect this repo on Render using the **Blueprint** flow and it will be detected automatically;
secrets marked `sync: false` (`GOOGLE_AI_STUDIO_API_KEY`, `SUPABASE_*`, `UPSTASH_*`, etc.) are entered manually in the Render Dashboard.

> The frontend's `RAG_SERVICE_URL` must point at the public address of the backend service on Render.

## Tech stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Supabase (Auth + data)
- **Backend**: Python 3.11, FastAPI, LangChain 1.x, Google Gemini (gemini-2.5-flash + gemini-embedding-001), Chroma / Supabase pgvector
