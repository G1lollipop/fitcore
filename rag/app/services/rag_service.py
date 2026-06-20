"""
RagService — orchestration layer.

Brings together: vector retrieval (Chroma or Supabase), optional reranker,
prompt template, history store, and the chat LLM. Stateless across requests
apart from the lazily-built compression retriever.
"""

import threading
from typing import Any

from langchain_classic.retrievers import ContextualCompressionRetriever
from langchain_core.documents import Document
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import (
    RunnableLambda,
    RunnablePassthrough,
    RunnableWithMessageHistory,
)

from app.core.settings import get_settings
from app.infra.cache import CacheManager
from app.infra.embeddings import get_embedding
from app.infra.supabase_client import supabase_configured, vector_backend
from app.prompts.rag_chat import RAG_CHAT_PROMPT
from app.services.citations import build_citations
from app.services.history_store import get_history
from app.services.retrieval.adaptive_k import compute_retrieval_k
from app.services.retrieval.compression import build_compression_retriever
from app.services.retrieval.factory import resolve_vector_store_service


class RagService(object):
    def __init__(self, cache_manager: CacheManager = None):
        settings = get_settings()
        self.cache_manager = cache_manager or CacheManager()
        # Pass the cache manager so embed_query results are cached. The same
        # CacheManager also handles reranker output and corpus-hash-driven
        # invalidation, so all caches stay coherent.
        self.vector_service = resolve_vector_store_service(
            embedding=get_embedding(self.cache_manager),
            cache_manager=self.cache_manager,
        )
        if vector_backend() == "supabase" and supabase_configured():
            print("[RagService] 向量库后端: Supabase pgvector")
        else:
            print("[RagService] 向量库后端: Chroma (本地)")
        self.base_retriever = self.vector_service.get_retriever()
        self._compression_retriever: ContextualCompressionRetriever | None = None
        self._compression_retriever_lock = threading.Lock()
        # Sticky flag: once build_compression_retriever() returns None we stop
        # retrying on every request. Without this, RERANKER_ENABLED=false would
        # re-enter the build path (and re-print its降级 message) per query.
        self._compression_attempted: bool = False
        self.prompt_template = RAG_CHAT_PROMPT
        if not settings.llm_api_key:
            raise RuntimeError(
                "LLM API key is not set (GOOGLE_AI_STUDIO_API_KEY); cannot build chat model"
            )
        self.chat_model = ChatOpenAI(
            model=settings.rag_chat_model,
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
        )
        self.chain = self.__get_chain()

    def warmup(self) -> None:
        """
        Eagerly build the compression retriever (loads the reranker model) and
        log the resolved retrieval mode so operators see immediately whether
        the deployment is running in reranked or base-only mode.

        BM25 is already built by __init__'s call to vector_service.get_retriever().
        Called from FastAPI lifespan so the first user request doesn't pay
        a multi-second torch / ensemble warmup.
        """
        retriever = self._get_compression_retriever()
        if retriever is not None:
            print(
                "[RagService] 检索模式: Reranker (Vector + BM25 + CrossEncoder rerank)"
            )
        else:
            print(
                "[RagService] 检索模式: Base retrieval (Vector + BM25 ensemble; reranker 未启用)"
            )

    def _get_compression_retriever(self) -> ContextualCompressionRetriever | None:
        """Returns the compression retriever, or None if reranker is disabled /
        unavailable. Sticky None — once we've decided "no reranker," every
        subsequent call short-circuits without re-running the build path."""
        if self._compression_retriever is not None:
            return self._compression_retriever
        if self._compression_attempted:
            return None

        with self._compression_retriever_lock:
            if self._compression_retriever is not None:
                return self._compression_retriever
            if self._compression_attempted:
                return None
            self._compression_retriever = build_compression_retriever(
                self.base_retriever, self.cache_manager
            )
            self._compression_attempted = True

        return self._compression_retriever

    @staticmethod
    def _format_documents(docs: list[Document]) -> str:
        if not docs:
            return "没有找到相关参考资料。"

        formatted_str = ""
        for i, doc in enumerate(docs):
            formatted_str += f"[资料{i + 1}] {doc.page_content}\n"
        return formatted_str

    @staticmethod
    def _format_user_context(user_context: Any) -> str:
        if not user_context:
            return "暂无可用的个性化上下文。"

        if isinstance(user_context, str):
            return user_context

        if not isinstance(user_context, dict):
            return str(user_context)

        lines: list[str] = []

        def append_section(title: str, value: Any):
            if not value:
                return
            if isinstance(value, dict):
                lines.append(f"{title}:")
                for key, item in value.items():
                    if item is None or item == "":
                        continue
                    lines.append(f"- {key}: {item}")
                return
            lines.append(f"{title}: {value}")

        append_section("用户画像", user_context.get("profile"))
        append_section("当前目标", user_context.get("targets"))
        append_section("今日数据", user_context.get("today"))
        append_section("计划信息", user_context.get("plan"))

        if not lines:
            return "暂无可用的个性化上下文。"

        return "\n".join(lines)

    @staticmethod
    def _build_citations(docs: list[Document]) -> list[dict[str, Any]]:
        return build_citations(docs)

    def __get_chain(self):
        def format_for_prompt_template(value: dict) -> dict[str, Any]:
            original_input = value["input"]
            return {
                "input": original_input["input"],
                "context": value["context"],
                "history": original_input.get("history", []),
                "user_context": self._format_user_context(
                    original_input.get("user_context")
                ),
            }

        chain = (
            {
                "input": RunnablePassthrough(),
                "context": lambda x: x["context"],
            }
            | RunnableLambda(format_for_prompt_template)
            | self.prompt_template
            | self.chat_model
            | StrOutputParser()
        )

        return RunnableWithMessageHistory(
            chain,
            get_history,
            input_messages_key="input",
            history_messages_key="history",
        )

    def retrieve(self, query: str, k: int) -> list[Document]:
        """
        Public retrieval path used by /v1/retrieve. Honors the reranker if
        configured; otherwise returns the base ensemble's results.
        """
        compression = self._get_compression_retriever()
        retriever = compression or self.base_retriever
        docs = retriever.invoke(query)
        return docs[:k]

    @staticmethod
    def _top_relevance_score(docs: list[Document]) -> float | None:
        if not docs:
            return None
        meta = docs[0].metadata or {}
        score = meta.get("relevance_score")
        if score is None:
            score = meta.get("score")
        return float(score) if isinstance(score, (int, float)) else None

    @staticmethod
    def _should_abstain_retrieval(
        docs: list[Document], threshold: float
    ) -> tuple[bool, float | None]:
        """
        Score-gated abstention. Only applies when threshold > 0 AND a comparable
        top-1 score exists (e.g. Supabase pgvector). Ensemble-only Chroma skips.
        """
        if threshold <= 0:
            return False, RagService._top_relevance_score(docs)
        top_score = RagService._top_relevance_score(docs)
        if top_score is None:
            return False, None
        if not docs or top_score < threshold:
            return True, top_score
        return False, top_score

    def chat(
        self,
        query: str,
        session_id: str,
        user_context: dict[str, Any] | None = None,
        top_k: int | None = None,
    ) -> dict[str, Any]:
        # 动态确定最终使用的文档数。
        # top_k 为 None 时自动根据查询复杂度计算，也支持调用方显式指定。
        k = (
            top_k
            if (top_k is not None and 1 <= top_k <= 20)
            else compute_retrieval_k(query)
        )

        session_config = {"configurable": {"session_id": session_id}}
        docs = self.retrieve(query, k)

        settings = get_settings()
        abstained, top_score = self._should_abstain_retrieval(
            docs, settings.retrieval_min_score
        )

        if abstained:
            context = (
                "No relevant reference materials were found in the knowledge base "
                "for this question (retrieval confidence below threshold). "
                "State clearly that there is insufficient evidence — do not invent facts."
            )
            citations: list[dict[str, Any]] = []
            retrieved_count = 0
        else:
            citations = build_citations(docs)
            context = self._format_documents(docs)
            retrieved_count = len(citations)

        answer = self.chain.invoke(
            {"input": query, "user_context": user_context or {}, "context": context},
            session_config,
        )
        return {
            "answer": answer,
            "citations": citations,
            "retrieval_meta": {
                "retrievedCount": retrieved_count,
                "k": k,
                "kAuto": top_k is None,
                "abstained": abstained,
                "topScore": top_score,
            },
        }
