"""
Test scaffolding.

Two responsibilities:
  1. Set safe env vars BEFORE app.main is imported (Settings is lru_cached and
     freezes its values on first read; once frozen, tests can't change backend
     selection without resetting the cache — so we set them upfront).
  2. Inject a stub RagService so tests don't hit Gemini or Supabase.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Put RAG root on sys.path before any `app.*` import.
RAG_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAG_ROOT))

# Test env: set BEFORE importing anything that builds Settings.
os.environ["GOOGLE_AI_STUDIO_API_KEY"] = "test-key"
os.environ["VECTOR_BACKEND"] = "chroma"
os.environ["RERANKER_ENABLED"] = "false"
os.environ["ALLOWED_ORIGINS"] = "*"
# Pre-clear in case a real .env was loaded earlier in this process:
os.environ.pop("SUPABASE_URL", None)
os.environ.pop("SUPABASE_SERVICE_ROLE_KEY", None)

import pytest
from fastapi.testclient import TestClient
from langchain_core.documents import Document


class StubRagService:
    """In-memory stand-in for RagService. Records calls for assertions."""

    def __init__(self) -> None:
        self.chat_calls: list[dict] = []
        self.retrieve_calls: list[dict] = []

    # Lifespan hook; nothing to warm in tests.
    def warmup(self) -> None:
        return None

    def chat(self, query, session_id, user_context=None, top_k=None):
        self.chat_calls.append(
            {
                "query": query,
                "session_id": session_id,
                "user_context": user_context,
                "top_k": top_k,
            }
        )
        return {
            "answer": f"stub answer for {query!r}",
            "citations": [
                {
                    "id": "c1",
                    "title": "Stub doc",
                    "source": "stub.txt",
                    "snippet": "stubbed snippet",
                    "score": 0.9,
                }
            ],
            "retrieval_meta": {
                "retrievedCount": 1,
                "k": top_k if top_k is not None else 5,
                "kAuto": top_k is None,
            },
        }

    def retrieve(self, query, k):
        self.retrieve_calls.append({"query": query, "k": k})
        return [
            Document(
                page_content=f"chunk {i} for {query}",
                metadata={
                    "title": f"Doc{i}",
                    "source": f"src{i}.txt",
                    "id": str(i),
                    "relevance_score": 0.5,
                },
            )
            for i in range(k)
        ]


@pytest.fixture
def stub_rag(monkeypatch):
    """Replace the RagService singleton with a recording stub."""
    import app.main

    # Reset cached singletons (Settings + service) so test env actually applies.
    from app.core.settings import reset_settings_cache
    reset_settings_cache()

    stub = StubRagService()
    monkeypatch.setattr(app.main, "_rag_service", stub)
    yield stub


@pytest.fixture
def client(stub_rag):
    """TestClient that drives lifespan + share the stub_rag singleton."""
    from app.main import app

    with TestClient(app) as c:
        yield c
