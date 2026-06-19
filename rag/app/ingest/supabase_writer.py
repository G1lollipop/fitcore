"""
Supabase pgvector write paths: replace-by-source ingestion of chunk rows.
"""

from __future__ import annotations

import json
from typing import Any, Sequence

from app.infra.supabase_client import Client


def _json_safe_metadata(meta: dict[str, Any]) -> dict[str, Any]:
    def default(o: Any) -> str:
        return str(o)

    return json.loads(json.dumps(meta, default=default))


def delete_chunks_for_source(client: Client, source: str) -> None:
    client.table("rag_kb_chunks").delete().eq("source", source).execute()


def insert_chunks(
    client: Client,
    *,
    source: str,
    chunks: Sequence[str],
    embeddings: Sequence[Sequence[float]],
    base_metadata: dict[str, Any],
) -> int:
    if len(chunks) != len(embeddings):
        raise ValueError("chunks and embeddings length mismatch")

    title = (
        base_metadata.get("title") or base_metadata.get("file_name") or source
    ) or source
    rows: list[dict[str, Any]] = []
    for i, (text, emb) in enumerate(zip(chunks, embeddings)):
        meta = {**base_metadata, "chunk_index": i}
        rows.append(
            {
                "source": source,
                "chunk_index": i,
                "title": str(title)[:2000],
                "content": text,
                "embedding": list(emb),
                "doc_metadata": _json_safe_metadata(meta),
            }
        )

    batch = 80
    for start in range(0, len(rows), batch):
        client.table("rag_kb_chunks").insert(rows[start : start + batch]).execute()
    return len(rows)
