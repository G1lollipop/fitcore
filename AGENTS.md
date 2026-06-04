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

环境变量见 `web/.env.local.example`（Clerk / Supabase / `RAG_SERVICE_URL` / `OPENAI_API_KEY` / Gemini）。

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

环境变量见 `rag/.env.example`（至少需要 `DASHSCOPE_API_KEY`；`VECTOR_BACKEND` 默认 `chroma`，云端用 `supabase` 时需 `SUPABASE_*`）。

## 约定

- 改动前端后跑 `npm run typecheck`；改动后端后跑 `pytest` + `ruff check .`。
- 接口契约文件 `rag/app/schemas/*.py` 标了 LOCKED，改动需前后端同步。
- 不要提交任何 `.env` / `.env.local`（密钥）。

## Cursor Cloud specific instructions

- 云端 VM 通过 `.cursor/environment.json` 的 `install` 命令安装前后端依赖（`web/` npm + `rag/` venv）。
- 后端依赖在 `rag/.venv`，运行后端命令请使用 `rag/.venv/bin/...`。
- 密钥不在仓库内，由 Cursor Dashboard 的 Secrets 注入为环境变量；前后端同名 key 已在 Dashboard 用不同变量名区分。
- 默认基础镜像若 Node / Python 版本不匹配（需 Node 20、Python 3.11），可在 `.cursor/Dockerfile` 中固定版本并在 `environment.json` 用 `build` 引用。
