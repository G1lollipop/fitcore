# FitCore

AI 驱动的健身教练应用。前后端合并为一个 monorepo 管理：

```
Fitcore/
├── web/   # 前端：Next.js 16 (App Router) + React 19 + Clerk + Supabase
└── rag/   # 后端：FastAPI + LangChain RAG 检索服务（DashScope/Qwen）
```

## 整体架构

```
浏览器
  ├── Server Actions ─────────────► Supabase（日志 / 计划 / 统计等业务数据）
  └── fetch /api/ai/chat (SSE) ───► Next 服务端 Agent
                                      ├── DashScope / Qwen + Gemini（LLM / 视觉）
                                      ├── Supabase（用户上下文、聊天记录）
                                      └── RAG 服务 /v1/retrieve ──► FastAPI (rag/)
```

前端通过环境变量 `RAG_SERVICE_URL`（默认 `http://127.0.0.1:8000`）调用后端 RAG 服务。

## 子项目

| 目录 | 说明 | 文档 |
|------|------|------|
| [`web/`](./web) | 前端单页应用，主页 `/` 内含「今日概览 / 饮食中心 / 训练历史 / 我的计划 / 知识库」五个模块 | [`web/README.md`](./web/README.md) |
| [`rag/`](./rag) | RAG 检索服务：向量检索 + BM25 融合，可选重排，自适应 topK | [`rag/前后端分离架构文档.md`](./rag/前后端分离架构文档.md) |

## 本地启动

### 1. 后端 RAG 服务（rag/）

```bash
cd rag
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt   # Windows
# source .venv/bin/activate && pip install -r requirements-dev.txt  # macOS/Linux

cp .env.example .env          # 至少配置 DASHSCOPE_API_KEY
python scripts/ingest_seed_kb.py   # 灌入种子知识库（首次）
uvicorn backend_api:app --host 0.0.0.0 --port 8000
```

### 2. 前端（web/）

```bash
cd web
cp .env.local.example .env.local   # 配置 Clerk / Supabase / RAG_SERVICE_URL 等
npm install
npm run dev
```

打开 http://localhost:3000 即可访问。

## 技术栈

- **前端**：Next.js 16、React 19、TypeScript、Tailwind CSS 4、shadcn/ui、Clerk、Supabase
- **后端**：Python 3.11、FastAPI、LangChain 1.x、DashScope（Qwen + text-embedding-v4）、Chroma / Supabase pgvector
