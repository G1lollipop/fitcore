"""
Chroma + BM25 hybrid retrieval (default backend).
"""

from __future__ import annotations

from langchain_chroma import Chroma
from langchain_classic.retrievers import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever
from langchain_core.documents import Document

from app.core import constants as config
from app.infra.cache import CacheManager


class VectorStoreService(object):
    def __init__(self, embedding, cache_manager: CacheManager = None):
        self.embedding = embedding
        self.cache_manager = cache_manager or CacheManager()

        self.vector_store = Chroma(
            collection_name=config.collection_name,
            embedding_function=self.embedding,
            persist_directory=config.persist_directory,
        )

    def _fetch_all_chunks(self) -> dict:
        """Page through the whole collection.

        A single Chroma `.get()` binds every row at once and trips SQLite's
        max-variables limit once the corpus is large (~10k+ chunks → "too many
        SQL variables"). Paginating with limit/offset keeps each query small so
        BM25 index building scales to the full local corpus.
        """
        documents: list[str] = []
        metadatas: list[dict] = []
        page = 1000
        offset = 0
        while True:
            batch = self.vector_store.get(limit=page, offset=offset)
            docs = batch.get("documents") or []
            metas = batch.get("metadatas") or []
            if not docs:
                break
            documents.extend(docs)
            metadatas.extend(metas)
            if len(docs) < page:
                break
            offset += page
        return {"documents": documents, "metadatas": metadatas}

    def get_retriever(self):
        # 1. Vector retriever (Vector Search)
        # Widen the candidate count (k) to 10 to leave room for later reranking.
        chroma_retriever = self.vector_store.as_retriever(search_kwargs={"k": 10})

        # 2. Keyword retriever (BM25)
        # Load all documents from Chroma in pages to build the index (full load;
        # paging avoids the SQLite variable limit).
        all_docs_data = self._fetch_all_chunks()
        docs_list = all_docs_data.get("documents", [])
        metadatas_list = all_docs_data.get("metadatas", [])

        if not docs_list:
            return chroma_retriever

        cached_retriever = self.cache_manager.vector_store_cache.get_cached_retriever(
            self.vector_store, self.embedding, all_docs_data
        )

        if cached_retriever is not None:
            return cached_retriever

        documents = [
            Document(page_content=text, metadata=meta or {})
            for text, meta in zip(docs_list, metadatas_list)
        ]

        bm25_retriever = BM25Retriever.from_documents(documents)
        bm25_retriever.k = 10

        # 3. Hybrid retrieval (Ensemble). Weights controlled by RETRIEVAL_VECTOR_WEIGHT (default 0.5/0.5).
        from app.core.settings import get_settings

        ensemble_retriever = EnsembleRetriever(
            retrievers=[chroma_retriever, bm25_retriever],
            weights=get_settings().ensemble_weights,
        )

        docs_hash = self.cache_manager.vector_store_cache._compute_docs_hash(docs_list)
        self.cache_manager.vector_store_cache.set_cached_retriever(
            ensemble_retriever, docs_hash
        )

        return ensemble_retriever
