"""
Pick the right vector-store backend based on env (VECTOR_BACKEND).
"""

from __future__ import annotations

from typing import Optional

from app.infra.cache import CacheManager
from app.infra.supabase_client import supabase_configured, vector_backend


def resolve_vector_store_service(embedding, cache_manager: Optional[CacheManager] = None):
    """
    Chroma (default) or Supabase pgvector (VECTOR_BACKEND=supabase + secrets set).
    """
    cm = cache_manager or CacheManager()
    if vector_backend() == "supabase":
        if not supabase_configured():
            raise RuntimeError(
                "VECTOR_BACKEND=supabase 但未设置 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY"
            )
        from app.services.retrieval.supabase_store import SupabaseVectorStoreService

        return SupabaseVectorStoreService(embedding, cache_manager=cm)

    from app.services.retrieval.chroma_store import VectorStoreService

    return VectorStoreService(embedding, cache_manager=cm)
