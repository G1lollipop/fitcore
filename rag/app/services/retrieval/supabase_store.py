"""
Supabase pgvector retrieval (vector RPC + BM25 ensemble), mirrors chroma_store.
"""

from __future__ import annotations

from typing import Any

from langchain_classic.retrievers import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from pydantic import ConfigDict

from app.infra.cache import CacheManager
from app.infra.supabase_client import Client, get_supabase_client


def fetch_all_chunk_documents(client: Client) -> list[Document]:
    """Load all chunks for BM25 (small KB only, same assumption as Chroma path)."""
    out: list[Document] = []
    page_size = 1000
    start = 0
    while True:
        q = (
            client.table("rag_kb_chunks")
            .select("content,source,title,doc_metadata,id")
            .order("source")
            .order("chunk_index")
            .range(start, start + page_size - 1)
        )
        res = q.execute()
        rows = res.data or []
        if not rows:
            break
        for row in rows:
            meta = dict(row.get("doc_metadata") or {})
            meta.setdefault("source", row.get("source"))
            meta.setdefault("title", row.get("title"))
            meta.setdefault("id", row.get("id"))
            out.append(Document(page_content=row["content"] or "", metadata=meta))
        if len(rows) < page_size:
            break
        start += page_size
    return out


def match_chunks_to_documents(
    client: Client,
    query_embedding: list[float],
    match_count: int = 10,
) -> list[Document]:
    res = client.rpc(
        "match_rag_kb_chunks",
        {"query_embedding": query_embedding, "match_count": match_count},
    ).execute()
    rows = res.data or []
    docs: list[Document] = []
    for row in rows:
        meta = dict(row.get("doc_metadata") or {})
        meta["source"] = row.get("source") or meta.get("source")
        meta["title"] = row.get("title") or meta.get("title")
        meta["id"] = row.get("id")
        if row.get("distance") is not None:
            meta["relevance_score"] = 1.0 - float(row["distance"])
        docs.append(Document(page_content=row.get("content") or "", metadata=meta))
    return docs


class SupabaseSimilarityRetriever(BaseRetriever):
    """Cosine similarity via Supabase RPC `match_rag_kb_chunks`."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    client: Any
    embedding: Any
    k: int = 10

    def _get_relevant_documents(
        self,
        query: str,
        *,
        run_manager: CallbackManagerForRetrieverRun | None = None,
    ) -> list[Document]:
        qv = self.embedding.embed_query(query)
        return match_chunks_to_documents(self.client, qv, match_count=self.k)


class SupabaseVectorStoreService:
    def __init__(self, embedding, cache_manager: CacheManager | None = None):
        self.embedding = embedding
        self.cache_manager = cache_manager or CacheManager()
        self.client = get_supabase_client()

    def get_retriever(self):
        pg_retriever = SupabaseSimilarityRetriever(
            client=self.client, embedding=self.embedding, k=10
        )

        documents = fetch_all_chunk_documents(self.client)
        docs_list = [d.page_content for d in documents]
        metadatas_list = [d.metadata for d in documents]
        all_docs_data = {"documents": docs_list, "metadatas": metadatas_list}

        if not docs_list:
            return pg_retriever

        cached_retriever = self.cache_manager.vector_store_cache.get_cached_retriever(
            self, self.embedding, all_docs_data
        )
        if cached_retriever is not None:
            return cached_retriever

        bm25_retriever = BM25Retriever.from_documents(documents)
        bm25_retriever.k = 10

        from app.core.settings import get_settings

        ensemble_retriever = EnsembleRetriever(
            retrievers=[pg_retriever, bm25_retriever],
            weights=get_settings().ensemble_weights,
        )

        docs_hash = self.cache_manager.vector_store_cache._compute_docs_hash(docs_list)
        self.cache_manager.vector_store_cache.set_cached_retriever(
            ensemble_retriever, docs_hash
        )
        return ensemble_retriever
