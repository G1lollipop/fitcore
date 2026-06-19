"""
Dual-mode reranker degradation tests.

Two layers:
  1. build_compression_retriever() returns None for every "no reranker" path
     (disabled, missing model ref, missing local path, ImportError, init error)
     instead of raising — keeps the cloud-friendly RERANKER_ENABLED=false image
     from crashing on startup.
  2. RagService caches that None decision (sticky _compression_attempted) so we
     don't re-run the build path per request.

These are pure unit tests — no chroma, no embeddings, no Gemini.
"""

from __future__ import annotations

import threading
from unittest.mock import MagicMock

import pytest

from app.core.settings import reset_settings_cache
from app.services.retrieval.compression import build_compression_retriever


@pytest.fixture(autouse=True)
def _reset_settings():
    """Settings is lru_cached; tests mutate env so we must drop the cache."""
    reset_settings_cache()
    yield
    reset_settings_cache()


def test_returns_none_when_disabled(monkeypatch):
    monkeypatch.setenv("RERANKER_ENABLED", "false")
    monkeypatch.setenv("RERANKER_MODEL_NAME", "BAAI/bge-reranker-base")
    result = build_compression_retriever(base_retriever=MagicMock(), cache_manager=MagicMock())
    assert result is None


def test_returns_none_when_no_model_ref(monkeypatch):
    monkeypatch.setenv("RERANKER_ENABLED", "true")
    monkeypatch.delenv("RERANKER_MODEL_NAME", raising=False)
    monkeypatch.delenv("RERANKER_HF_MODEL", raising=False)
    monkeypatch.delenv("RERANKER_MODEL_PATH", raising=False)
    monkeypatch.delenv("LOCAL_RERANKER_MODEL_PATH", raising=False)
    result = build_compression_retriever(base_retriever=MagicMock(), cache_manager=MagicMock())
    assert result is None


def test_returns_none_when_local_path_missing(monkeypatch, tmp_path):
    """A path-shaped ref that doesn't exist must degrade, not raise."""
    monkeypatch.setenv("RERANKER_ENABLED", "true")
    monkeypatch.setenv("RERANKER_MODEL_PATH", str(tmp_path / "does_not_exist"))
    result = build_compression_retriever(base_retriever=MagicMock(), cache_manager=MagicMock())
    assert result is None


def test_returns_none_on_import_error(monkeypatch):
    """Simulates the prod image where torch / sentence-transformers aren't installed."""
    monkeypatch.setenv("RERANKER_ENABLED", "true")
    monkeypatch.setenv("RERANKER_MODEL_NAME", "BAAI/bge-reranker-base")

    real_import = __builtins__["__import__"] if isinstance(__builtins__, dict) else __builtins__.__import__

    def fake_import(name, *args, **kwargs):
        if "cross_encoder" in name or "sentence_transformers" in name:
            raise ImportError(f"No module named {name!r}")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", fake_import)
    result = build_compression_retriever(base_retriever=MagicMock(), cache_manager=MagicMock())
    assert result is None


def test_returns_none_on_init_failure(monkeypatch):
    """Imports succeed but model construction blows up (e.g. OOM, bad weights)."""
    monkeypatch.setenv("RERANKER_ENABLED", "true")
    monkeypatch.setenv("RERANKER_MODEL_NAME", "BAAI/bge-reranker-base")

    fake_module = MagicMock()
    fake_module.HuggingFaceCrossEncoder.side_effect = RuntimeError("simulated OOM")
    monkeypatch.setitem(__import__("sys").modules, "langchain_community.cross_encoders", fake_module)

    fake_classic = MagicMock()
    monkeypatch.setitem(
        __import__("sys").modules,
        "langchain_classic.retrievers.document_compressors",
        fake_classic,
    )

    result = build_compression_retriever(base_retriever=MagicMock(), cache_manager=MagicMock())
    assert result is None


# ── RagService sticky-no-retry behavior ─────────────────────────────────────

def _make_bare_rag_service():
    """Construct just enough of RagService to exercise _get_compression_retriever
    without booting embeddings / ChromaDB / Gemini."""
    from app.services.rag_service import RagService

    svc = RagService.__new__(RagService)
    svc.base_retriever = MagicMock()
    svc.cache_manager = MagicMock()
    svc._compression_retriever = None
    svc._compression_retriever_lock = threading.Lock()
    svc._compression_attempted = False
    return svc


def test_compression_lookup_is_sticky_when_none(monkeypatch):
    """First call invokes build_compression_retriever; subsequent calls short-circuit."""
    from app.services import rag_service as rag_service_mod

    call_count = {"n": 0}

    def fake_build(*_args, **_kwargs):
        call_count["n"] += 1
        return None

    monkeypatch.setattr(rag_service_mod, "build_compression_retriever", fake_build)

    svc = _make_bare_rag_service()
    assert svc._get_compression_retriever() is None
    assert svc._get_compression_retriever() is None
    assert svc._get_compression_retriever() is None
    assert call_count["n"] == 1, "build_compression_retriever should be called exactly once"


def test_compression_lookup_caches_when_present(monkeypatch):
    """When a real compressor is built, it's cached (existing behavior preserved)."""
    from app.services import rag_service as rag_service_mod

    sentinel = MagicMock(name="compression_retriever")
    call_count = {"n": 0}

    def fake_build(*_args, **_kwargs):
        call_count["n"] += 1
        return sentinel

    monkeypatch.setattr(rag_service_mod, "build_compression_retriever", fake_build)

    svc = _make_bare_rag_service()
    assert svc._get_compression_retriever() is sentinel
    assert svc._get_compression_retriever() is sentinel
    assert call_count["n"] == 1
