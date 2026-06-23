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
    topK: int | None = None  # None = adaptive; 1-20 = explicit


class Citation(BaseModel):
    id: str | None = None
    title: str
    source: str
    snippet: str
    score: float | None = None


class RetrievalMeta(BaseModel):
    retrievedCount: int = 0
    k: int | None = None
    kAuto: bool | None = None
    abstained: bool | None = None
    topScore: float | None = None


class StructuredChatResponse(BaseModel):
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    retrievalMeta: RetrievalMeta = Field(default_factory=RetrievalMeta)
    retrievalBackend: str | None = None


class LegacyChatResponse(BaseModel):
    response: str
