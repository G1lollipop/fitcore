"""
Process-wide embedding client, with optional caching layer.

GoogleGenerativeAIEmbeddings is a thin HTTP client — safe to share across
threads, and constructing it twice (once per RagService, once per
KnowledgeBaseService) was pure waste. This module gives all consumers the same
instance.

When a CacheManager is supplied, the returned client wraps embed_query in
a cache lookup. embed_documents is intentionally NOT cached — ingest paths
have high cardinality and run once per chunk; caching wastes memory there.
Query embeddings, by contrast, repeat across users for the same question
shape, so the hit rate is meaningful.
"""

from __future__ import annotations

import threading
from typing import Optional

from langchain_core.embeddings import Embeddings
from langchain_google_genai import GoogleGenerativeAIEmbeddings

from app.core.settings import get_settings
from app.infra.cache import CacheManager


_raw_embedding: Optional[Embeddings] = None
_embedding_lock = threading.Lock()


def _get_raw_embedding() -> Embeddings:
    global _raw_embedding
    if _raw_embedding is not None:
        return _raw_embedding
    with _embedding_lock:
        if _raw_embedding is None:
            settings = get_settings()
            _raw_embedding = GoogleGenerativeAIEmbeddings(
                model=settings.embedding_model,
                google_api_key=settings.llm_api_key or None,
                # Matryoshka truncation so the vector length matches the store's
                # configured dimension (Supabase migration's vector(N)).
                output_dimensionality=settings.embedding_dim,
            )
    return _raw_embedding


class CachedEmbeddings(Embeddings):
    """Wraps an Embeddings to cache embed_query results in a CacheManager.

    Implements LangChain's Embeddings interface so any retriever consuming an
    Embeddings instance accepts this transparently.
    """

    def __init__(self, inner: Embeddings, cache_manager: CacheManager):
        self._inner = inner
        self._cm = cache_manager

    def embed_query(self, text: str) -> list[float]:
        cached = self._cm.get_cached_embedding(text)
        if cached is not None:
            return cached
        vec = self._inner.embed_query(text)
        self._cm.set_cached_embedding(text, vec)
        return vec

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        # Pass-through; ingest path is uncached by design.
        return self._inner.embed_documents(texts)


def get_embedding(cache_manager: Optional[CacheManager] = None) -> Embeddings:
    """Returns the shared embedding client.

    Without a cache_manager → raw GoogleGenerativeAIEmbeddings (preserves
    previous zero-arg behavior used by ingest in kb_service).
    With a cache_manager → CachedEmbeddings wrapper. The wrapper itself is
    cheap (two attributes), so callers can construct it on every retriever
    build without singleton concerns.
    """
    raw = _get_raw_embedding()
    if cache_manager is None:
        return raw
    return CachedEmbeddings(raw, cache_manager)


def reset_embedding() -> None:
    """Test hook — drops the cached raw instance so the next call rebuilds."""
    global _raw_embedding
    with _embedding_lock:
        _raw_embedding = None
