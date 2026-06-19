"""
FastAPI application entry point.

Layout:
  - app.api.*       HTTP routes (chat, retrieve, health)
  - app.schemas.*   Pydantic request/response models (LOCKED contract)
  - app.services.*  RAG orchestration, retrieval, ingestion
  - app.prompts.*   Chat prompt templates
  - app.infra.*     Cache, Supabase client, embeddings
  - app.ingest.*    MD5 dedupe, Supabase write paths
  - app.core.*      Static knobs / settings (Phase C will add pydantic-settings)
"""

import asyncio
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env from the Rag root regardless of CWD (matches legacy behavior).
# Settings reads from os.environ, so this must happen BEFORE Settings is built.
_RAG_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(_RAG_ROOT))
load_dotenv(_RAG_ROOT / ".env")

from app.core.settings import get_settings


# ── Singleton: built once, shared across requests ─────────────────────────
_rag_service = None
_rag_service_lock = threading.Lock()


def get_rag_service():
    """Thread-safe lazy singleton (double-checked locking)."""
    global _rag_service
    if _rag_service is not None:
        return _rag_service
    with _rag_service_lock:
        if _rag_service is None:
            from app.services.rag_service import RagService

            _rag_service = RagService()
    return _rag_service


def reset_rag_service() -> None:
    """Test hook — drops the cached service so the next call rebuilds it."""
    global _rag_service
    with _rag_service_lock:
        _rag_service = None


# ── Lifespan: warm everything before the first request ────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[startup] Building RagService (vector store + BM25 ensemble)...")
    rag = await asyncio.to_thread(get_rag_service)
    print("[startup] Warming compression retriever (reranker, if enabled)...")
    await asyncio.to_thread(rag.warmup)
    print("[startup] Warmup complete.")
    yield


def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan)

    settings = get_settings()
    cors_origins = settings.allowed_origins or ["*"]
    # Browsers reject `Access-Control-Allow-Origin: *` together with
    # credentials, and a wildcard + credentials is unsafe anyway. Only allow
    # credentials when origins are explicitly listed.
    allow_credentials = cors_origins != ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from app.api.chat import router as chat_router
    from app.api.retrieve import router as retrieve_router
    from app.api.health import router as health_router

    app.include_router(chat_router)
    app.include_router(retrieve_router)
    app.include_router(health_router)

    return app


app = create_app()
