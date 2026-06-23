"""
Citation builder used by both /v1/chat (after RAG generation) and /v1/retrieve.
"""

from typing import Any

from langchain_core.documents import Document


def build_citations(docs: list[Document]) -> list[dict[str, Any]]:
    citations: list[dict[str, Any]] = []
    for index, doc in enumerate(docs):
        metadata = doc.metadata or {}
        title = (
            metadata.get("title")
            or metadata.get("file_name")
            or metadata.get("source")
            or f"Reference {index + 1}"
        )
        source = (
            metadata.get("source")
            or metadata.get("file_path")
            or metadata.get("url")
            or title
        )
        snippet = " ".join(doc.page_content.split())[:180]
        score = metadata.get("relevance_score") or metadata.get("score")
        citations.append(
            {
                "id": metadata.get("id") or metadata.get("doc_id"),
                "title": str(title),
                "source": str(source),
                "snippet": snippet,
                "score": score,
            }
        )
    return citations
