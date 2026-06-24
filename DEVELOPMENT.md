# FitCore Development Guide

A complete guide for developers covering architecture, local setup, environment variables, API contracts, directory structure, common commands, deployment, and troubleshooting.
For a product overview see [`README.md`](./README.md).

---

## Table of contents

- [1. Architecture overview](#1-architecture-overview)
- [2. Repo structure](#2-repo-structure)
- [3. Requirements](#3-requirements)
- [4. Local setup](#4-local-setup)
- [5. Environment variables](#5-environment-variables)
- [6. Backend `rag/`](#6-backend-rag)
- [7. Frontend `web/`](#7-frontend-web)
- [8. Common dev commands](#8-common-dev-commands)
- [9. Deployment](#9-deployment)
- [10. Troubleshooting](#10-troubleshooting)

---

## 1. Architecture overview

FitCore is an AI-powered fitness coaching app with a separated frontend/backend, combined in a single monorepo.

```
Browser
  ├── Server Actions ─────────────► Supabase (CRUD for logs / plans / stats and other business data)
  └── fetch /api/ai/chat (SSE) ───► Next server-side Agent (web/lib/ai/agent.ts)
                                      ├── Google Gemini (chat + tool calling)
                                      ├── Gemini (vision tool for meal photo recognition)
                                      ├── Supabase (user context, chat history)
                                      └── RAG service POST /v1/retrieve ──► FastAPI (rag/)
                                                                          ├── vector retrieval + BM25 fusion
                                                                          ├── optional CrossEncoder rerank
                                                                          └── Gemini generation (/v1/chat path)
```

Key points:

- **Business data** goes through Next.js Server Actions straight to Supabase — no custom REST layer.
- **AI chat** goes through `POST /api/ai/chat` (SSE streaming). The server-side Agent uses tool calling to decide whether to query the knowledge base and whether to read user data.
- **Knowledge retrieval** is provided by a standalone FastAPI service (`rag/`); the frontend calls its `/v1/retrieve` via `RAG_SERVICE_URL`.

---

## 2. Repo structure

```
Fitcore/
├── web/                      # Frontend: Next.js 16 (App Router)
│   ├── app/
│   │   ├── page.tsx          # Main app (tab-switched across 5 modules)
│   │   ├── layout.tsx        # Root layout (fonts / theme / analytics)
│   │   ├── onboarding/       # First-run onboarding
│   │   ├── sign-in/ sign-up/ # Supabase Auth pages (Google + email/password)
│   │   ├── auth/callback/    # OAuth / email-verification callback (code → session)
│   │   ├── api/ai/chat/      # SSE streaming AI endpoint
│   │   └── actions/          # 'use server' business actions (dashboard/log/plans/chat...)
│   ├── components/
│   │   ├── ui/               # shadcn/ui base components (only the ones in use)
│   │   ├── layout|dashboard|nutrition|training|plans|log-form|ai-chat/
│   ├── lib/
│   │   ├── ai/               # agent / rag-client / user-context / model / prompts / types
│   │   ├── supabaseClient.ts openaiClient.ts database.types.ts
│   │   └── plans|training|metrics|utils
│   ├── hooks/                # toast / quick-log / sidebar
│   ├── proxy.ts              # Supabase session refresh + route protection + onboarding gate (Next 16 uses proxy.ts)
│   └── .env.local.example
│
├── rag/                      # Backend: FastAPI + LangChain RAG service
│   ├── app/
│   │   ├── main.py           # App factory + lifespan warmup
│   │   ├── api/              # chat / retrieve / health routes
│   │   ├── schemas/          # Pydantic API contracts (LOCKED)
│   │   ├── services/         # RagService, kb_service, retrieval/*, history_store
│   │   ├── prompts/          # RAG chat prompts
│   │   ├── infra/            # embeddings / cache / supabase_client
│   │   ├── ingest/           # MD5 dedup / Supabase writer
│   │   └── core/             # settings.py / constants.py
│   ├── parsers/              # TXT/PDF/DOCX/MD/HTML parsing
│   ├── data/                 # Knowledge base: kb_*.txt (curated) + auto_*.txt (auto-harvested) + sources.yaml
│   ├── scripts/              # ingest_seed_kb / print_embedding_dim / download_reranker
│   ├── eval/                 # LLM-as-Judge evaluation
│   ├── supabase/migrations/  # pgvector table + RPC
│   ├── tests/                # pytest
│   ├── backend_api.py        # Docker entry shim: re-exports app.main:app
│   └── Dockerfile
│
├── render.yaml               # Render Blueprint (rootDir: rag)
├── README.md                 # Product overview
└── DEVELOPMENT.md            # This file
```

---

## 3. Requirements

| Tool | Version |
|------|------|
| Node.js | 20+ (LTS recommended) |
| npm | bundled with Node |
| Python | 3.11 |
| Git | any recent version |

External service accounts (as needed):

- **Supabase** (auth + business database; also reused for backend pgvector)
- **Google AI Studio (Gemini)** (chat + structured parsing + vision + `gemini-embedding-001` vectors — one key covers everything)
- **Upstash Redis** (optional, backend retrieval cache)

---

## 4. Local setup

> Start the backend first (`:8000`), then the frontend (`:3000`).

### 4.1 Backend `rag/`

```bash
cd rag
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
# source .venv/bin/activate

pip install -r requirements-dev.txt   # = production deps + pytest (no reranker)
# Optional: enable CrossEncoder reranking locally
# pip install torch sentence-transformers

cp .env.example .env                   # at minimum set GOOGLE_AI_STUDIO_API_KEY
python scripts/print_embedding_dim.py  # confirm the vector dimension (default 768)
python scripts/ingest_seed_kb.py       # ingest data/kb_*.txt + auto_*.txt knowledge base

uvicorn backend_api:app --host 0.0.0.0 --port 8000 --reload
```

Health check: `curl http://127.0.0.1:8000/v1/health`

### 4.2 Frontend `web/`

```bash
cd web
cp .env.local.example .env.local       # fill in Supabase / RAG_SERVICE_URL
npm install
npm run dev
```

Open http://localhost:3000. After your first login, if there's no `user_settings` record you'll be redirected to `/onboarding`.

---

## 5. Environment variables

### 5.1 Frontend (`web/.env.local`)

| Variable | Required | Description |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL (shared by auth + data) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key, used by the cookie session client (sign-in/sign-up/Google OAuth) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | service-role key for server-side data access (bypasses RLS — never expose to the browser) |
| `RAG_SERVICE_URL` | ✅ | Backend RAG service URL (local default `http://127.0.0.1:8000`) |
| `RAG_CLIENT_TIMEOUT_MS` | | RAG call timeout (default 120000; raise it for cold starts) |
| `GOOGLE_AI_STUDIO_API_KEY` | ✅ | Gemini key covering all AI features: chat / parsing / vision |
| `AI_CHAT_MODEL` / `AI_FAST_MODEL` | | Model names (default `gemini-2.5-flash`) |
| `GEMINI_VISION_MODEL` | | Vision model for meal photo recognition (default `gemini-2.5-flash`) |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | | Optional: override the Gemini default when pointing at another OpenAI-compatible provider |
| `AI_CHAT_DEBUG_META` / `RAG_VECTOR_BACKEND` | | For debugging; response meta includes retrieval-backend info |

### 5.2 Backend (`rag/.env`)

| Variable | Required | Description |
|------|------|------|
| `GOOGLE_AI_STUDIO_API_KEY` | ✅ | Gemini key (shared by chat + embedding; also accepts `GEMINI_API_KEY` / `DASHSCOPE_API_KEY`) |
| `RAG_CHAT_MODEL` | | Default `gemini-2.5-flash` |
| `EMBEDDING_MODEL` / `EMBEDDING_DIM` | | Embedding model and dimension (default `models/gemini-embedding-001` / `768`; must match the migration) |
| `LLM_BASE_URL` | | OpenAI-compatible chat endpoint (default Gemini) |
| `VECTOR_BACKEND` | ✅ | `chroma` (local default) or `supabase` (pgvector) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | △ | Required only when `VECTOR_BACKEND=supabase` |
| `RERANKER_ENABLED` | | `true` enables reranking (needs torch); must be `false` in the cloud |
| `RERANKER_MODEL_NAME` / `_PATH` / `_KWARGS` | | Reranker model config |
| `CACHE_BACKEND` | | `memory` (default) or `redis` |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | △ | Required when `CACHE_BACKEND=redis` |
| `ALLOWED_ORIGINS` | | Allowed cross-origin frontend origins |
| `EVAL_JUDGE_MODEL` | | LLM-as-Judge model used for evaluation |

> All `.env` / `.env.local` are gitignored — never commit secrets. `SUPABASE_SERVICE_ROLE_KEY` is a high-privilege key and is used only on the backend.

---

## 6. Backend `rag/`

### 6.1 HTTP API

| Method | Path | Purpose |
|------|------|------|
| `GET` | `/v1/health`, `/api/health` | Health check |
| `POST` | `/v1/retrieve` | **Retrieval only** (used by the frontend Agent's tool), returns `chunks` |
| `POST` | `/v1/chat` | Full RAG: retrieve → LLM generation, returns answer + citations + meta |
| `POST` | `/api/chat` | Legacy slim wrapper, returns only `{ "response": answer }` |

`/v1/retrieve` contract (`app/schemas/retrieve.py`, **LOCKED** — changes require front/back coordination):

```jsonc
// request
{ "query": "how to build muscle", "sessionId": "anonymous", "userContext": {}, "topK": 5 }
// response
{ "chunks": [ { "id": "...", "title": "...", "source": "...", "snippet": "...", "score": 0.83 } ] }
```

### 6.2 RAG pipeline

```
query → retriever
        ├── vector retrieval (k=10)   Chroma similarity or Supabase RPC match_rag_kb_chunks
        └── BM25 (k=10)               in-memory full corpus
        → EnsembleRetriever fusion (0.5 / 0.5)
        → [optional] CrossEncoder rerank (RERANKER_ENABLED=true)
        → adaptive topK ∈ {3,5,8} (compute_retrieval_k; callers may force 1–20)
        → assemble [doc N] context + citations
        → Gemini generation (inject userContext personalization + file-based chat history)
```

Key files: `app/services/rag_service.py` (orchestration), `app/services/retrieval/*` (retrieval backends), `app/infra/embeddings.py`, `app/prompts/rag_chat.py`.

### 6.3 Ingestion

1. Parse: `parsers/` (TXT/PDF/DOCX/MD/HTML)
2. Dedup: MD5 (`app/ingest/md5_store.py` → `./md5.text`)
3. Split: default `RecursiveCharacterTextSplitter` (1000/100). `CHUNKING_STRATEGY=semantic` switches to semantic chunking, but it calls embedding for every sentence and **easily exceeds the Gemini free-tier 100 req/min limit (429)** — only recommended on a paid tier or for very small corpora.
4. Embed: `gemini-embedding-001` (default 768 dims, tunable via `EMBEDDING_DIM`)
5. Write: Chroma (`./chroma`) or Supabase (`rag_kb_chunks`)

```bash
python scripts/fetch_sources.py             # optional: harvest authoritative English sources per data/sources.yaml → data/auto_*.txt
python scripts/ingest_seed_kb.py            # ingest data/kb_*.txt + auto_*.txt
python scripts/ingest_seed_kb.py --force    # force overwrite when switching vector backends / re-ingesting
```

> Knowledge-base sources (English, evidence-based, freely usable) are registered in `data/sources.yaml`:
> - `kb_*.txt`: hand-curated high-signal summaries (e.g. ISSN position stands), committed directly to the repo.
> - `auto_*.txt`: auto-harvested by `scripts/fetch_sources.py` per the manifest (HTML→trafilatura, PDF→pypdf) with a provenance header.
> To add knowledge: add a `fetch: true` authoritative source to `sources.yaml` and run `fetch_sources.py`, or drop a `kb_*.txt` straight into `data/`. Only include CC-BY / public-domain / official guidelines — avoid copyrighted content.

### 6.4 Switching the vector backend

- **Chroma (default)**: zero config, data lands in `./chroma`.
- **Supabase pgvector**: first run `supabase/migrations/20260415120000_rag_kb_chunks.sql`, set `VECTOR_BACKEND=supabase` + `SUPABASE_*`, then `ingest_seed_kb.py --force`. If the dimension isn't 768, edit `vector(768)` in the migration (or adjust `EMBEDDING_DIM`).

### 6.5 Testing and evaluation

```bash
pip install ruff
ruff check .
pytest                       # tests/: health / chat / retrieve / dual_mode
python eval/evaluate.py      # requires the service running on :8000; LLM-as-Judge evaluation
```

---

## 7. Frontend `web/`

### 7.1 App shape

The home route `/` is a single-page app that switches between 5 modules via tab state (`components/layout/nav-items.ts`): Today / Nutrition / Training history / My plans / Knowledge base (in progress). File-based routes are only `/`, `/onboarding`, `/sign-in/*`, `/sign-up/*`.

### 7.2 Business data: Server Actions

`app/actions/*.ts` are `'use server'` modules that read/write Supabase directly:

- `dashboard.ts` today's stats / weekly trend / water
- `logFood.ts` `saveDietLog.ts` `updateDietLog.ts` `parseFoodFromPhoto.ts` nutrition
- `logWorkout.ts` training; `quickLog.ts` natural-language quick logging
- `plans.ts` `exercises.ts` plans and the exercise library
- `onboarding.ts` onboarding; `chat.ts` read / clear chat history

### 7.3 AI layer

- `lib/ai/agent.ts`: tool-calling Agent; tools include `set_retrieval_params`, `query_knowledge_base` (calls `/v1/retrieve`), `get_user_stats`.
- `lib/ai/rag-client.ts`: wraps `fetch` to the backend RAG service.
- `lib/ai/user-context.ts`: assembles personalized user context.
- `app/api/ai/chat/route.ts`: SSE route that runs the Agent and writes the conversation back to Supabase.
- On the browser side, `components/ai-chat/hooks/use-chat-stream.ts` consumes the SSE.

### 7.4 Auth / gating

`proxy.ts` (Next 16 uses `proxy.ts` instead of `middleware.ts`): uses `@supabase/ssr` to refresh the session cookie on every request; allows `/sign-in`, `/sign-up`, `/auth/*`, `/api/*`; unauthenticated access to any other route redirects to `/sign-in`; logged-in users without `user_settings` go to `/onboarding`; onboarded users who hit `/onboarding` are sent back to `/`. Auth is Supabase Auth (Google OAuth + email/password); session state comes from `lib/supabase/server.ts` / `client.ts`, and identity resolution still goes through `lib/auth/require-user.ts`.

### 7.5 UI component conventions

`components/ui/` keeps only the shadcn base components actually in use. Add new ones on demand via the shadcn CLI:

```bash
npx shadcn@latest add <component>
```

---

## 8. Common dev commands

### Frontend (in `web/`)

| Command | Purpose |
|------|------|
| `npm run dev` | Local dev server |
| `npm run build` / `npm start` | Production build / run |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm run typecheck` | `tsc --noEmit` type check |

> Supabase types can be generated with the `supabase` CLI in devDependencies, e.g.:
> `npx supabase gen types typescript --project-id <id> > lib/database.types.ts`

### Backend (in `rag/`, venv activated)

| Command | Purpose |
|------|------|
| `uvicorn backend_api:app --reload --port 8000` | Start the service |
| `pytest` | Unit tests |
| `ruff check .` | Lint |
| `python scripts/ingest_seed_kb.py [--force]` | Ingest the knowledge base |
| `python scripts/print_embedding_dim.py` | Print the vector dimension |

---

## 9. Deployment

The frontend and backend deploy independently.

### Frontend → Vercel
- Set **Root Directory** to `web`
- For environment variables see `web/.env.local.example`
- Point `RAG_SERVICE_URL` at the production backend URL

### Backend → Render
- The repo-root `render.yaml` already sets `rootDir: rag` + Docker; connect the repo via the **Blueprint** flow
- Secrets marked `sync: false` (`GOOGLE_AI_STUDIO_API_KEY`, `SUPABASE_*`, `UPSTASH_*`, `ALLOWED_ORIGINS`) are entered manually in the Render Dashboard
- Free instances are memory-limited; keep `RERANKER_ENABLED=false` and `VECTOR_BACKEND=supabase`

> If you already have Vercel / Render projects, there's no need to recreate them: just update "connected repo + Root Directory" and keep the env vars. Render's free tier has cold starts (the first request after idle takes tens of seconds to wake).

---

## 10. Troubleshooting

| Symptom | Where to look |
|------|----------|
| Frontend AI chat times out | Is the backend on `:8000`? Is `RAG_SERVICE_URL` correct? Raise `RAG_CLIENT_TIMEOUT_MS` for cold starts |
| Backend startup reports missing reranker deps | Normal graceful-degradation notice; for local reranking `pip install torch sentence-transformers`, keep `RERANKER_ENABLED=false` in the cloud |
| Ingestion keeps "skipping" | After switching the vector backend, use `ingest_seed_kb.py --force` |
| Supabase retrieval is empty | Did you run the migration? Does the dimension match (`print_embedding_dim.py`)? Did you ingest? |
| Ingestion DNS/network failures | Configure `HTTPS_PROXY`/`HTTP_PROXY`, then re-run `python scripts/ingest_seed_kb.py --force` |
| Stuck redirecting to onboarding after login | Does the user have a `user_settings` record in Supabase? |
| Meal photo recognition fails | Is `GOOGLE_AI_STUDIO_API_KEY` configured? |
