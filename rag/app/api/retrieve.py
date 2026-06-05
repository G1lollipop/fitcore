"""
POST /v1/retrieve — pure retrieval (vector + BM25 + optional rerank), no LLM.
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import rate_limit, require_api_key
from app.core.settings import get_settings
from app.schemas.retrieve import RetrieveChunk, RetrieveRequest, RetrieveResponse
from app.services.citations import build_citations
from app.services.rag_service import RagService
from app.services.retrieval.adaptive_k import compute_retrieval_k

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_rag_service() -> RagService:
    from app.main import get_rag_service
    return get_rag_service()


@router.post(
    "/v1/retrieve",
    response_model=RetrieveResponse,
    dependencies=[Depends(require_api_key), Depends(rate_limit)],
)
async def retrieve_v1(request: RetrieveRequest):
    """
    纯检索端点：向量召回 + 重排序，不调 LLM，供 Agent 工具调用。

    topK 支持两种模式：
      - topK 在 1-20 之间：显式指定返回 N 条
      - 其它值：自适应模式，根据查询复杂度自动选 k∈{3,5,8}
    """
    try:
        rag = _get_rag_service()

        if request.topK and 1 <= request.topK <= 20:
            k = request.topK
        else:
            k = compute_retrieval_k(request.query)

        docs = await asyncio.wait_for(
            asyncio.to_thread(rag.retrieve, request.query, k),
            timeout=get_settings().rag_retrieve_timeout_sec,
        )
        citations = build_citations(docs)
        chunks = [
            RetrieveChunk(
                id=c.get("id"),
                title=c["title"],
                source=c["source"],
                snippet=c["snippet"],
                score=c.get("score"),
            )
            for c in citations
        ]
        return RetrieveResponse(chunks=chunks)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error in /v1/retrieve")
        raise HTTPException(status_code=500, detail="internal error")
