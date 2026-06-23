"""
Reranker (CrossEncoder) configuration + a CachedCompressionRetriever wrapper.

torch is loaded lazily — RERANKER_ENABLED=false keeps the production image
small (no torch / sentence-transformers needed).
"""

from __future__ import annotations

import os

from langchain_classic.retrievers import ContextualCompressionRetriever
from pydantic import PrivateAttr

from app.core.settings import get_settings
from app.infra.cache import CacheManager


def is_probable_local_path(model_ref: str) -> bool:
    if not model_ref:
        return False
    if model_ref.startswith(".") or model_ref.startswith("/"):
        return True
    if model_ref.startswith("\\\\"):
        return True
    if len(model_ref) > 2 and model_ref[1] == ":":
        return True
    return os.path.exists(model_ref)


class CachedCompressionRetriever(ContextualCompressionRetriever):
    """Compression retriever with caching."""

    _cache_manager: CacheManager = PrivateAttr()

    def __init__(self, base_compressor, base_retriever, cache_manager: CacheManager):
        super().__init__(base_compressor=base_compressor, base_retriever=base_retriever)
        object.__setattr__(self, "_cache_manager", cache_manager)

    def invoke(self, query: str, config=None, **kwargs):
        # The reranker always returns its top_n=10 — k-independent — so the
        # cache key is just the query. Previously this was hardcoded to k=3,
        # which was misleading (suggested k mattered) without changing keys.
        cached_results = self._cache_manager.get_cached_query(query)
        if cached_results is not None:
            return cached_results

        results = super().invoke(query, config=config, **kwargs)
        self._cache_manager.set_cached_query(query, results)
        return results


def build_compression_retriever(
    base_retriever,
    cache_manager: CacheManager,
) -> ContextualCompressionRetriever | None:
    """
    Build a (Cached)ContextualCompressionRetriever or return None when reranker
    is disabled / unavailable so the caller can fall back to the base retriever.
    """
    settings = get_settings()
    if not settings.reranker_enabled:
        print("[RagService] Reranker disabled via environment variable; using base retrieval")
        return None

    model_ref = settings.reranker_model_ref
    if not model_ref:
        print("[RagService] No Reranker model reference configured; falling back to base retrieval")
        return None

    if is_probable_local_path(model_ref) and not os.path.exists(model_ref):
        print(f"[RagService] Reranker local path does not exist; falling back to base retrieval: {model_ref}")
        return None

    # Lazy import: torch / sentence-transformers are only imported when
    # RERANKER_ENABLED=true and a model is configured. The production image
    # (requirements-prod.txt) does not install these packages, so an ImportError
    # here is the expected "lightweight cloud mode" signal, not an error.
    try:
        from langchain_classic.retrievers.document_compressors import (
            CrossEncoderReranker,
        )
        from langchain_community.cross_encoders import HuggingFaceCrossEncoder
    except ImportError as exc:
        print(
            "[RagService] Reranker dependencies not installed (torch / sentence-transformers); "
            f"falling back to base retrieval (Vector + BM25). Install torch + sentence-transformers to enable reranking. Details: {exc}"
        )
        return None

    try:
        model_kwargs = settings.reranker_model_kwargs
        model = HuggingFaceCrossEncoder(model_name=model_ref, model_kwargs=model_kwargs)
        # top_n=10: return all candidates after reranking (dynamic trimming happens in chat())
        compressor = CrossEncoderReranker(model=model, top_n=10)
        print(f"[RagService] Reranker enabled: {model_ref} model_kwargs={model_kwargs}")
    except Exception as exc:  # noqa: BLE001 (startup path)
        print(f"[RagService] Reranker initialization failed; falling back to base retrieval: {exc}")
        return None

    return CachedCompressionRetriever(
        base_compressor=compressor,
        base_retriever=base_retriever,
        cache_manager=cache_manager,
    )
