# FitCore 开发文档

面向开发者的完整指南，覆盖架构、本地启动、环境变量、接口契约、目录结构、常用命令、部署与排错。
产品概览见 [`README.md`](./README.md)。

---

## 目录

- [1. 架构总览](#1-架构总览)
- [2. 仓库结构](#2-仓库结构)
- [3. 环境要求](#3-环境要求)
- [4. 本地启动](#4-本地启动)
- [5. 环境变量](#5-环境变量)
- [6. 后端 `rag/`](#6-后端-rag)
- [7. 前端 `web/`](#7-前端-web)
- [8. 常用开发命令](#8-常用开发命令)
- [9. 部署](#9-部署)
- [10. 排错](#10-排错)

---

## 1. 架构总览

FitCore 是 AI 驱动的健身教练应用，前后端分离、合并在一个 monorepo 中。

```
浏览器
  ├── Server Actions ─────────────► Supabase（日志 / 计划 / 统计等业务数据 CRUD）
  └── fetch /api/ai/chat (SSE) ───► Next 服务端 Agent (web/lib/ai/agent.ts)
                                      ├── Google Gemini（对话 + 工具调用）
                                      ├── Gemini（拍照识别饭菜的视觉工具）
                                      ├── Supabase（用户上下文、聊天记录）
                                      └── RAG 服务 POST /v1/retrieve ──► FastAPI (rag/)
                                                                          ├── 向量检索 + BM25 融合
                                                                          ├── 可选 CrossEncoder 重排
                                                                          └── Gemini 生成（/v1/chat 路径）
```

要点：

- **业务数据**走 Next.js Server Actions 直连 Supabase，不经过自建 REST。
- **AI 对话**走 `POST /api/ai/chat`（SSE 流式）。服务端 Agent 用工具调用（tool calling）决定是否检索知识库、是否读取用户数据。
- **知识检索**由独立的 FastAPI 服务（`rag/`）提供，前端通过 `RAG_SERVICE_URL` 调用其 `/v1/retrieve`。

---

## 2. 仓库结构

```
Fitcore/
├── web/                      # 前端：Next.js 16 (App Router)
│   ├── app/
│   │   ├── page.tsx          # 主应用（tab 切换 5 个模块）
│   │   ├── layout.tsx        # 根布局（字体 / 主题 / Clerk / analytics）
│   │   ├── onboarding/       # 首次引导
│   │   ├── sign-in/ sign-up/ # Clerk 鉴权页
│   │   ├── api/ai/chat/      # SSE 流式 AI 接口
│   │   └── actions/          # 'use server' 业务动作（dashboard/log/plans/chat...）
│   ├── components/
│   │   ├── ui/               # shadcn/ui 基础组件（仅保留在用的）
│   │   ├── layout|dashboard|nutrition|training|plans|log-form|ai-chat/
│   ├── lib/
│   │   ├── ai/               # agent / rag-client / user-context / model / prompts / types
│   │   ├── supabaseClient.ts openaiClient.ts database.types.ts
│   │   └── plans|training|metrics|utils
│   ├── hooks/                # toast / quick-log / sidebar
│   ├── proxy.ts              # Clerk 中间件 + onboarding 门禁（Next 16 用 proxy.ts）
│   └── .env.local.example
│
├── rag/                      # 后端：FastAPI + LangChain RAG 服务
│   ├── app/
│   │   ├── main.py           # 应用工厂 + lifespan 预热
│   │   ├── api/              # chat / retrieve / health 路由
│   │   ├── schemas/          # Pydantic 接口契约（LOCKED）
│   │   ├── services/         # RagService、kb_service、retrieval/*、history_store
│   │   ├── prompts/          # RAG 对话提示词
│   │   ├── infra/            # embeddings / cache / supabase_client
│   │   ├── ingest/           # MD5 去重 / Supabase 写入
│   │   └── core/             # settings.py / constants.py
│   ├── parsers/              # TXT/PDF/DOCX/MD/HTML 解析
│   ├── data/                 # 种子知识库 fitcore_kb_*.txt
│   ├── scripts/              # ingest_seed_kb / print_embedding_dim / download_reranker
│   ├── eval/                 # LLM-as-Judge 评估
│   ├── supabase/migrations/  # pgvector 表 + RPC
│   ├── tests/                # pytest
│   ├── backend_api.py        # Docker 入口 shim：re-export app.main:app
│   └── Dockerfile
│
├── render.yaml               # Render Blueprint（rootDir: rag）
├── README.md                 # 产品概览
└── DEVELOPMENT.md            # 本文件
```

---

## 3. 环境要求

| 工具 | 版本 |
|------|------|
| Node.js | 20+（建议 LTS） |
| npm | 随 Node 附带 |
| Python | 3.11 |
| Git | 任意近期版本 |

外部服务账号（按需）：

- **Clerk**（鉴权）
- **Supabase**（业务数据库；若后端用 pgvector 也复用）
- **Google AI Studio (Gemini)**（对话 + 结构化解析 + 视觉 + `gemini-embedding-001` 向量，一个 key 覆盖全部）
- **Upstash Redis**（可选，后端检索缓存）

---

## 4. 本地启动

> 建议先起后端（`:8000`），再起前端（`:3000`）。

### 4.1 后端 `rag/`

```bash
cd rag
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
# source .venv/bin/activate

pip install -r requirements-dev.txt   # = 生产依赖 + pytest（不含重排序）
# 可选：本地启用 CrossEncoder 重排序
# pip install torch sentence-transformers

cp .env.example .env                   # 至少填 GOOGLE_AI_STUDIO_API_KEY
python scripts/print_embedding_dim.py  # 确认向量维度（默认 768）
python scripts/ingest_seed_kb.py       # 灌入 data/fitcore_kb_*.txt 种子知识库

uvicorn backend_api:app --host 0.0.0.0 --port 8000 --reload
```

健康检查：`curl http://127.0.0.1:8000/v1/health`

### 4.2 前端 `web/`

```bash
cd web
cp .env.local.example .env.local       # 填 Clerk / Supabase / RAG_SERVICE_URL
npm install
npm run dev
```

打开 http://localhost:3000 。首次登录后若无 `user_settings` 记录会被引导到 `/onboarding`。

---

## 5. 环境变量

### 5.1 前端（`web/.env.local`）

| 变量 | 必填 | 说明 |
|------|------|------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | Clerk 公钥 |
| `CLERK_SECRET_KEY` | ✅ | Clerk 私钥 |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 项目地址 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `RAG_SERVICE_URL` | ✅ | 后端 RAG 服务地址（本地默认 `http://127.0.0.1:8000`） |
| `RAG_CLIENT_TIMEOUT_MS` | | RAG 调用超时（默认 120000，冷启动时调大） |
| `GOOGLE_AI_STUDIO_API_KEY` | ✅ | Gemini key，覆盖对话/解析/视觉全部 AI 功能 |
| `AI_CHAT_MODEL` / `AI_FAST_MODEL` | | 模型名（默认 `gemini-2.5-flash`） |
| `GEMINI_VISION_MODEL` | | 拍照识别饭菜的视觉模型（默认 `gemini-2.5-flash`） |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | | 可选：指向其他 OpenAI 兼容供应商时覆盖 Gemini 默认 |
| `GEMINI_VISION_MODEL` | | 默认 `gemini-2.5-flash` |
| `AI_CHAT_DEBUG_META` / `RAG_VECTOR_BACKEND` | | 调试用，响应 meta 附带检索后端信息 |

### 5.2 后端（`rag/.env`）

| 变量 | 必填 | 说明 |
|------|------|------|
| `GOOGLE_AI_STUDIO_API_KEY` | ✅ | Gemini key（chat + embedding 共用；也接受 `GEMINI_API_KEY` / `DASHSCOPE_API_KEY`） |
| `RAG_CHAT_MODEL` | | 默认 `gemini-2.5-flash` |
| `EMBEDDING_MODEL` / `EMBEDDING_DIM` | | embedding 模型与维度（默认 `models/gemini-embedding-001` / `768`，须与 migration 一致） |
| `LLM_BASE_URL` | | OpenAI 兼容 chat 端点（默认 Gemini） |
| `VECTOR_BACKEND` | ✅ | `chroma`（本地默认）或 `supabase`（pgvector） |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | △ | 仅 `VECTOR_BACKEND=supabase` 时必填 |
| `RERANKER_ENABLED` | | `true` 启用重排序（需 torch）；云端必须 `false` |
| `RERANKER_MODEL_NAME` / `_PATH` / `_KWARGS` | | 重排序模型配置 |
| `CACHE_BACKEND` | | `memory`（默认）或 `redis` |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | △ | `CACHE_BACKEND=redis` 时必填 |
| `ALLOWED_ORIGINS` | | 允许跨域的前端来源 |
| `EVAL_JUDGE_MODEL` | | 评估用 LLM-as-Judge 模型 |

> 所有 `.env` / `.env.local` 已被 gitignore，切勿提交密钥。`SUPABASE_SERVICE_ROLE_KEY` 是高权限密钥，仅在后端使用。

---

## 6. 后端 `rag/`

### 6.1 HTTP 接口

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/v1/health`, `/api/health` | 健康检查 |
| `POST` | `/v1/retrieve` | **仅检索**（给前端 Agent 的工具用），返回 `chunks` |
| `POST` | `/v1/chat` | 完整 RAG：检索 → LLM 生成，返回答案 + 引用 + meta |
| `POST` | `/api/chat` | 旧版精简包装，仅返回 `{ "response": answer }` |

`/v1/retrieve` 契约（`app/schemas/retrieve.py`，**LOCKED**，改动需前后端同步）：

```jsonc
// 请求
{ "query": "如何增肌", "sessionId": "anonymous", "userContext": {}, "topK": 5 }
// 响应
{ "chunks": [ { "id": "...", "title": "...", "source": "...", "snippet": "...", "score": 0.83 } ] }
```

### 6.2 RAG 流水线

```
查询 → 检索器
        ├── 向量检索 (k=10)        Chroma 相似度 或 Supabase RPC match_rag_kb_chunks
        └── BM25 (k=10)            内存全量语料
        → EnsembleRetriever 融合 (0.5 / 0.5)
        → [可选] CrossEncoder 重排 (RERANKER_ENABLED=true)
        → 自适应 topK ∈ {3,5,8}（compute_retrieval_k，调用方可强制 1–20）
        → 拼接 [资料N] 上下文 + 引用
        → Gemini 生成（注入 userContext 个性化 + 文件型会话历史）
```

关键文件：`app/services/rag_service.py`（编排）、`app/services/retrieval/*`（检索后端）、`app/infra/embeddings.py`、`app/prompts/rag_chat.py`。

### 6.3 灌库（ingestion）

1. 解析：`parsers/`（TXT/PDF/DOCX/MD/HTML）
2. 去重：MD5（`app/ingest/md5_store.py` → `./md5.text`）
3. 切分：`RecursiveCharacterTextSplitter`（chunk 1000 / overlap 100，见 `app/core/constants.py`）
4. 向量化：`gemini-embedding-001`（默认 768 维，可调 `EMBEDDING_DIM`）
5. 写入：Chroma（`./chroma`）或 Supabase（`rag_kb_chunks`）

```bash
python scripts/ingest_seed_kb.py            # 灌入 data/fitcore_kb_*.txt
python scripts/ingest_seed_kb.py --force    # 切换向量后端 / 重灌时强制覆盖
```

> 想新增知识：把文件放到 `data/` 并命名为 `fitcore_kb_*.txt`（当前灌库脚本只匹配该前缀），或扩展脚本的匹配规则。

### 6.4 向量后端切换

- **Chroma（默认）**：零配置，数据落在 `./chroma`。
- **Supabase pgvector**：先执行 `supabase/migrations/20260415120000_rag_kb_chunks.sql`，设 `VECTOR_BACKEND=supabase` + `SUPABASE_*`，再 `ingest_seed_kb.py --force`。若维度不是 768，改 migration 里的 `vector(768)`（或调 `EMBEDDING_DIM`）。

### 6.5 测试与评估

```bash
pip install ruff
ruff check .
pytest                       # tests/：health / chat / retrieve / dual_mode
python eval/evaluate.py      # 需要服务已在 :8000 运行；LLM-as-Judge 评估
```

---

## 7. 前端 `web/`

### 7.1 应用形态

主页 `/` 是单页应用，通过 tab 状态（`components/layout/nav-items.ts`）切换 5 个模块：今日概览 / 饮食中心 / 训练历史 / 我的计划 / 知识库（开发中）。文件路由只有 `/`、`/onboarding`、`/sign-in/*`、`/sign-up/*`。

### 7.2 业务数据：Server Actions

`app/actions/*.ts` 是 `'use server'` 模块，直接读写 Supabase：

- `dashboard.ts` 今日统计 / 周趋势 / 喝水
- `logFood.ts` `saveDietLog.ts` `updateDietLog.ts` `parseFoodFromPhoto.ts` 饮食
- `logWorkout.ts` 训练；`quickLog.ts` 自然语言快速记录
- `plans.ts` `exercises.ts` 计划与动作库
- `onboarding.ts` 引导；`chat.ts` 聊天历史读取 / 清除

### 7.3 AI 层

- `lib/ai/agent.ts`：tool-calling Agent，工具含 `set_retrieval_params`、`query_knowledge_base`（调 `/v1/retrieve`）、`get_user_stats`。
- `lib/ai/rag-client.ts`：封装对后端 RAG 服务的 `fetch`。
- `lib/ai/user-context.ts`：组装个性化用户上下文。
- `app/api/ai/chat/route.ts`：SSE 路由，跑 Agent 并把对话写回 Supabase。
- 浏览器侧由 `components/ai-chat/hooks/use-chat-stream.ts` 消费 SSE。

### 7.4 鉴权 / 门禁

`proxy.ts`（Next 16 用 `proxy.ts` 取代 `middleware.ts`）：放行 `/sign-in`、`/sign-up`、`/api/*`；已登录但无 `user_settings` 的用户跳 `/onboarding`；已完成引导的用户访问 `/onboarding` 跳回 `/`。

### 7.5 UI 组件约定

`components/ui/` 只保留实际在用的 shadcn 基础组件。需要新组件时用 shadcn CLI 按需添加：

```bash
npx shadcn@latest add <component>
```

---

## 8. 常用开发命令

### 前端（在 `web/`）

| 命令 | 作用 |
|------|------|
| `npm run dev` | 本地开发服务器 |
| `npm run build` / `npm start` | 生产构建 / 运行 |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm run typecheck` | `tsc --noEmit` 类型检查 |

> Supabase 类型可用 devDependency 里的 `supabase` CLI 生成，例如：
> `npx supabase gen types typescript --project-id <id> > lib/database.types.ts`

### 后端（在 `rag/`，已激活 venv）

| 命令 | 作用 |
|------|------|
| `uvicorn backend_api:app --reload --port 8000` | 启动服务 |
| `pytest` | 单元测试 |
| `ruff check .` | Lint |
| `python scripts/ingest_seed_kb.py [--force]` | 灌库 |
| `python scripts/print_embedding_dim.py` | 打印向量维度 |

---

## 9. 部署

前后端分别部署，互不干扰。

### 前端 → Vercel
- **Root Directory** 设为 `web`
- 环境变量参考 `web/.env.local.example`
- `RAG_SERVICE_URL` 指向线上后端地址

### 后端 → Render
- 仓库根 `render.yaml` 已配 `rootDir: rag` + Docker；用 **Blueprint** 方式连接仓库
- 标 `sync: false` 的密钥（`GOOGLE_AI_STUDIO_API_KEY`、`SUPABASE_*`、`UPSTASH_*`、`ALLOWED_ORIGINS`）在 Render Dashboard 手填
- 免费实例内存受限，`RERANKER_ENABLED` 保持 `false`，`VECTOR_BACKEND=supabase`

> 已有 Vercel / Render 项目时，无需重建：改「连接仓库 + Root Directory」即可，环境变量保留。Render 免费版有冷启动（闲置后首次请求需数十秒唤醒）。

---

## 10. 排错

| 现象 | 排查方向 |
|------|----------|
| 前端 AI 对话报超时 | 后端是否在 `:8000`；`RAG_SERVICE_URL` 是否正确；冷启动时调大 `RAG_CLIENT_TIMEOUT_MS` |
| 后端启动报重排序依赖缺失 | 正常降级提示；本地需重排序请 `pip install torch sentence-transformers`，云端保持 `RERANKER_ENABLED=false` |
| 灌库一直「跳过」 | 切换向量后端后用 `ingest_seed_kb.py --force` |
| Supabase 检索为空 | 是否执行了 migration；维度是否匹配（`print_embedding_dim.py`）；是否已灌库 |
| 灌库 DNS/网络失败 | 配置 `HTTPS_PROXY`/`HTTP_PROXY`，或用 `.github/workflows/rag-supabase-ingest.yml` 在 CI 灌库 |
| 登录后一直跳 onboarding | 该用户在 Supabase 是否有 `user_settings` 记录 |
| 拍照识别饭菜失败 | `GOOGLE_AI_STUDIO_API_KEY` 是否配置 |
