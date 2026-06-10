"""
Knowledge-base ingestion service: text/file → chunks → vector store.
"""

import os
from datetime import datetime
from typing import Any, Dict, Optional

from langchain_chroma import Chroma
from langchain_core.embeddings import Embeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core import constants as config
from app.core.settings import get_settings
from app.infra.cache import CacheManager
from app.infra.embeddings import get_embedding


def _build_text_splitter(embedding: Embeddings):
    """Return the configured text splitter.

    CHUNKING_STRATEGY=semantic uses the embedding-based SemanticChunker, which
    splits where the meaning shifts (better recall on long docs). It needs
    langchain-experimental (ingest-only dep) — if that's missing or fails to
    init, we transparently fall back to the recursive char splitter so ingest
    never breaks. Both expose split_text(text) -> list[str].
    """
    settings = get_settings()
    if (settings.chunking_strategy or "").strip().lower() == "semantic":
        try:
            from langchain_experimental.text_splitter import SemanticChunker

            print(
                "[kb] chunking=semantic "
                f"(breakpoint_threshold_type={settings.semantic_breakpoint_type})"
            )
            return SemanticChunker(
                embedding,
                breakpoint_threshold_type=settings.semantic_breakpoint_type,
            )
        except Exception as exc:  # noqa: BLE001 (ingest path — degrade gracefully)
            print(
                f"[kb] SemanticChunker unavailable ({exc}); "
                "falling back to RecursiveCharacterTextSplitter"
            )

    return RecursiveCharacterTextSplitter(
        chunk_size=config.chunk_size,
        chunk_overlap=config.chunk_overlap,
        separators=config.separators,
        length_function=len,
    )
from app.infra.supabase_client import (
    get_supabase_client,
    supabase_configured,
    vector_backend,
)
from app.ingest.md5_store import check_md5, get_string_md5, save_md5
from app.ingest.supabase_writer import delete_chunks_for_source, insert_chunks
from parsers import FileParserFactory


class KnowledgeBaseService(object):
    def __init__(self, cache_manager: CacheManager = None):
        os.makedirs(config.persist_directory, exist_ok=True)

        self.cache_manager = cache_manager
        self._backend = vector_backend()
        if self._backend == "supabase" and not supabase_configured():
            raise RuntimeError(
                "VECTOR_BACKEND=supabase 但未设置 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY"
            )
        self._use_supabase = self._backend == "supabase"
        self._embedding = get_embedding()

        self.chroma = None
        if not self._use_supabase:
            self.chroma = Chroma(
                collection_name=config.collection_name,
                embedding_function=self._embedding,
                persist_directory=config.persist_directory,
            )
        self.spliter = _build_text_splitter(self._embedding)

    def upload_by_str(
        self,
        data: str,
        filename: str,
        extra_metadata: Optional[Dict[str, Any]] = None,
        *,
        ignore_md5: bool = False,
    ) -> str:
        """
        上传文本内容到知识库。

        Args:
            data: 文本内容
            filename: 文件名（用于标识来源）
            extra_metadata: 额外的元数据（如 URL、作者、来源站点等）
            ignore_md5: 为 True 时跳过 md5.text 去重
        """
        md5_hex = get_string_md5(data)

        if not ignore_md5 and check_md5(md5_hex):
            return "[跳过]内容已经存在知识库中"

        if len(data) > config.max_split_char_number:
            knowledge_chunks: list[str] = self.spliter.split_text(data)
        else:
            knowledge_chunks = [data]

        metadata = {
            "source": filename,
            "create_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "operator": "Herbert",
        }

        if extra_metadata:
            metadata.update(extra_metadata)

        if self._use_supabase:
            client = get_supabase_client()
            delete_chunks_for_source(client, filename)
            vectors = self._embedding.embed_documents(list(knowledge_chunks))
            insert_chunks(
                client,
                source=filename,
                chunks=knowledge_chunks,
                embeddings=vectors,
                base_metadata=metadata,
            )
        else:
            # Replace-by-source: delete any existing chunks from this file
            # before re-adding, so a forced re-ingest doesn't append duplicates
            # (which would also skew the in-memory BM25 corpus). Supabase path
            # already does this via delete_chunks_for_source above.
            try:
                self.chroma.delete(where={"source": filename})
            except Exception as exc:  # noqa: BLE001
                # First ingest (nothing to delete) or older chroma without
                # where-delete: safe to continue with the add.
                print(f"[kb] chroma delete-by-source skipped for {filename}: {exc}")
            self.chroma.add_texts(
                knowledge_chunks,
                metadatas=[metadata for _ in knowledge_chunks],
            )

        if not check_md5(md5_hex):
            save_md5(md5_hex)

        if self.cache_manager:
            self.cache_manager.invalidate_all()

        return f"[成功]内容已经成功载入向量库（{len(knowledge_chunks)} 个片段）"

    def upload_file(
        self,
        file_content: bytes,
        filename: str,
        mime_type: Optional[str] = None,
        extra_metadata: Optional[Dict[str, Any]] = None,
        *,
        ignore_md5: bool = False,
    ) -> Dict[str, Any]:
        """
        上传文件到知识库（支持多种文件格式）。
        """
        parse_result = FileParserFactory.parse_file(file_content, filename, mime_type)

        if not parse_result['success']:
            return {
                'success': False,
                'message': f"[失败]文件解析失败: {parse_result.get('error', '未知错误')}",
                'parsed_metadata': parse_result.get('metadata', {}),
            }

        parsed_metadata = parse_result.get('metadata', {})
        if extra_metadata:
            parsed_metadata.update(extra_metadata)

        text = parse_result['text']
        if not text or not text.strip():
            return {
                'success': False,
                'message': "[失败]文件内容为空",
                'parsed_metadata': parsed_metadata,
            }

        result_message = self.upload_by_str(
            text, filename, extra_metadata=parsed_metadata, ignore_md5=ignore_md5
        )

        return {
            'success': True,
            'message': result_message,
            'parsed_metadata': parsed_metadata,
        }
