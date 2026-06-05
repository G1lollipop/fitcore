"""
Shared FastAPI dependencies: API-key auth and a lightweight in-process rate
limiter for the public chat/retrieve endpoints.

Both are opt-in via settings so local development and the test suite run with no
configuration:
  - RAG_API_KEY unset  → no auth check
  - RAG_RATE_LIMIT_PER_MIN = 0 → no rate limiting
"""

from __future__ import annotations

import time
from collections import deque
from threading import Lock

from fastapi import Header, HTTPException, Request

from app.core.settings import get_settings


async def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Reject requests whose X-API-Key header does not match RAG_API_KEY.

    No-op when RAG_API_KEY is empty (default), preserving open local/dev use.
    """
    expected = get_settings().rag_api_key
    if not expected:
        return
    if not x_api_key or x_api_key != expected:
        raise HTTPException(status_code=401, detail="unauthorized")


class _SlidingWindowLimiter:
    """Per-key sliding-window counter. In-process only (per worker)."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._lock = Lock()

    def allow(self, key: str, limit: int, window_sec: float = 60.0) -> bool:
        now = time.monotonic()
        cutoff = now - window_sec
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and q[0] < cutoff:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True


_limiter = _SlidingWindowLimiter()


async def rate_limit(request: Request) -> None:
    """Enforce RAG_RATE_LIMIT_PER_MIN requests/minute per client IP.

    No-op when the limit is 0 (default).
    """
    limit = get_settings().rag_rate_limit_per_min
    if limit <= 0:
        return
    client = request.client.host if request.client else "unknown"
    if not _limiter.allow(client, limit):
        raise HTTPException(status_code=429, detail="rate limit exceeded")
