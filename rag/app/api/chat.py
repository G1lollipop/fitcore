"""
POST /v1/chat — structured response (answer + citations + retrievalMeta).
POST /api/chat — legacy response ({"response": "..."}).

Both endpoints share one ChatRequest; the legacy adapter just unwraps.
"""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.api.deps import rate_limit, require_api_key
from app.core.settings import get_settings
from app.infra.supabase_client import vector_backend
from app.schemas.chat import (
    ChatRequest,
    LegacyChatResponse,
    StructuredChatResponse,
)
from app.services.rag_service import RagService

logger = logging.getLogger(__name__)
router = APIRouter()


def _sse(event: dict) -> str:
    """Serialize one SSE block (``data: {json}\\n\\n``)."""
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _resolve_backend() -> str:
    vb = vector_backend()
    return vb if vb in ("supabase", "chroma") else "chroma"


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


@router.post(
    "/v1/chat",
    response_model=StructuredChatResponse,
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
)
async def chat_v1(request: ChatRequest):
    settings = get_settings()
    # Validate inputs up-front so client errors map to 422 (not retried as 500).
    try:
        query = _resolve_query(request)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    try:
        rag = _get_rag_service()
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
            except ValueError:
                # Client error (bad input) — don't waste retries / LLM calls.
                raise
            except Exception as e:
                last_exc = e
                if attempt >= settings.rag_chat_retries - 1:
                    raise
                await asyncio.sleep(0.6 * (attempt + 1))
        if result is None:
            raise last_exc or RuntimeError("RAG returned no result")
        return StructuredChatResponse(
            answer=result["answer"],
            citations=result.get("citations", []),
            retrievalMeta=result.get("retrieval_meta", {"retrievedCount": 0}),
            retrievalBackend=_resolve_backend(),
        )
    except ValueError as e:
        # e.g. invalid session id surfaced from the history store.
        raise HTTPException(status_code=422, detail=str(e))
    except HTTPException:
        raise
    except Exception:
        # Log the full trace server-side; return a stable, opaque message so we
        # never leak stack traces / internal details to clients.
        logger.exception("Error in /v1/chat")
        raise HTTPException(status_code=500, detail="internal error")


@router.post("/api/chat", response_model=LegacyChatResponse)
async def chat_legacy(request: ChatRequest):
    result = await chat_v1(request)
    return LegacyChatResponse(response=result.answer)


@router.post(
    "/v1/chat/stream",
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
)
async def chat_stream(request: ChatRequest):
    """
    Server-Sent Events variant of /v1/chat for the Knowledge Exploration Center.

    Emits, in order:
      1. one ``sources`` event   — citations + retrievalMeta + retrievalBackend
                                    (so the UI can render source cards and the
                                    RAG transparency panel before generation),
      2. many ``token`` events   — the answer streamed chunk by chunk,
      3. one ``done`` event.
    On failure a single ``error`` event is emitted instead of raising mid-stream.
    """
    # Validate up-front so bad input is a 422 before the stream opens.
    try:
        query = _resolve_query(request)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    rag = _get_rag_service()

    async def event_gen():
        try:
            # Retrieval + citation assembly run eagerly off the event loop; the
            # returned token_iter is lazy and pulled chunk-by-chunk below.
            citations, retrieval_meta, token_iter = await asyncio.to_thread(
                rag.stream_chat,
                query,
                request.sessionId,
                request.userContext,
                request.topK,
            )
            yield _sse(
                {
                    "type": "sources",
                    "citations": citations,
                    "retrievalMeta": retrieval_meta,
                    "retrievalBackend": _resolve_backend(),
                }
            )

            iterator = iter(token_iter)
            sentinel = object()
            while True:
                # Pull each LangChain stream chunk in a worker thread so the
                # blocking LLM call never stalls the event loop.
                chunk = await asyncio.to_thread(next, iterator, sentinel)
                if chunk is sentinel:
                    break
                if chunk:
                    yield _sse({"type": "token", "content": chunk})

            yield _sse({"type": "done"})
        except Exception:
            logger.exception("Error in /v1/chat/stream")
            yield _sse({"type": "error", "message": "internal error"})

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Disable proxy buffering (e.g. nginx) so tokens flush immediately.
            "X-Accel-Buffering": "no",
        },
    )
