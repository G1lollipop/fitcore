"""
Request / response schemas for /v1/retrieve.

LOCKED CONTRACT — field names and types must match the published frontend.
"""

from typing import Any

from pydantic import BaseModel, Field


class RetrieveRequest(BaseModel):
    query: str
    sessionId: str = "anonymous"
    userContext: dict[str, Any] = Field(default_factory=dict)
    topK: int = 5


class RetrieveChunk(BaseModel):
    id: str | None = None
    title: str
    source: str
    snippet: str
    score: float | None = None


class RetrieveResponse(BaseModel):
    chunks: list[RetrieveChunk]
