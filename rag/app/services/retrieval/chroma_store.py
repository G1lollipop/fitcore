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

    def get_retriever(self):
        # 1. 向量检索器 (Vector Search)
        # 我们把候选数量(k)放大到 10，给后面的重排序留出筛选空间
        chroma_retriever = self.vector_store.as_retriever(
            search_kwargs={"k": 10}
        )

        # 2. 关键词检索器 (BM25)
        # 注意：这需要从 Chroma 中加载现有文档来构建索引。
        # 对于简历级别的项目（数据量 < 10万条），这种全量加载是完全可行的。
        all_docs_data = self.vector_store.get()
        docs_list = all_docs_data.get('documents', [])
        metadatas_list = all_docs_data.get('metadatas', [])

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

        # 3. 混合检索 (Ensemble)。权重由 RETRIEVAL_VECTOR_WEIGHT 控制（默认 0.5/0.5）。
        from app.core.settings import get_settings

        ensemble_retriever = EnsembleRetriever(
            retrievers=[chroma_retriever, bm25_retriever],
            weights=get_settings().ensemble_weights,
        )

        docs_hash = self.cache_manager.vector_store_cache._compute_docs_hash(docs_list)
        self.cache_manager.vector_store_cache.set_cached_retriever(
            ensemble_retriever, bm25_retriever, docs_hash
        )

        return ensemble_retriever

    def invalidate_cache(self):
        self.cache_manager.vector_store_cache.invalidate()
        self.cache_manager.invalidate_query_cache()
