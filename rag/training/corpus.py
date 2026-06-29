"""
Shared corpus loader + chunker for the reranker training pipeline.

Loads the same ``data/{kb,auto}_*.txt`` files the ingest pipeline uses and
splits them with the identical ``RecursiveCharacterTextSplitter`` (chunk_size /
overlap from ``app.core.constants``), so the ``(query, chunk)`` pairs we train
the cross-encoder on match what the live retriever actually returns at serving
time. ``source`` == the file name, matching the metadata the vector store keeps
and the golden set's ``relevant_sources`` anchors.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from glob import glob
from pathlib import Path

RAG_ROOT = Path(__file__).resolve().parents[1]
if str(RAG_ROOT) not in sys.path:
    sys.path.insert(0, str(RAG_ROOT))

from langchain_text_splitters import RecursiveCharacterTextSplitter  # noqa: E402

from app.core import constants as config  # noqa: E402

DATA_DIR = RAG_ROOT / "data"
DEFAULT_PATTERNS = ["kb_*.txt", "auto_*.txt"]


@dataclass(frozen=True)
class Chunk:
    """A single retrievable unit: file-level ``source`` + its chunk text."""

    source: str
    chunk_index: int
    text: str

    @property
    def uid(self) -> str:
        return f"{self.source}#{self.chunk_index}"


def _splitter() -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(
        chunk_size=config.chunk_size,
        chunk_overlap=config.chunk_overlap,
        separators=config.separators,
        length_function=len,
    )


def load_corpus_chunks(patterns: list[str] | None = None) -> list[Chunk]:
    """Load + chunk every matching KB file under ``rag/data``.

    Mirrors ``KnowledgeBaseService.upload_by_str``: files shorter than
    ``max_split_char_number`` are kept whole; longer ones are recursively split.
    Empty/whitespace chunks are dropped (the embedding API rejects them and they
    carry no retrieval value).
    """
    pats = patterns or DEFAULT_PATTERNS
    files: list[Path] = []
    for pat in pats:
        files.extend(Path(p) for p in sorted(glob(str(DATA_DIR / pat))))

    splitter = _splitter()
    chunks: list[Chunk] = []
    for path in files:
        text = path.read_text(encoding="utf-8", errors="ignore")
        if not text.strip():
            continue
        parts = (
            splitter.split_text(text)
            if len(text) > config.max_split_char_number
            else [text]
        )
        idx = 0
        for part in parts:
            if part and part.strip():
                chunks.append(
                    Chunk(source=path.name, chunk_index=idx, text=part.strip())
                )
                idx += 1
    return chunks


def group_by_source(chunks: list[Chunk]) -> dict[str, list[Chunk]]:
    out: dict[str, list[Chunk]] = {}
    for c in chunks:
        out.setdefault(c.source, []).append(c)
    return out
