# AGENTS.md

Agent guide for the FitCore monorepo. For the full development docs, see [`DEVELOPMENT.md`](./DEVELOPMENT.md).

## Repo structure

- `web/` — Frontend: Next.js 16 (App Router) + React 19 + TypeScript (package manager: npm)
- `rag/` — Backend: Python 3.11 + FastAPI + LangChain RAG service

The two subprojects are independent; commands must be run inside the corresponding subdirectory.

## Frontend `web/`

```bash
cd web
npm install # install dependencies
npm run dev # local dev (http://localhost:3000)
npm run build # production build
npm run lint # ESLint
npm run typecheck # tsc --noEmit (always run after changing TS)
npm run format # Prettier
```

See `web/.env.local.example` for environment variables (Supabase / `RAG_SERVICE_URL` / `GOOGLE_AI_STUDIO_API_KEY`; a single Gemini key covers all AI). Auth uses Supabase Auth (Google OAuth + email/password).

## Backend `rag/`

Dependencies are installed in the `rag/.venv` virtualenv; use that environment's interpreter, or activate it first:

```bash
cd rag
# Use the venv interpreter directly:
./.venv/bin/python -m pytest # run tests
./.venv/bin/ruff check . # lint
./.venv/bin/uvicorn backend_api:app --host 0.0.0.0 --port 8000 # start the service
./.venv/bin/python scripts/ingest_seed_kb.py # ingest the seed knowledge base
```

See `rag/.env.example` for environment variables (at minimum `GOOGLE_AI_STUDIO_API_KEY`; `VECTOR_BACKEND` defaults to `chroma`, and the cloud setup using `supabase` requires `SUPABASE_*`).

## Code map (must-read for newcomers / agents)

A few "counterintuitive" spots that trip people up on first read:

- **The home page is a single route + client-side view switching**: `web/app/page.tsx` is a server component (server-side auth + fetching dashboard data); the interactive shell is `web/components/dashboard/dashboard-client.tsx`. The five "pages" — dashboard / nutrition / training / plans / knowledge — are switched via `activeNav` state under the same route, they are **not** separate routes like `/nutrition` or `/training`. Don't go looking for `app/nutrition/page.tsx`; it doesn't exist.
- **The middleware file is `web/proxy.ts`, not `middleware.ts`**: Supabase session refresh + route protection + onboarding redirects live here. Identity resolution goes through `lib/auth/require-user.ts` (`requireUserId()` returns the Supabase user id); the cookie client used for auth is in `lib/supabase/{server,client}.ts`, kept separate from the service-role client `lib/supabaseClient.ts` used for data access.
- **All data access goes through server actions**: `web/app/actions/*`. Frontend components never connect to Supabase directly; `web/lib/supabaseClient.ts` is `server-only` + service-role and importing it into a client component will break the build. Auth resolution uses `authedUserId()` / `getUserIdOrNull()` from `web/lib/auth/require-user.ts`; actions read `userId` internally and callers don't pass it.
- **AI chat path**: browser → `web/app/api/ai/chat/route.ts` (SSE) → (personal data `lib/ai/user-context.ts` + RAG `lib/ai/rag-client.ts`) → `rag/` service.
- **"Today's workout" single source of truth**: `web/lib/plans/today-workout.ts` is a pure function; several actions fetch data and then call it — don't reimplement it elsewhere.

## Conventions

- After changing the frontend, run `npm run typecheck`; after changing the backend, run `pytest` + `ruff check .`.
- The API contract files `rag/app/schemas/*.py` are marked LOCKED; changes require front/back coordination.
- Never commit any `.env` / `.env.local` (secrets).

## Cursor Cloud specific instructions

### Dependencies and image

- On VM startup, dependencies are refreshed by the `install` step in `.cursor/environment.json`; the base image is in `.cursor/Dockerfile` (Node 20 + `python3-venv`).
- Always use `rag/.venv/bin/...` for the backend; don't rely on the global Python.
- `ruff` is not in `requirements-dev.txt`; when you need to lint: `rag/.venv/bin/pip install ruff && rag/.venv/bin/ruff check .`

### Environment variables (Secrets → local files)

Secrets are injected into the process environment by the Cursor Dashboard; they are **not** automatically written to `.env` / `.env.local`. Before starting services, copy from the examples and fill in the values:

```bash
cp rag/.env.example rag/.env
cp web/.env.local.example web/.env.local
# Write the Dashboard secrets into the corresponding variables (at least Supabase and the Gemini/OpenAI-compatible key)
```

| Purpose | File | Required variables |
|------|------|----------|
| RAG service | `rag/.env` | `GOOGLE_AI_STUDIO_API_KEY` (also accepts `GEMINI_API_KEY` / legacy `DASHSCOPE_API_KEY`); for cloud, `RERANKER_ENABLED=false` is recommended |
| Next.js | `web/.env.local` | Supabase URL + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`, `RAG_SERVICE_URL=http://127.0.0.1:8000`, `GOOGLE_AI_STUDIO_API_KEY` (`OPENAI_API_KEY` is optional, only when pointing at another compatible provider) |

Without a valid Supabase key, `npm run dev` will still start, but visiting a protected page redirects to `/sign-in` because no session can be established. Google login requires configuring the provider and callback URLs (including `<domain>/auth/callback`) in the Supabase Dashboard.

### Startup order

1. **RAG** (`:8000`): `cd rag && ./.venv/bin/uvicorn backend_api:app --host 0.0.0.0 --port 8000`
2. **(First run) ingest**: `./.venv/bin/python scripts/ingest_seed_kb.py` (needs a valid `GOOGLE_AI_STUDIO_API_KEY` for Gemini embeddings)
3. **Frontend** (`:3000`): `cd web && npm run dev`

Health check: `curl http://127.0.0.1:8000/v1/health` → `{"status":"healthy"}`

For long-running dev servers, prefer a tmux session (e.g. `rag-dev-server`, `web-dev-server`) so logs stay easy to inspect rather than launching one-off background processes.

### Verification commands (no code changes)

| Subproject | Command |
|--------|------|
| Backend tests | `cd rag && ./.venv/bin/python -m pytest` |
| Backend lint | `cd rag && ./.venv/bin/ruff check .` (a few pre-existing style warnings, non-blocking) |
| Frontend lint / types | `cd web && npm run lint && npm run typecheck` |
| Frontend build | `cd web && npm run build` (doesn't depend on auth at runtime; can verify compilation offline) |

### External SaaS (not started locally)

Supabase and DashScope are managed services; full E2E (login, dashboard, AI chat) requires the secrets above.
