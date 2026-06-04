"""
Cache layer for the RAG service.

Two backends behind a single Protocol:
  - MemoryBackend: in-process LRU + TTL. Default; used in tests + local dev.
  - RedisBackend:  Upstash REST API. Survives process restarts and Render
                   free-tier cold boots. Opt-in via CACHE_BACKEND=redis.

Two value classes flow through the manager:
  - Query → retrieved Documents (TTL: settings.cache_retrieval_ttl_sec, default 1h)
  - Query → embedding vector  (TTL: settings.cache_embedding_ttl_sec, default 24h)

Document values are serialized to dicts so MemoryBackend and RedisBackend
behave identically. Embedding values are plain list[float], JSON-friendly.

Corpus-hash-driven invalidation:
  VectorStoreCache.set_cached_retriever fires an internal callback when the
  hash changes between calls. CacheManager wires that callback to wipe the
  query + embedding caches — so a re-ingest never serves rankings computed
  against the old corpus.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import OrderedDict
from typing import Any, Callable, List, Optional, Protocol

from langchain_core.documents import Document


# ─── Public helper: query normalization ────────────────────────────────────

def normalize_query(text: str) -> str:
    """Light normalization for cache keys.

    Lowercase, collapse internal whitespace, strip terminal punctuation
    (English + Chinese). "How much protein?" and "how much   protein"
    map to the same key. Applied at cache boundaries only — the original
    query string is preserved for retrieval and the LLM context.
    """
    if not text:
        return ""
    return " ".join(text.lower().strip().rstrip("?.!。！？").split())


# ─── Backend Protocol ──────────────────────────────────────────────────────

class CacheBackend(Protocol):
    def get_json(self, key: str) -> Optional[Any]: ...
    def set_json(self, key: str, value: Any, ttl_seconds: int) -> None: ...
    def delete(self, key: str) -> None: ...
    def clear(self) -> None: ...


# ─── In-process backend ───────────────────────────────────────────────────

class MemoryBackend:
    """Process-local LRU cache with per-key TTL. JSON-only payloads to keep
    parity with RedisBackend; values are stored as Python objects (no actual
    JSON encode/decode) since there's no wire format to satisfy."""

    def __init__(self, max_size: int = 500):
        self._max_size = max_size
        self._cache: OrderedDict[str, dict] = OrderedDict()

    def get_json(self, key: str) -> Optional[Any]:
        entry = self._cache.get(key)
        if entry is None:
            return None
        if entry["expires_at"] is not None and time.time() > entry["expires_at"]:
            del self._cache[key]
            return None
        self._cache.move_to_end(key)
        return entry["value"]

    def set_json(self, key: str, value: Any, ttl_seconds: int) -> None:
        if key in self._cache:
            del self._cache[key]
        if len(self._cache) >= self._max_size:
            self._cache.popitem(last=False)
        expires_at = time.time() + ttl_seconds if ttl_seconds > 0 else None
        self._cache[key] = {"value": value, "expires_at": expires_at}

    def delete(self, key: str) -> None:
        self._cache.pop(key, None)

    def clear(self) -> None:
        self._cache.clear()

    def size(self) -> int:
        return len(self._cache)


# ─── Upstash Redis backend ─────────────────────────────────────────────────

class RedisBackend:
    """Upstash Redis backend (REST API, no persistent connection).

    All operations are wrapped in try/except: a Redis hiccup degrades to a
    cache-miss rather than failing the request. The RAG path is correct
    without the cache; the cache only makes it faster.
    """

    def __init__(self, url: str, token: str, key_prefix: str = "fc:cache:"):
        try:
            from upstash_redis import Redis  # type: ignore
        except ImportError as exc:
            raise RuntimeError(
                "CACHE_BACKEND=redis requires the 'upstash-redis' package; "
                "install it via requirements-prod.txt"
            ) from exc
        self._r = Redis(url=url, token=token)
        self._prefix = key_prefix

    def _k(self, key: str) -> str:
        return self._prefix + key

    def get_json(self, key: str) -> Optional[Any]:
        try:
            raw = self._r.get(self._k(key))
        except Exception as exc:  # noqa: BLE001
            print(f"[RedisBackend] get failed, treating as miss: {exc}")
            return None
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (TypeError, json.JSONDecodeError) as exc:
            print(f"[RedisBackend] decode failed for key={key}: {exc}")
            return None

    def set_json(self, key: str, value: Any, ttl_seconds: int) -> None:
        try:
            payload = json.dumps(value, ensure_ascii=False)
        except (TypeError, ValueError) as exc:
            print(f"[RedisBackend] non-serializable value for key={key}: {exc}")
            return
        try:
            if ttl_seconds > 0:
                self._r.set(self._k(key), payload, ex=ttl_seconds)
            else:
                self._r.set(self._k(key), payload)
        except Exception as exc:  # noqa: BLE001
            print(f"[RedisBackend] set failed for key={key}: {exc}")

    def delete(self, key: str) -> None:
        try:
            self._r.delete(self._k(key))
        except Exception as exc:  # noqa: BLE001
            print(f"[RedisBackend] delete failed for key={key}: {exc}")

    def clear(self) -> None:
        """Removes every key with our prefix. Used only on corpus-hash change
        — rare, so SCAN cost is acceptable."""
        try:
            cursor: int | str = 0
            while True:
                cursor, keys = self._r.scan(
                    cursor=cursor, match=f"{self._prefix}*", count=200
                )
                if keys:
                    self._r.delete(*keys)
                if str(cursor) == "0":
                    break
        except Exception as exc:  # noqa: BLE001
            print(f"[RedisBackend] clear failed: {exc}")


# ─── Backend factory ──────────────────────────────────────────────────────

def build_cache_backend() -> CacheBackend:
    """Pick a backend by env (CACHE_BACKEND). Defaults to MemoryBackend.
    Falls back to memory on any Redis init failure — the service must
    never refuse to start because of a cache outage."""
    from app.core.settings import get_settings  # avoid import cycle at module load

    s = get_settings()
    if s.cache_backend == "redis":
        if not s.upstash_redis_url or not s.upstash_redis_token:
            print(
                "[Cache] CACHE_BACKEND=redis but UPSTASH_REDIS_REST_URL or "
                "UPSTASH_REDIS_REST_TOKEN is empty; falling back to memory."
            )
            return MemoryBackend()
        try:
            backend = RedisBackend(s.upstash_redis_url, s.upstash_redis_token)
            print("[Cache] backend=Redis (Upstash)")
            return backend
        except Exception as exc:  # noqa: BLE001
            print(f"[Cache] Redis init failed ({exc}); falling back to memory.")
            return MemoryBackend()
    print("[Cache] backend=Memory (in-process LRU)")
    return MemoryBackend()


# ─── Document <-> dict adapters (Redis serialization) ─────────────────────

def _doc_to_dict(d: Document) -> dict:
    return {"page_content": d.page_content, "metadata": d.metadata}


def _dict_to_doc(d: dict) -> Document:
    return Document(page_content=d.get("page_content", ""), metadata=d.get("metadata") or {})


# ─── VectorStoreCache (process-local; retrievers can't serialize) ─────────

class VectorStoreCache:
    """Caches the constructed (vector + BM25) ensemble retriever. Rebuilds
    when the corpus hash changes. Process-local — retriever objects hold
    model handles and BM25 indices that can't be JSON-serialized."""

    def __init__(self, on_hash_change: Optional[Callable[[], None]] = None):
        self._retriever_cache: Any = None
        self._bm25_retriever_cache: Any = None
        self._docs_hash: Optional[str] = None
        self._last_update_time: float = 0
        self._on_hash_change = on_hash_change

    def get_cached_retriever(self, vector_store, embedding, all_docs_data: dict):
        docs_list = all_docs_data.get("documents", [])
        current_hash = self._compute_docs_hash(docs_list)
        if current_hash == self._docs_hash and self._retriever_cache is not None:
            return self._retriever_cache
        return None

    def set_cached_retriever(self, retriever, bm25_retriever, docs_hash: str):
        prev = self._docs_hash
        self._retriever_cache = retriever
        self._bm25_retriever_cache = bm25_retriever
        self._docs_hash = docs_hash
        self._last_update_time = time.time()
        # Fire only on a real change (skip the cold-start prev=None case).
        if self._on_hash_change is not None and prev is not None and prev != docs_hash:
            self._on_hash_change()

    def invalidate(self):
        self._retriever_cache = None
        self._bm25_retriever_cache = None
        self._docs_hash = None

    def _compute_docs_hash(self, docs_list: List[str]) -> str:
        if not docs_list:
            return ""
        total_length = sum(len(doc) for doc in docs_list)
        sample_content = "".join([doc[:200] for doc in docs_list[:3]])
        content = f"{len(docs_list)}_{total_length}_{sample_content}"
        return hashlib.md5(content.encode("utf-8")).hexdigest()


# ─── CacheManager — public facade ─────────────────────────────────────────

# Hardcoded fallback TTLs only used when a CacheManager is built without a
# Settings object (tests / standalone). Production reads from settings.
_FALLBACK_RETRIEVAL_TTL = 3600
_FALLBACK_EMBEDDING_TTL = 86400


class CacheManager:
    """Single entry point for all caches.

    Backwards-compatible API preserved for callers in retrieval/factory.py,
    retrieval/compression.py, supabase_store.py, chroma_store.py:
      - get_cached_query / set_cached_query
      - vector_store_cache.{get,set}_cached_retriever
      - vector_store_cache._compute_docs_hash
      - invalidate_query_cache / invalidate_all
      - get_cache_stats

    New methods:
      - get_cached_embedding / set_cached_embedding
      - observe_corpus_hash (fired automatically by VectorStoreCache)
    """

    def __init__(
        self,
        backend: Optional[CacheBackend] = None,
        retrieval_ttl_sec: Optional[int] = None,
        embedding_ttl_sec: Optional[int] = None,
        # Legacy kwargs preserved for any existing instantiations:
        query_cache_size: int = 200,  # noqa: ARG002 (kept for API compat)
        query_cache_ttl: Optional[int] = None,
    ):
        self._backend: CacheBackend = backend or build_cache_backend()
        self._retrieval_ttl = (
            retrieval_ttl_sec
            if retrieval_ttl_sec is not None
            else (query_cache_ttl if query_cache_ttl is not None else self._resolve_retrieval_ttl())
        )
        self._embedding_ttl = (
            embedding_ttl_sec if embedding_ttl_sec is not None else self._resolve_embedding_ttl()
        )
        self.vector_store_cache = VectorStoreCache(on_hash_change=self._on_corpus_change)
        self._stats = {
            "retrieval_hits": 0,
            "retrieval_misses": 0,
            "embedding_hits": 0,
            "embedding_misses": 0,
            "corpus_invalidations": 0,
        }

    # ── TTL resolution from settings (with fallback) ─────────────────────

    @staticmethod
    def _resolve_retrieval_ttl() -> int:
        try:
            from app.core.settings import get_settings
            return int(get_settings().cache_retrieval_ttl_sec)
        except Exception:  # noqa: BLE001
            return _FALLBACK_RETRIEVAL_TTL

    @staticmethod
    def _resolve_embedding_ttl() -> int:
        try:
            from app.core.settings import get_settings
            return int(get_settings().cache_embedding_ttl_sec)
        except Exception:  # noqa: BLE001
            return _FALLBACK_EMBEDDING_TTL

    # ── Query → Documents cache ───────────────────────────────────────────

    def get_cached_query(self, query: str, k: Optional[int] = None) -> Optional[List[Document]]:
        key = self._retrieval_key(query, k)
        cached = self._backend.get_json(key)
        if cached is None:
            self._stats["retrieval_misses"] += 1
            return None
        self._stats["retrieval_hits"] += 1
        # Documents → dicts on write; reverse on read regardless of backend.
        if isinstance(cached, list) and cached and isinstance(cached[0], dict):
            return [_dict_to_doc(d) for d in cached]
        return cached

    def set_cached_query(self, query: str, results: List[Document], k: Optional[int] = None) -> None:
        key = self._retrieval_key(query, k)
        payload = [_doc_to_dict(d) for d in results]
        self._backend.set_json(key, payload, self._retrieval_ttl)

    # ── Query → embedding-vector cache ────────────────────────────────────

    def get_cached_embedding(self, query: str) -> Optional[List[float]]:
        key = self._embedding_key(query)
        v = self._backend.get_json(key)
        if v is None:
            self._stats["embedding_misses"] += 1
            return None
        self._stats["embedding_hits"] += 1
        return v

    def set_cached_embedding(self, query: str, vector: List[float]) -> None:
        self._backend.set_json(self._embedding_key(query), vector, self._embedding_ttl)

    # ── Corpus-hash invalidation ──────────────────────────────────────────

    def _on_corpus_change(self) -> None:
        """Wired into VectorStoreCache. Fires only on real hash changes."""
        self._stats["corpus_invalidations"] += 1
        print("[CacheManager] corpus hash changed; wiping query + embedding caches")
        self._backend.clear()

    # ── Compatibility shims (preserve previous public surface) ────────────

    def invalidate_query_cache(self) -> None:
        self._backend.clear()

    def invalidate_all(self) -> None:
        self._backend.clear()
        self.vector_store_cache.invalidate()

    def get_cache_stats(self) -> dict:
        size = self._backend.size() if hasattr(self._backend, "size") else None
        return {
            **self._stats,
            "backend": type(self._backend).__name__,
            "backend_size": size,
            "retrieval_ttl_sec": self._retrieval_ttl,
            "embedding_ttl_sec": self._embedding_ttl,
            "has_retriever_cache": self.vector_store_cache._retriever_cache is not None,
            "last_update_time": self.vector_store_cache._last_update_time,
        }

    # ── Key derivation ────────────────────────────────────────────────────

    @staticmethod
    def _retrieval_key(query: str, k: Optional[int]) -> str:
        norm = normalize_query(query)
        digest = hashlib.md5(norm.encode("utf-8")).hexdigest()
        return f"q:{digest}:k={k}" if k is not None else f"q:{digest}"

    @staticmethod
    def _embedding_key(query: str) -> str:
        norm = normalize_query(query)
        digest = hashlib.md5(norm.encode("utf-8")).hexdigest()
        return f"emb:v4:{digest}"
