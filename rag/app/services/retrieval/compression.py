"""
Reranker (CrossEncoder) configuration + a CachedCompressionRetriever wrapper.

torch is loaded lazily — RERANKER_ENABLED=false keeps the production image
small (no torch / sentence-transformers needed).
"""

from __future__ import annotations

import os

from langchain_classic.retrievers import ContextualCompressionRetriever
from pydantic import PrivateAttr

from app.core.settings import get_settings
from app.infra.cache import CacheManager


def is_probable_local_path(model_ref: str) -> bool:
    if not model_ref:
        return False
    if model_ref.startswith(".") or model_ref.startswith("/"):
        return True
    if model_ref.startswith("\\\\"):
        return True
    if len(model_ref) > 2 and model_ref[1] == ":":
        return True
    return os.path.exists(model_ref)


class CachedCompressionRetriever(ContextualCompressionRetriever):
    """带缓存的压缩检索器"""

    _cache_manager: CacheManager = PrivateAttr()

    def __init__(self, base_compressor, base_retriever, cache_manager: CacheManager):
        super().__init__(base_compressor=base_compressor, base_retriever=base_retriever)
        object.__setattr__(self, "_cache_manager", cache_manager)

    def invoke(self, query: str, config=None, **kwargs):
        # The reranker always returns its top_n=10 — k-independent — so the
        # cache key is just the query. Previously this was hardcoded to k=3,
        # which was misleading (suggested k mattered) without changing keys.
        cached_results = self._cache_manager.get_cached_query(query)
        if cached_results is not None:
            return cached_results

        results = super().invoke(query, config=config, **kwargs)
        self._cache_manager.set_cached_query(query, results)
        return results


def build_compression_retriever(
    base_retriever,
    cache_manager: CacheManager,
) -> ContextualCompressionRetriever | None:
    """
    Build a (Cached)ContextualCompressionRetriever or return None when reranker
    is disabled / unavailable so the caller can fall back to the base retriever.
    """
    settings = get_settings()
    if not settings.reranker_enabled:
        print("[RagService] Reranker 已通过环境变量关闭，使用基础检索")
        return None

    model_ref = settings.reranker_model_ref
    if not model_ref:
        print("[RagService] 未配置 Reranker 模型引用，已降级为基础检索")
        return None

    if is_probable_local_path(model_ref) and not os.path.exists(model_ref):
        print(f"[RagService] Reranker 本地路径不存在，已降级为基础检索: {model_ref}")
        return None

    # 懒加载：torch / sentence-transformers 只在 RERANKER_ENABLED=true 且配置了
    # 模型时才尝试导入。生产镜像 (requirements-prod.txt) 不安装这些包，所以
    # 这里的 ImportError 是预期的「云端轻量模式」信号，不是错误。
    try:
        from langchain_classic.retrievers.document_compressors import CrossEncoderReranker
        from langchain_community.cross_encoders import HuggingFaceCrossEncoder
    except ImportError as exc:
        print(
            "[RagService] Reranker 依赖未安装 (torch / sentence-transformers)，"
            f"已降级为基础检索 (Vector + BM25)。安装 requirements.txt 可启用重排序。详情: {exc}"
        )
        return None

    try:
        model_kwargs = settings.reranker_model_kwargs
        model = HuggingFaceCrossEncoder(model_name=model_ref, model_kwargs=model_kwargs)
        # top_n=10：重排序后返回全部候选（动态裁剪在 chat() 里做）
        compressor = CrossEncoderReranker(model=model, top_n=10)
        print(f"[RagService] Reranker 已启用: {model_ref} model_kwargs={model_kwargs}")
    except Exception as exc:  # noqa: BLE001 (startup path)
        print(f"[RagService] Reranker 初始化失败，已降级为基础检索: {exc}")
        return None

    return CachedCompressionRetriever(
        base_compressor=compressor,
        base_retriever=base_retriever,
        cache_manager=cache_manager,
    )
