"""
Typed application settings — single source of truth for env-driven config.

Usage:
    from app.core.settings import get_settings
    settings = get_settings()
    print(settings.rag_chat_model)

The class is `lru_cache`-d so all consumers share the same instance and changes
to the process environment after first read are intentionally NOT picked up;
this matches the previous behavior where `os.getenv(...)` calls evaluated at
import time froze the value.

We deliberately do NOT mark the LLM API key / SUPABASE_* as required —
loading the package without a real API key (e.g. when running tests, or
importing for static analysis) used to work, and we keep that property.
Validation happens where the value is actually used (when ChatOpenAI runs, or
when get_supabase_client() is called).
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _normalize_pasted_secret(s: str) -> str:
    """Strip whitespace, BOM, and a wrapping pair of quotes (common in CI secrets)."""
    if not s:
        return ""
    t = s.strip().strip("﻿").strip()
    if (t.startswith('"') and t.endswith('"')) or (
        t.startswith("'") and t.endswith("'")
    ):
        t = t[1:-1].strip()
    return t


class Settings(BaseSettings):
    """All env-driven knobs in one place."""

    model_config = SettingsConfigDict(
        # We rely on app.main's load_dotenv() to populate os.environ, so don't
        # also have pydantic-settings try to parse .env. Keeps a single owner
        # of the .env-loading semantics and avoids surprising precedence.
        env_file=None,
        case_sensitive=False,
        extra="ignore",
    )

    # ── LLM: Google Gemini (chat + embeddings) ────────────────────────────
    # Chat runs through Gemini's OpenAI-compatible endpoint (so langchain-openai's
    # ChatOpenAI works unchanged); embeddings use the native google client.
    # A single key powers both. We accept several env names so the same Gemini
    # key works whether it was provisioned as GOOGLE_AI_STUDIO_API_KEY (matches
    # the web app), GEMINI_API_KEY, or the legacy DASHSCOPE_API_KEY slot.
    llm_api_key: str = Field(
        default="",
        validation_alias=AliasChoices(
            "GOOGLE_AI_STUDIO_API_KEY", "GEMINI_API_KEY", "DASHSCOPE_API_KEY"
        ),
    )
    rag_chat_model: str = Field(default="gemini-2.5-flash", alias="RAG_CHAT_MODEL")
    llm_base_url: str = Field(
        default="https://generativelanguage.googleapis.com/v1beta/openai/",
        validation_alias=AliasChoices("LLM_BASE_URL", "DASHSCOPE_BASE_URL"),
    )

    # ── Embeddings ────────────────────────────────────────────────────────
    # Provider switch (dual-track):
    #   "gemini" (DEFAULT) → GoogleGenerativeAIEmbeddings (cloud, API-quota'd,
    #       768-dim, matches Supabase vector(768)). Used for the deployed track.
    #   "local"           → local sentence-transformers model (no API quota),
    #       e.g. BAAI/bge-large-en-v1.5 (1024-dim). Pair with VECTOR_BACKEND=chroma
    #       for the full-corpus local learning track. Query & ingest MUST use the
    #       same provider/model (shared embedding space).
    embedding_provider: str = Field(default="gemini", alias="EMBEDDING_PROVIDER")
    # embedding_dim MUST equal the Supabase migration's vector(N) (Gemini track).
    # gemini-embedding-001 supports Matryoshka truncation; 768 keeps the index small.
    embedding_model: str = Field(
        default="models/gemini-embedding-001", alias="EMBEDDING_MODEL"
    )
    embedding_dim: int = Field(default=768, alias="EMBEDDING_DIM", gt=0)
    # Local-track model + device (only used when embedding_provider == "local").
    local_embedding_model: str = Field(
        default="BAAI/bge-large-en-v1.5", alias="LOCAL_EMBEDDING_MODEL"
    )
    embedding_device: str = Field(default="auto", alias="EMBEDDING_DEVICE")

    # ── Chunking (ingest-time text splitting) ─────────────────────────────
    # "recursive" = RecursiveCharacterTextSplitter (fast, char-based) — DEFAULT.
    # "semantic"  = embedding-based SemanticChunker (splits at meaning shifts).
    #   ⚠️ Semantic embeds every sentence, which easily blows the Gemini FREE
    #   tier embedding limit (100 req/min → HTTP 429). Only enable it on a paid
    #   tier or for a tiny corpus. Falls back to recursive if langchain-
    #   experimental isn't installed.
    chunking_strategy: str = Field(default="recursive", alias="CHUNKING_STRATEGY")
    # Char-based splitter knobs (env-tunable so the cloud track can use bigger
    # chunks to fit Gemini's daily embed quota + Supabase 500MB; defaults match
    # app.core.constants for backward compatibility).
    chunk_size: int = Field(default=1000, alias="CHUNK_SIZE", gt=0)
    chunk_overlap: int = Field(default=100, alias="CHUNK_OVERLAP", ge=0)
    # Breakpoint detection for SemanticChunker: percentile | standard_deviation
    # | interquartile | gradient.
    semantic_breakpoint_type: str = Field(
        default="percentile", alias="SEMANTIC_BREAKPOINT_TYPE"
    )

    # ── Hybrid retrieval fusion ───────────────────────────────────────────
    # Weight of vector retrieval inside the EnsembleRetriever (BM25 weight = 1 - this value). Default 0.5/0.5.
    # Note: in cross-language scenarios (e.g. Chinese query + English corpus) BM25 lexical matching is
    # nearly useless; offline evaluation shows equal-weight fusion underperforms pure vector search, so
    # the vector weight should be raised (e.g. 0.8~1.0) in that case.
    retrieval_vector_weight: float = Field(
        default=0.5, alias="RETRIEVAL_VECTOR_WEIGHT", ge=0.0, le=1.0
    )
    # When > 0 and the backend exposes a top-1 relevance score, documents below
    # this threshold trigger generation-layer abstention (empty context + flag).
    # 0 = disabled (default). Supabase pgvector uses relevance_score = 1 - distance.
    retrieval_min_score: float = Field(
        default=0.0, alias="RETRIEVAL_MIN_SCORE", ge=0.0, le=1.0
    )

    # ── Vector store backend ──────────────────────────────────────────────
    vector_backend: str = Field(default="chroma", alias="VECTOR_BACKEND")
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(
        default="", alias="SUPABASE_SERVICE_ROLE_KEY"
    )

    # ── Reranker ─────────────────────────────────────────────────────────
    reranker_enabled: bool = Field(default=True, alias="RERANKER_ENABLED")
    reranker_model_name: str = Field(default="", alias="RERANKER_MODEL_NAME")
    reranker_hf_model: str = Field(default="", alias="RERANKER_HF_MODEL")
    reranker_model_path: str = Field(default="", alias="RERANKER_MODEL_PATH")
    local_reranker_model_path: str = Field(
        default="", alias="LOCAL_RERANKER_MODEL_PATH"
    )
    reranker_model_kwargs_raw: str = Field(default="", alias="RERANKER_MODEL_KWARGS")

    # ── HTTP API ─────────────────────────────────────────────────────────
    allowed_origins_raw: str = Field(default="*", alias="ALLOWED_ORIGINS")
    rag_chat_timeout_sec: float = Field(default=118.0, alias="RAG_CHAT_TIMEOUT_SEC")
    rag_retrieve_timeout_sec: float = Field(
        default=30.0, alias="RAG_RETRIEVE_TIMEOUT_SEC"
    )
    rag_chat_retries: int = Field(default=3, alias="RAG_CHAT_RETRIES", ge=1)

    # ── API auth / rate limiting ──────────────────────────────────────────
    # When RAG_API_KEY is set, /v1/chat and /v1/retrieve require a matching
    # X-API-Key header. Empty (default) disables the check so local dev and the
    # test suite keep working without configuration.
    rag_api_key: str = Field(default="", alias="RAG_API_KEY")
    # Per-client (IP) requests/minute. 0 disables rate limiting.
    rag_rate_limit_per_min: int = Field(default=0, alias="RAG_RATE_LIMIT_PER_MIN", ge=0)

    # ── Cache layer ──────────────────────────────────────────────────────
    # CACHE_BACKEND=memory (default) keeps the previous in-process LRU.
    # CACHE_BACKEND=redis switches to Upstash (REST API); cache then survives
    # process restarts / Render free-tier cold boots / multi-replica deploys.
    cache_backend: str = Field(default="memory", alias="CACHE_BACKEND")
    upstash_redis_url: str = Field(default="", alias="UPSTASH_REDIS_REST_URL")
    upstash_redis_token: str = Field(default="", alias="UPSTASH_REDIS_REST_TOKEN")
    cache_retrieval_ttl_sec: int = Field(
        default=3600, alias="CACHE_RETRIEVAL_TTL_SEC", ge=0
    )
    cache_embedding_ttl_sec: int = Field(
        default=86400, alias="CACHE_EMBEDDING_TTL_SEC", ge=0
    )

    # ── Validators / accessors ───────────────────────────────────────────

    @field_validator("supabase_url", "supabase_service_role_key", mode="before")
    @classmethod
    def _normalize_supabase_secret(cls, v: Any) -> Any:
        if not isinstance(v, str):
            return v
        return _normalize_pasted_secret(v)

    @field_validator("vector_backend", "cache_backend", mode="before")
    @classmethod
    def _lowercase_backend(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip().lower()
        return v

    @field_validator("upstash_redis_url", "upstash_redis_token", mode="before")
    @classmethod
    def _normalize_upstash_secret(cls, v: Any) -> Any:
        if not isinstance(v, str):
            return v
        return _normalize_pasted_secret(v)

    @field_validator("rag_api_key", "llm_api_key", mode="before")
    @classmethod
    def _normalize_api_key(cls, v: Any) -> Any:
        if not isinstance(v, str):
            return v
        return _normalize_pasted_secret(v)

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins_raw.split(",") if o.strip()]

    @property
    def ensemble_weights(self) -> list[float]:
        """[vector weight, BM25 weight], used by EnsembleRetriever."""
        v = self.retrieval_vector_weight
        return [v, 1.0 - v]

    @property
    def reranker_model_ref(self) -> str | None:
        """Priority: RERANKER_MODEL_NAME / RERANKER_HF_MODEL > local path. None if unset."""
        for hf in (self.reranker_model_name, self.reranker_hf_model):
            if hf and hf.strip():
                return hf.strip()
        for path in (self.reranker_model_path, self.local_reranker_model_path):
            if path:
                return path
        return None

    @property
    def reranker_model_kwargs(self) -> dict[str, Any]:
        raw = (self.reranker_model_kwargs_raw or "").strip()
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except Exception as exc:  # noqa: BLE001
            print(f"[Settings] Failed to parse RERANKER_MODEL_KWARGS JSON, ignoring: {exc}")
            return {}
        if isinstance(parsed, dict):
            return parsed
        print(f"[Settings] RERANKER_MODEL_KWARGS is not a JSON object, ignoring: {raw}")
        return {}

    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    """Test hook: drops the cached Settings so the next get_settings() rereads env."""
    get_settings.cache_clear()
