"""
Supabase client factory and backend-detection helpers.

Read paths and write paths live in their own modules
(`app.services.retrieval.supabase_store` and `app.ingest.supabase_writer`)
so the HTTP API layer and the ingest scripts stay decoupled.

Public functions are kept (vector_backend, supabase_configured, get_supabase_client)
for backward compat with scripts/ingest_seed_kb.py and tests.
"""

from __future__ import annotations

from typing import Any

from app.core.settings import get_settings

try:
    from supabase import Client, create_client
except ImportError as exc:  # pragma: no cover - optional dependency
    create_client = None  # type: ignore[misc, assignment]
    Client = Any  # type: ignore[misc, assignment]
    _SUPABASE_IMPORT_ERROR = exc
else:
    _SUPABASE_IMPORT_ERROR = None


def vector_backend() -> str:
    return get_settings().vector_backend


def supabase_configured() -> bool:
    return get_settings().supabase_configured()


def get_supabase_client() -> Client:
    if _SUPABASE_IMPORT_ERROR is not None:
        raise RuntimeError(
            "Missing the supabase package. Run: pip install supabase"
        ) from _SUPABASE_IMPORT_ERROR
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
