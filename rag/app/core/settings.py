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

We deliberately do NOT mark DASHSCOPE_API_KEY / SUPABASE_* as required —
loading the package without a real API key (e.g. when running tests, or
importing for static analysis) used to work, and we keep that property.
Validation happens where the value is actually used (when ChatOpenAI runs, or
when get_supabase_client() is called).
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _normalize_pasted_secret(s: str) -> str:
    """Strip whitespace, BOM, and a wrapping pair of quotes (common in CI secrets)."""
    if not s:
        return ""
    t = s.strip().strip("﻿").strip()
    if (t.startswith('"') and t.endswith('"')) or (t.startswith("'") and t.endswith("'")):
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

    # ── DashScope (Qwen) ──────────────────────────────────────────────────
    dashscope_api_key: str = Field(default="", alias="DASHSCOPE_API_KEY")
    rag_chat_model: str = Field(default="qwen3.5-flash", alias="RAG_CHAT_MODEL")
    dashscope_base_url: str = Field(
        default="https://dashscope.aliyuncs.com/compatible-mode/v1",
        alias="DASHSCOPE_BASE_URL",
    )

    # ── Vector store backend ──────────────────────────────────────────────
    vector_backend: str = Field(default="chroma", alias="VECTOR_BACKEND")
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")

    # ── Reranker ─────────────────────────────────────────────────────────
    reranker_enabled: bool = Field(default=True, alias="RERANKER_ENABLED")
    reranker_model_name: str = Field(default="", alias="RERANKER_MODEL_NAME")
    reranker_hf_model: str = Field(default="", alias="RERANKER_HF_MODEL")
    reranker_model_path: str = Field(default="", alias="RERANKER_MODEL_PATH")
    local_reranker_model_path: str = Field(default="", alias="LOCAL_RERANKER_MODEL_PATH")
    reranker_model_kwargs_raw: str = Field(default="", alias="RERANKER_MODEL_KWARGS")

    # ── HTTP API ─────────────────────────────────────────────────────────
    allowed_origins_raw: str = Field(default="*", alias="ALLOWED_ORIGINS")
    rag_chat_timeout_sec: float = Field(default=118.0, alias="RAG_CHAT_TIMEOUT_SEC")
    rag_chat_retries: int = Field(default=3, alias="RAG_CHAT_RETRIES", ge=1)

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

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins_raw.split(",") if o.strip()]

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
            print(f"[Settings] RERANKER_MODEL_KWARGS JSON 解析失败，已忽略: {exc}")
            return {}
        if isinstance(parsed, dict):
            return parsed
        print(f"[Settings] RERANKER_MODEL_KWARGS 不是 JSON 对象，已忽略: {raw}")
        return {}

    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    """Test hook: drops the cached Settings so the next get_settings() rereads env."""
    get_settings.cache_clear()
