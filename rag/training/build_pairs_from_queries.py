"""
Offline companion to ``generate_pairs.py --dump-chunks`` (NO Gemini API).

Joins hand- / chat-authored queries (``training/data/manual_queries.json``, a
``{uid: query}`` map) with the dumped chunk texts
(``training/data/sampled_chunks.json``) and appends
``{query, positive, source, chunk_index, uid}`` rows to
``training/data/pairs.jsonl``. Skips uids already present in pairs.jsonl and any
entry with an empty query, so it is safe to re-run / extend incrementally.

Usage (from rag/):
    python training/build_pairs_from_queries.py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_TRAIN_DIR = Path(__file__).resolve().parent
RAG_ROOT = _TRAIN_DIR.parent
if str(RAG_ROOT) not in sys.path:
    sys.path.insert(0, str(RAG_ROOT))

DEFAULT_CHUNKS = _TRAIN_DIR / "data" / "sampled_chunks.json"
DEFAULT_QUERIES = _TRAIN_DIR / "data" / "manual_queries.json"
DEFAULT_OUT = _TRAIN_DIR / "data" / "pairs.jsonl"


def _load_done_uids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    done: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            done.add(json.loads(line)["uid"])
        except (json.JSONDecodeError, KeyError):
            continue
    return done


def main() -> int:
    parser = argparse.ArgumentParser(description="Build pairs from authored queries")
    parser.add_argument("--chunks", default=str(DEFAULT_CHUNKS))
    parser.add_argument("--queries", default=str(DEFAULT_QUERIES))
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args()

    def _abs(p: str) -> Path:
        path = Path(p)
        return path if path.is_absolute() else RAG_ROOT / path

    chunks_path, queries_path, out_path = (
        _abs(args.chunks),
        _abs(args.queries),
        _abs(args.out),
    )

    chunks = {c["uid"]: c for c in json.loads(chunks_path.read_text(encoding="utf-8"))}
    raw = json.loads(queries_path.read_text(encoding="utf-8"))
    items = (
        raw.items()
        if isinstance(raw, dict)
        else [(r["uid"], r.get("query", "")) for r in raw]
    )

    done = _load_done_uids(out_path)
    written = skipped_done = missing = empty = 0
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("a", encoding="utf-8") as fh:
        for uid, query in items:
            query = (query or "").strip()
            if not query:
                empty += 1
                continue
            if uid in done:
                skipped_done += 1
                continue
            chunk = chunks.get(uid)
            if not chunk:
                missing += 1
                continue
            fh.write(
                json.dumps(
                    {
                        "query": query,
                        "positive": chunk["text"],
                        "source": chunk["source"],
                        "chunk_index": chunk["chunk_index"],
                        "uid": uid,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
            written += 1

    print(
        f"[build] wrote {written} pairs "
        f"(skipped_done={skipped_done}, missing_uid={missing}, empty={empty}) "
        f"→ {out_path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
