# AGENTS.md

FitCore monorepo 的代理指引。完整开发文档见 [`DEVELOPMENT.md`](./DEVELOPMENT.md)。

## 仓库结构

- `web/` — 前端：Next.js 16 (App Router) + React 19 + TypeScript（包管理器 npm）
- `rag/` — 后端：Python 3.11 + FastAPI + LangChain RAG 服务

两个子项目相互独立，命令必须在对应子目录里执行。

## 前端 `web/`

```bash
cd web
npm install          # 安装依赖
npm run dev          # 本地开发 (http://localhost:3000)
npm run build        # 生产构建
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit（改动 TS 后务必跑一次）
npm run format       # Prettier
```

环境变量见 `web/.env.local.example`（Clerk / Supabase / `RAG_SERVICE_URL` / `GOOGLE_AI_STUDIO_API_KEY`，一个 Gemini key 覆盖全部 AI）。

## 后端 `rag/`

依赖安装在 `rag/.venv` 虚拟环境中，请用该环境的解释器，或先激活：

```bash
cd rag
# 直接用 venv 解释器：
./.venv/bin/python -m pytest          # 运行测试
./.venv/bin/ruff check .              # Lint
./.venv/bin/uvicorn backend_api:app --host 0.0.0.0 --port 8000   # 启动服务
./.venv/bin/python scripts/ingest_seed_kb.py                     # 灌入种子知识库
```

环境变量见 `rag/.env.example`（至少需要 `GOOGLE_AI_STUDIO_API_KEY`；`VECTOR_BACKEND` 默认 `chroma`，云端用 `supabase` 时需 `SUPABASE_*`）。

## 代码地图（新人/agent 必读）

几个容易"反直觉"、第一次读会卡住的点：

- **首页是单路由 + 客户端视图切换**：`web/app/page.tsx` 是 server component（服务端鉴权 + 取 dashboard 数据），交互壳是 `web/components/dashboard/dashboard-client.tsx`。dashboard / nutrition / training / plans / knowledge 五个"页面"是同一路由下用 `activeNav` 状态切换的，**不是** `/nutrition`、`/training` 这样的独立路由——别去找 `app/nutrition/page.tsx`，不存在。
- **中间件文件叫 `web/proxy.ts`，不是 `middleware.ts`**：Clerk 鉴权 + onboarding 跳转在这里。
- **数据访问全走 server actions**：`web/app/actions/*`。前端组件不直连 Supabase；`web/lib/supabaseClient.ts` 是 `server-only` + service-role，导入到客户端会构建失败。鉴权统一用 `web/lib/auth/require-user.ts` 的 `authedUserId()` / `getUserIdOrNull()`，action 内部取 `userId`，调用方不传。
- **AI 对话链路**：浏览器 → `web/app/api/ai/chat/route.ts`（SSE）→（个人数据 `lib/ai/user-context.ts` + RAG `lib/ai/rag-client.ts`）→ `rag/` 服务。
- **"今日训练"唯一逻辑**：`web/lib/plans/today-workout.ts` 纯函数，多处 action 取数后调用它，别再各写一份。

## 约定

- 改动前端后跑 `npm run typecheck`；改动后端后跑 `pytest` + `ruff check .`。
- 接口契约文件 `rag/app/schemas/*.py` 标了 LOCKED，改动需前后端同步。
- 不要提交任何 `.env` / `.env.local`（密钥）。

## Cursor Cloud specific instructions

- 云端 VM 通过 `.cursor/environment.json` 的 `install` 命令安装前后端依赖（`web/` npm + `rag/` venv）。
- 后端依赖在 `rag/.venv`，运行后端命令请使用 `rag/.venv/bin/...`。
- 密钥不在仓库内，由 Cursor Dashboard 的 Secrets 注入为环境变量；前后端同名 key 已在 Dashboard 用不同变量名区分。
- 默认基础镜像若 Node / Python 版本不匹配（需 Node 20、Python 3.11），可在 `.cursor/Dockerfile` 中固定版本并在 `environment.json` 用 `build` 引用。
