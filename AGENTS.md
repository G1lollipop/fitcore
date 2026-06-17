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

### 依赖与镜像

- VM 启动时由 `.cursor/environment.json` 的 `install` 刷新依赖；基础镜像见 `.cursor/Dockerfile`（Node 20 + `python3-venv`）。
- 后端一律用 `rag/.venv/bin/...`，不要依赖全局 Python。
- `ruff` 不在 `requirements-dev.txt` 里；需要 lint 时：`rag/.venv/bin/pip install ruff && rag/.venv/bin/ruff check .`

### 环境变量（Secrets → 本地文件）

Secrets 由 Cursor Dashboard 注入进程环境，**不会**自动写入 `.env` / `.env.local`。启动服务前需从 example 复制并填入：

```bash
cp rag/.env.example rag/.env
cp web/.env.local.example web/.env.local
# 将 Dashboard Secrets 写入对应变量（至少 Clerk、Supabase、DASHSCOPE、OPENAI/DashScope key）
```

| 用途 | 文件 | 必填变量 |
|------|------|----------|
| RAG 服务 | `rag/.env` | `DASHSCOPE_API_KEY`；云端建议 `RERANKER_ENABLED=false` |
| Next.js | `web/.env.local` | Clerk 两把 key、Supabase URL + `SUPABASE_SERVICE_ROLE_KEY`、`RAG_SERVICE_URL=http://127.0.0.1:8000`、`OPENAI_API_KEY` |

无有效 Clerk key 时 `npm run dev` 能启动但页面会 500（`Publishable key not valid`）。

### 启动顺序

1. **RAG**（`:8000`）：`cd rag && ./.venv/bin/uvicorn backend_api:app --host 0.0.0.0 --port 8000`
2. **（首次）灌库**：`./.venv/bin/python scripts/ingest_seed_kb.py`（需有效 `DASHSCOPE_API_KEY`）
3. **前端**（`:3000`）：`cd web && npm run dev`

健康检查：`curl http://127.0.0.1:8000/v1/health` → `{"status":"healthy"}`

长期运行的 dev server 建议用 tmux session（例如 `rag-dev-server`、`web-dev-server`），避免单发后台进程难以复查日志。

### 验证命令（不改代码）

| 子项目 | 命令 |
|--------|------|
| 后端测试 | `cd rag && ./.venv/bin/python -m pytest` |
| 后端 lint | `cd rag && ./.venv/bin/ruff check .`（有若干既有 style 告警，非阻塞） |
| 前端 lint / 类型 | `cd web && npm run lint && npm run typecheck` |
| 前端构建 | `cd web && npm run build`（不依赖 Clerk 运行时，可离线验证编译） |

### 外部 SaaS（本地不启动）

Clerk、Supabase、DashScope 为托管服务；完整 E2E（登录、dashboard、AI 对话）必须配置上述 Secrets。
