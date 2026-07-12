# AGENTS.md

Agent guide for the FitCore monorepo. For the full development docs, see [`DEVELOPMENT.md`](./DEVELOPMENT.md).

## Product positioning & principles (read first)

FitCore is a **mobile-first, AI-logging-first fitness app**. Every product/UX/architecture decision should serve this north star. When a change conflicts with the principles below, prefer the principle (or flag the tension) instead of silently diverging.

### 1. Primary: AI-powered logging replaces manual entry (the protagonist)

The product's core job is to make tracking food/workouts/water effortless by **letting AI turn a photo or a single natural-language sentence into structured logs** — manual, field-by-field entry is the fallback, never the default.

- The fastest path from "I want to log this" to "it's logged" must always win. Target: a meal/workout captured in **a few seconds, without leaving the home screen**.
- Logging entry points are first-class and prominent: the home Quick Log bar (`components/dashboard/home-log-bar.tsx`), one-sentence quick log (`actions/quickLog.ts`), meal photo (`actions/parseFoodFromPhoto.ts`), and in-chat `log_*` tools.
- AI parsing should be optimistic and forgiving: show instant feedback, patch the dashboard cache immediately (`lib/queries/dashboard.ts`), let users correct results afterwards rather than blocking on a perfect parse.
- When adding features, ask "does this reduce logging friction?" first. Don't bury logging behind menus, modals, or extra taps.

### 2. Secondary: the AI coach (RAG-grounded Q&A + plan/diet authoring)

The AI coach is the **supporting** surface, not the protagonist. It does two things:

- **Evidence-grounded Q&A**: complex fitness questions retrieve relevant chunks from the RAG knowledge base (`web/lib/ai/rag-client.ts` → `rag/` `/v1/retrieve`); answers cite sources. There is intentionally **no standalone Knowledge tab** — that capability is folded into the coach (its seed prompts live in `components/knowledge/starters.ts`).
- **Plan authoring & editing**: the coach can generate and modify **training plans and diet/nutrition plans** in conversation (`actions/generatePlan.ts`, `adjust_plan` tool). Keep this conversational and forgiving.
- Keep the coach discoverable but secondary: it lives in the floating widget + the home "AI Coach" bar (ask/plan focused), and must never crowd out the logging surfaces.

### 3. Mobile-first UX: single-screen pages, expand for detail

This is a phone app. **Every main page must fit entirely inside one phone viewport without vertical scrolling.** Detailed or secondary content lives behind taps, not in the initial scroll.

- **Keep pages short.** The home tab in particular should read as a single screen — avoid layouts that force the user to scroll down to reach important content. Put primary actions in the thumb zone.
- Prefer compact, glanceable cards over long stacked lists. Desktop-only secondary content (e.g. weekly trend) is gated with `hidden md:block`; don't add long content to the mobile flow.
- **Card content rule:** a card on a main page shows only the highest-priority summary. If a card naturally contains a long list (e.g. a training day's exercises, a meal timeline, a chart), the card itself can be **internally scrollable** (`max-h-* overflow-y-auto`), or — preferably — the card is tappable and opens a **full-screen sheet/detail** with the full content. Don't push long card bodies into the main page scroll.
- **Navigation stays compact:** keep the bottom tab bar to the essential tabs (Today / Record). Don't add routes/tabs casually — new capability usually belongs inside an existing tab, a card, the coach, or a full-screen detail sheet, not a new top-level destination.
- Before adding a new section/card to a screen, check it won't push the screen past one viewport on mobile; if it would, make it collapsible, scrollable inside the card, desktop-only, or move it into a detail sheet.

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

- **The home page is a single route + client-side view switching**: `web/app/page.tsx` is a server component (server-side auth + fetching dashboard data); the interactive shell is `web/components/dashboard/dashboard-client.tsx`. The two "pages" are switched via `activeNav` state under the same route (`components/layout/nav-items.ts`), they are **not** separate routes. Nav `id`s are `dashboard`/`nutrition` but the user-facing tabs are **Today / Record**: `dashboard`→Today (`dashboard-client`), `nutrition`→Record (`components/history/history-center.tsx`, combined diet + training per day, with 7-day trend charts). Today's workout is surfaced on Today via `components/dashboard/today-plan-card.tsx`; the plan detail sheet (`components/plans/plan-detail-sheet.tsx`) is opened from the home plan card. The old standalone Knowledge tab was retired and its evidence Q&A folded into the AI coach (only `components/knowledge/starters.ts` survives, feeding coach starter prompts).
- **The middleware file is `web/proxy.ts`, not `middleware.ts`**: Supabase session refresh + route protection + onboarding redirects live here. Identity resolution goes through `lib/auth/require-user.ts` (`requireUserId()` returns the Supabase user id); the cookie client used for auth is in `lib/supabase/{server,client}.ts`, kept separate from the service-role client `lib/supabaseClient.ts` used for data access.
- **All data access goes through server actions**: `web/app/actions/*`. Frontend components never connect to Supabase directly; `web/lib/supabaseClient.ts` is `server-only` + service-role and importing it into a client component will break the build. Auth resolution uses `authedUserId()` / `getUserIdOrNull()` from `web/lib/auth/require-user.ts`; actions read `userId` internally and callers don't pass it.
- **AI chat path**: browser → `web/app/api/ai/chat/route.ts` (SSE) → (personal data `lib/ai/user-context.ts` + RAG `lib/ai/rag-client.ts`) → `rag/` service.
- **Nutrition parsing path**: food logging (`quickLog.ts`, `logFood.ts`) → `lib/ai/nutrition-client.ts` (fetch + 60s timeout) → Modal endpoint (fine-tuned Qwen2.5-3B). A warmup ping fires on dashboard load via `actions/nutritionWarmup.ts` (throttled via localStorage, max 1 per 10 min) to absorb Modal cold-start latency.
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
