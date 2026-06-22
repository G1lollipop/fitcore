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

from app.core.settings import get_settings
from app.infra.cache import CacheManager


_raw_embedding: Optional[Embeddings] = None
_embedding_lock = threading.Lock()

# BGE retrieval models expect this instruction ONLY on the query side; documents
# are embedded as-is. (bge-m3 / e5 use their own scheme — handled below.)
_BGE_QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "


class _QueryInstructionEmbeddings(Embeddings):
    """Wrap an Embeddings to prepend a query-side instruction (asymmetric).

    embed_documents passes through unchanged; embed_query prefixes the
    instruction. Needed for BGE-style models to keep query/doc spaces aligned.
    """

    def __init__(self, inner: Embeddings, instruction: str):
        self._inner = inner
        self._instr = instruction

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._inner.embed_documents(texts)

    def embed_query(self, text: str) -> list[float]:
        return self._inner.embed_query(self._instr + text)


def _resolve_device(pref: str) -> str:
    if pref and pref != "auto":
        return pref
    try:
        import torch  # noqa: WPS433

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:  # noqa: BLE001
        return "cpu"


def _build_local_embedding(settings) -> Embeddings:
    """Local sentence-transformers embedding (no API quota). Used for the
    full-corpus local learning track (pair with VECTOR_BACKEND=chroma)."""
    from langchain_huggingface import HuggingFaceEmbeddings  # noqa: WPS433

    model = settings.local_embedding_model
    device = _resolve_device(settings.embedding_device)
    base = HuggingFaceEmbeddings(
        model_name=model,
        model_kwargs={"device": device},
        encode_kwargs={"normalize_embeddings": True},
    )
    print(f"[embeddings] provider=local model={model} device={device}")
    # bge-*-en-v1.5 (not m3) benefit from a query-side instruction.
    low = model.lower()
    if "bge" in low and "m3" not in low:
        return _QueryInstructionEmbeddings(base, _BGE_QUERY_INSTRUCTION)
    return base


def _build_gemini_embedding(settings) -> Embeddings:
    from langchain_google_genai import GoogleGenerativeAIEmbeddings  # noqa: WPS433

    return GoogleGenerativeAIEmbeddings(
        model=settings.embedding_model,
        google_api_key=settings.llm_api_key or None,
        # Matryoshka truncation so the vector length matches the store's
        # configured dimension (Supabase migration's vector(N)).
        output_dimensionality=settings.embedding_dim,
    )


def _get_raw_embedding() -> Embeddings:
    global _raw_embedding
    if _raw_embedding is not None:
        return _raw_embedding
    with _embedding_lock:
        if _raw_embedding is None:
            settings = get_settings()
            if (settings.embedding_provider or "gemini").strip().lower() == "local":
                _raw_embedding = _build_local_embedding(settings)
            else:
                _raw_embedding = _build_gemini_embedding(settings)
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
