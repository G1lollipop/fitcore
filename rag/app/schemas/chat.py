"""
Request / response schemas for /v1/chat and /api/chat (legacy).

LOCKED CONTRACT — field names and types must match the published frontend.
"""
from typing import Any

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    query: str | None = None
    message: str | None = None
    sessionId: str = "anonymous"
    userContext: dict[str, Any] = Field(default_factory=dict)
    topK: int | None = None  # None = 自适应；1-20 = 显式指定


class Citation(BaseModel):
    id: str | None = None
    title: str
    source: str
    snippet: str
    score: float | None = None


class RetrievalMeta(BaseModel):
    retrievedCount: int = 0


class StructuredChatResponse(BaseModel):
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    retrievalMeta: RetrievalMeta = Field(default_factory=RetrievalMeta)
    retrievalBackend: str | None = None


class LegacyChatResponse(BaseModel):
    response: str
