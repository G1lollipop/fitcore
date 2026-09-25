"""
Knowledge-base ingestion service: text/file → chunks → vector store.
"""

import os
import time
from datetime import datetime
from typing import Any, Dict, Optional

from langchain_chroma import Chroma
from langchain_core.embeddings import Embeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core import constants as config
from app.core.settings import get_settings
from app.infra.cache import CacheManager
from app.infra.embeddings import get_embedding

# The Gemini free tier caps embedding at 100 requests/min. Embedding a long
# doc's chunks back-to-back blows that instantly, so ingest in sub-batches with
# a pause + 429 backoff. Lets large CC-BY papers ingest without manual retries.
# Sub-batch kept modest (vs the per-minute cap) so each HTTP request payload is
# small enough that the upstream TLS connection doesn't get dropped mid-request.
_EMBED_SUB_BATCH = 50
_EMBED_PAUSE_SEC = 61
_EMBED_MAX_RETRIES = 6
# Transient network/TLS hiccups (Gemini occasionally drops the connection on
# larger batches). Retry these too — with a short backoff, not the 61s quota
# pause — so one flaky request doesn't fail the whole document.
_EMBED_NET_BACKOFF_SEC = 5
_EMBED_TRANSIENT_SIGNALS = (
    "SSL",
    "UNEXPECTED_EOF",
    "EOF occurred",
    "Connection",
    "ConnectionError",
    "RemoteDisconnected",
    "timed out",
    "timeout",
    "ServiceUnavailable",
    "503",
    "Max retries",
)


def _embed_documents_throttled(
    embedding: Embeddings, chunks: list[str]
) -> list[list[float]]:
    vectors: list[list[float]] = []
    total = len(chunks)
    for start in range(0, total, _EMBED_SUB_BATCH):
        batch = chunks[start : start + _EMBED_SUB_BATCH]
        for attempt in range(_EMBED_MAX_RETRIES):
            try:
                vectors.extend(embedding.embed_documents(batch))
                break
            except Exception as exc:  # noqa: BLE001 (retry on rate-limit / transient net)
                msg = str(exc)
                # Distinguish the daily wall from the per-minute (RPM) limit:
                # both are RESOURCE_EXHAUSTED on the same free_tier metric, but
                # only the daily quota (quotaId ...PerDay..., limit 1000) is worth
                # aborting on — the per-minute one (limit 100) just needs the 61s
                # wait below. Fast-fail the daily wall so we don't burn 6×61s of
                # pointless retries per remaining doc.
                is_daily_quota = ("RESOURCE_EXHAUSTED" in msg or "429" in msg) and (
                    "PerDay" in msg or "limit: 1000" in msg
                )
                if is_daily_quota:
                    print(
                        f"[kb] Daily embedding quota exhausted on chunks {start}-{start + len(batch)}! Stopping immediately."
                    )
                    raise exc
                is_quota = "RESOURCE_EXHAUSTED" in msg or "429" in msg
                is_transient = any(sig in msg for sig in _EMBED_TRANSIENT_SIGNALS)
                if (is_quota or is_transient) and attempt < _EMBED_MAX_RETRIES - 1:
                    if is_quota:
                        wait = _EMBED_PAUSE_SEC
                        reason = "quota hit"
                    else:
                        wait = _EMBED_NET_BACKOFF_SEC * (attempt + 1)
                        reason = "transient network error"
                    print(
                        f"[kb] embedding {reason} on chunks {start}-{start + len(batch)}; "
                        f"waiting {wait}s then retrying ({attempt + 1})..."
                    )
                    time.sleep(wait)
                    continue
                raise
        # Stay under the per-minute cap before the next sub-batch.
        if start + _EMBED_SUB_BATCH < total:
            time.sleep(_EMBED_PAUSE_SEC)
    return vectors


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
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
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
                "VECTOR_BACKEND=supabase but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set"
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
        Upload text content to the knowledge base.

        Args:
            data: Text content
            filename: File name (used to identify the source)
            extra_metadata: Extra metadata (e.g. URL, author, source site)
            ignore_md5: When True, skip md5.text deduplication
        """
        md5_hex = get_string_md5(data)

        if not ignore_md5 and check_md5(md5_hex):
            return "[Skipped] Content already exists in the knowledge base"

        if len(data) > config.max_split_char_number:
            knowledge_chunks: list[str] = self.spliter.split_text(data)
        else:
            knowledge_chunks = [data]

        # Drop empty / whitespace-only chunks — the embedding API rejects empty
        # content ("contains an empty Part"), and they add no retrieval value.
        knowledge_chunks = [c for c in knowledge_chunks if c and c.strip()]
        if not knowledge_chunks:
            return "[Skipped] No valid content after splitting"

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
            vectors = _embed_documents_throttled(
                self._embedding, list(knowledge_chunks)
            )
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

        return f"[Success] Content loaded into the vector store ({len(knowledge_chunks)} chunks)"

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
        Upload a file to the knowledge base (supports multiple file formats).
        """
        parse_result = FileParserFactory.parse_file(file_content, filename, mime_type)

        if not parse_result["success"]:
            return {
                "success": False,
                "message": f"[Failed] File parsing failed: {parse_result.get('error', 'Unknown error')}",
                "parsed_metadata": parse_result.get("metadata", {}),
            }

        parsed_metadata = parse_result.get("metadata", {})
        if extra_metadata:
            parsed_metadata.update(extra_metadata)

        text = parse_result["text"]
        if not text or not text.strip():
            return {
                "success": False,
                "message": "[Failed] File content is empty",
                "parsed_metadata": parsed_metadata,
            }

        result_message = self.upload_by_str(
            text, filename, extra_metadata=parsed_metadata, ignore_md5=ignore_md5
        )

        return {
            "success": True,
            "message": result_message,
            "parsed_metadata": parsed_metadata,
        }
