"""
POST /v1/chat — structured response (answer + citations + retrievalMeta).
POST /api/chat — legacy response ({"response": "..."}).

Both endpoints share one ChatRequest; the legacy adapter just unwraps.
"""

import asyncio

from fastapi import APIRouter, HTTPException

from app.core.settings import get_settings
from app.infra.supabase_client import vector_backend
from app.schemas.chat import (
    ChatRequest,
    LegacyChatResponse,
    StructuredChatResponse,
)
from app.services.rag_service import RagService

router = APIRouter()


def _resolve_query(request: ChatRequest) -> str:
    query = (request.query or request.message or "").strip()
    if not query:
        raise ValueError("query is required")
    return query


def _get_rag_service() -> RagService:
    # Imported lazily so unit tests can replace main.app.state without
    # triggering RagService construction at import time.
    from app.main import get_rag_service
    return get_rag_service()


@router.post("/v1/chat", response_model=StructuredChatResponse)
async def chat_v1(request: ChatRequest):
    settings = get_settings()
    try:
        rag = _get_rag_service()
        query = _resolve_query(request)
        last_exc: Exception | None = None
        result: dict | None = None
        for attempt in range(settings.rag_chat_retries):
            try:
                result = await asyncio.wait_for(
                    asyncio.to_thread(
                        rag.chat,
                        query,
                        request.sessionId,
                        request.userContext,
                        request.topK,
                    ),
                    timeout=settings.rag_chat_timeout_sec,
                )
                break
            except Exception as e:
                last_exc = e
                if attempt >= settings.rag_chat_retries - 1:
                    raise
                await asyncio.sleep(0.6 * (attempt + 1))
        if result is None:
            raise last_exc or RuntimeError("RAG returned no result")
        vb = vector_backend()
        rb = vb if vb in ("supabase", "chroma") else "chroma"
        return StructuredChatResponse(
            answer=result["answer"],
            citations=result.get("citations", []),
            retrievalMeta=result.get("retrieval_meta", {"retrievedCount": 0}),
            retrievalBackend=rb,
        )
    except Exception as e:
        print(f"Error in /v1/chat API: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/chat", response_model=LegacyChatResponse)
async def chat_legacy(request: ChatRequest):
    result = await chat_v1(request)
    return LegacyChatResponse(response=result.answer)
