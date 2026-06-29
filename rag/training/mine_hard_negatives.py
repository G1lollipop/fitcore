"""
Mine hard negatives and build the cross-encoder train / val sets.

Reads ``training/data/pairs.jsonl`` (``query`` + ``positive`` chunk). For each
query it retrieves top-N candidates from the KB and keeps the ones from a
DIFFERENT source as **hard negatives** (lexically / semantically close but
wrong), plus a few random negatives for contrast. It then writes
``reranker_train.jsonl`` / ``reranker_val.jsonl`` as flat
``{query, passage, label}`` rows.

Leakage control
---------------
The train/val split is **document-level**: sources are partitioned, and every
sample (a positive and its mined negatives) is routed by its positive's source.
No source appears in both splits, so val measures generalization to unseen docs.

Retrieval backend for mining
-----------------------------
- default: in-memory BM25 over the freshly chunked corpus — needs no ingested
  store and no embedding API, yielding lexical hard negatives.
- ``--use-rag``: ALSO pull vector + BM25 candidates from the live ``RagService``
  (requires the vector store ingested + an embedding key) for tougher,
  semantically-confusable negatives.

Usage (from rag/):
    python training/mine_hard_negatives.py --neg-per-pos 4
    python training/mine_hard_negatives.py --use-rag --depth 20
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

from dotenv import load_dotenv

_TRAIN_DIR = Path(__file__).resolve().parent
RAG_ROOT = _TRAIN_DIR.parent
for _p in (str(RAG_ROOT), str(_TRAIN_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)
load_dotenv(RAG_ROOT / ".env")

from corpus import Chunk, load_corpus_chunks  # noqa: E402

DEFAULT_PAIRS = _TRAIN_DIR / "data" / "pairs.jsonl"
DEFAULT_OUT_DIR = _TRAIN_DIR / "data"


def _load_pairs(path: Path) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(
            f"pairs file not found: {path} — run generate_pairs.py first"
        )
    rows: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if obj.get("query") and obj.get("positive") and obj.get("source"):
            rows.append(obj)
    return rows


class CandidateRetriever:
    """Wraps BM25 (always) + optional RagService ensemble for candidate mining."""

    def __init__(self, chunks: list[Chunk], use_rag: bool, depth: int):
        from langchain_community.retrievers import BM25Retriever  # noqa: WPS433
        from langchain_core.documents import Document  # noqa: WPS433

        self._depth = depth
        docs = [
            Document(
                page_content=c.text,
                metadata={"source": c.source, "chunk_index": c.chunk_index},
            )
            for c in chunks
        ]
        self._bm25 = BM25Retriever.from_documents(docs)
        self._bm25.k = depth

        self._rag = None
        if use_rag:
            try:
                from app.services.rag_service import RagService  # noqa: WPS433

                rag = RagService()
                rag.warmup()
                self._rag = rag
                print("[mine] --use-rag: RagService ensemble candidates enabled")
            except Exception as exc:  # noqa: BLE001
                print(
                    f"[mine] --use-rag requested but RagService unavailable ({exc}); "
                    "falling back to BM25-only mining"
                )

    def candidates(self, query: str) -> list[tuple[str, str]]:
        """Return [(source, text), ...] candidate chunks for a query."""
        out: list[tuple[str, str]] = []
        seen: set[str] = set()

        def _add(docs):
            for d in docs:
                meta = getattr(d, "metadata", None) or {}
                src = meta.get("source") or "?"
                text = getattr(d, "page_content", "") or ""
                key = f"{src}::{hash(text)}"
                if text and key not in seen:
                    seen.add(key)
                    out.append((src, text))

        try:
            _add(self._bm25.invoke(query)[: self._depth])
        except Exception as exc:  # noqa: BLE001
            print(f"  [mine] bm25 error: {exc}")
        if self._rag is not None:
            try:
                _add(self._rag.base_retriever.invoke(query)[: self._depth])
            except Exception as exc:  # noqa: BLE001
                print(f"  [mine] rag error: {exc}")
        return out


def _split_sources(sources: list[str], val_frac: float, seed: int) -> set[str]:
    rng = random.Random(seed)
    uniq = sorted(set(sources))
    rng.shuffle(uniq)
    n_val = max(1, int(round(len(uniq) * val_frac))) if uniq else 0
    return set(uniq[:n_val])


def main() -> int:
    parser = argparse.ArgumentParser(description="Mine hard negatives → train/val")
    parser.add_argument("--pairs", default=str(DEFAULT_PAIRS))
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    parser.add_argument("--neg-per-pos", type=int, default=4)
    parser.add_argument("--random-neg", type=int, default=1)
    parser.add_argument("--depth", type=int, default=20)
    parser.add_argument("--val-frac", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=13)
    parser.add_argument("--use-rag", action="store_true")
    args = parser.parse_args()

    pairs_path = Path(args.pairs)
    if not pairs_path.is_absolute():
        pairs_path = RAG_ROOT / pairs_path
    out_dir = Path(args.out_dir)
    if not out_dir.is_absolute():
        out_dir = RAG_ROOT / out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    pairs = _load_pairs(pairs_path)
    if not pairs:
        print("[mine] No usable pairs found; run generate_pairs.py first.")
        return 1

    chunks = load_corpus_chunks()
    retriever = CandidateRetriever(chunks, use_rag=args.use_rag, depth=args.depth)
    by_source: dict[str, list[Chunk]] = {}
    for c in chunks:
        by_source.setdefault(c.source, []).append(c)
    all_sources = list(by_source.keys())

    val_sources = _split_sources([p["source"] for p in pairs], args.val_frac, args.seed)
    rng = random.Random(args.seed)

    train_rows: list[dict] = []
    val_rows: list[dict] = []
    n_hard = 0

    for pair in pairs:
        query = pair["query"]
        pos_source = pair["source"]
        pos_text = pair["positive"]
        bucket = val_rows if pos_source in val_sources else train_rows

        bucket.append({"query": query, "passage": pos_text, "label": 1})

        # Hard negatives: retrieved candidates from a different source.
        cands = retriever.candidates(query)
        hard = [(s, t) for (s, t) in cands if s != pos_source]
        for _src, text in hard[: args.neg_per_pos]:
            bucket.append({"query": query, "passage": text, "label": 0})
            n_hard += 1

        # Random negatives: from any other source (guards against trivial models).
        other_sources = [s for s in all_sources if s != pos_source]
        for _ in range(args.random_neg):
            if not other_sources:
                break
            src = rng.choice(other_sources)
            neg_chunk = rng.choice(by_source[src])
            bucket.append({"query": query, "passage": neg_chunk.text, "label": 0})

    rng.shuffle(train_rows)
    rng.shuffle(val_rows)

    train_path = out_dir / "reranker_train.jsonl"
    val_path = out_dir / "reranker_val.jsonl"
    for path, rows in ((train_path, train_rows), (val_path, val_rows)):
        with path.open("w", encoding="utf-8") as fh:
            for row in rows:
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")

    n_train_pos = sum(1 for r in train_rows if r["label"] == 1)
    n_val_pos = sum(1 for r in val_rows if r["label"] == 1)
    print(
        f"[mine] pairs={len(pairs)} hard_negs={n_hard} "
        f"val_sources={len(val_sources)}/{len(set(p['source'] for p in pairs))}"
    )
    print(
        f"[mine] train={len(train_rows)} rows ({n_train_pos} pos) → {train_path.name}"
    )
    print(f"[mine] val={len(val_rows)} rows ({n_val_pos} pos) → {val_path.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
