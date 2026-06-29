"""
Close the flywheel: turn in-app thumbs feedback into reranker training signal.

Reads the ``chat_message_feedback`` table (written by the web
``submitMessageFeedback`` server action) and:

1. Appends training rows to ``training/data/reranker_train.jsonl``:
   - thumbs-UP (rating=+1): the cited chunks were helpful → emit
     ``(query, cited_snippet, label=1)`` positives, plus mined hard negatives
     from other sources (label=0).
   - thumbs-DOWN (rating=-1): the cited chunks produced a bad answer → emit
     ``(query, cited_snippet, label=0)`` negatives (real production
     "retrieved-but-unhelpful" examples — exactly what a reranker should learn
     to push down).

2. Stages eval candidates to ``eval/feedback_candidates.json`` for human review.
   These are real production queries worth adding to the golden set; a human
   confirms ``in_scope`` and fills ``relevant_sources`` anchors before they are
   merged into ``eval/golden_dataset_en.json`` (use ``--apply-golden`` to append
   them as ``_needs_review`` stubs once curated).

Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in rag/.env.

Usage (from rag/):
    python training/export_feedback.py                 # append train rows + stage candidates
    python training/export_feedback.py --use-rag       # tougher mined negatives
    python training/export_feedback.py --apply-golden  # also append stubs to the golden set
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

_TRAIN_DIR = Path(__file__).resolve().parent
RAG_ROOT = _TRAIN_DIR.parent
_EVAL_DIR = RAG_ROOT / "eval"
for _p in (str(RAG_ROOT), str(_TRAIN_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)
load_dotenv(RAG_ROOT / ".env")

from corpus import load_corpus_chunks  # noqa: E402
from mine_hard_negatives import CandidateRetriever  # noqa: E402

DEFAULT_TRAIN_OUT = _TRAIN_DIR / "data" / "reranker_train.jsonl"
CANDIDATES_OUT = _EVAL_DIR / "feedback_candidates.json"
GOLDEN_PATH = _EVAL_DIR / "golden_dataset_en.json"


def _fetch_feedback() -> list[dict]:
    from app.infra.supabase_client import (  # noqa: WPS433
        get_supabase_client,
        supabase_configured,
    )

    if not supabase_configured():
        raise RuntimeError(
            "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set; cannot read feedback"
        )
    client = get_supabase_client()
    rows: list[dict] = []
    page = 1000
    start = 0
    while True:
        res = (
            client.table("chat_message_feedback")
            .select("rating,query,answer,citations,created_at")
            .order("created_at")
            .range(start, start + page - 1)
            .execute()
        )
        batch = res.data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page:
            break
        start += page
    return rows


def _citation_texts(citations) -> list[tuple[str, str]]:
    """Return [(source, snippet)] from a stored citations jsonb array."""
    out: list[tuple[str, str]] = []
    if not isinstance(citations, list):
        return out
    for c in citations:
        if not isinstance(c, dict):
            continue
        snippet = (c.get("snippet") or c.get("text") or "").strip()
        source = c.get("source") or c.get("title") or "?"
        if snippet:
            out.append((source, snippet))
    return out


def _stable_id(query: str) -> str:
    return "fb_" + hashlib.md5(query.strip().lower().encode("utf-8")).hexdigest()[:8]


def main() -> int:
    parser = argparse.ArgumentParser(description="Feedback → reranker training flywheel")
    parser.add_argument("--train-out", default=str(DEFAULT_TRAIN_OUT))
    parser.add_argument("--neg-per-pos", type=int, default=4)
    parser.add_argument("--depth", type=int, default=20)
    parser.add_argument("--use-rag", action="store_true")
    parser.add_argument(
        "--apply-golden",
        action="store_true",
        help="Also append reviewed candidates to golden_dataset_en.json as "
        "_needs_review stubs (anchors still need human curation).",
    )
    args = parser.parse_args()

    train_out = Path(args.train_out)
    if not train_out.is_absolute():
        train_out = RAG_ROOT / train_out
    train_out.parent.mkdir(parents=True, exist_ok=True)

    feedback = _fetch_feedback()
    if not feedback:
        print("[flywheel] No feedback rows yet; nothing to export.")
        return 0
    print(f"[flywheel] fetched {len(feedback)} feedback rows")

    chunks = load_corpus_chunks()
    retriever = CandidateRetriever(chunks, use_rag=args.use_rag, depth=args.depth)

    new_rows: list[dict] = []
    candidates: dict[str, dict] = {}
    n_up = n_down = 0

    for row in feedback:
        query = (row.get("query") or "").strip()
        if not query:
            continue
        rating = int(row.get("rating") or 0)
        cited = _citation_texts(row.get("citations"))
        cited_sources = {s for s, _ in cited}

        if rating == 1:
            n_up += 1
            # Helpful citations → positives.
            for _src, snippet in cited:
                new_rows.append({"query": query, "passage": snippet, "label": 1})
            # Mined hard negatives from OTHER sources.
            cands = retriever.candidates(query)
            negs = [(s, t) for (s, t) in cands if s not in cited_sources]
            for _src, text in negs[: args.neg_per_pos]:
                new_rows.append({"query": query, "passage": text, "label": 0})
        elif rating == -1:
            n_down += 1
            # The cited chunks produced a bad answer → real hard negatives.
            for _src, snippet in cited:
                new_rows.append({"query": query, "passage": snippet, "label": 0})

        # Every rated query is an eval-set candidate (human curates anchors).
        cid = _stable_id(query)
        candidates[cid] = {
            "id": cid,
            "question": query,
            "in_scope": True,
            "relevant_sources": [],
            "expected_keywords": [],
            "topic": "feedback",
            "difficulty": "unknown",
            "_source": "user_feedback",
            "_rating": rating,
            "_needs_review": True,
        }

    # 1) Append training rows.
    if new_rows:
        with train_out.open("a", encoding="utf-8") as fh:
            for r in new_rows:
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    pos = sum(1 for r in new_rows if r["label"] == 1)
    neg = len(new_rows) - pos
    print(
        f"[flywheel] thumbs_up={n_up} thumbs_down={n_down} → appended "
        f"{len(new_rows)} train rows ({pos} pos / {neg} neg) to {train_out.name}"
    )

    # 2) Stage eval candidates (merge with any existing staging file, dedup by id).
    existing: dict[str, dict] = {}
    if CANDIDATES_OUT.exists():
        try:
            for item in json.loads(CANDIDATES_OUT.read_text(encoding="utf-8")):
                existing[item.get("id")] = item
        except json.JSONDecodeError:
            pass
    existing.update(candidates)
    CANDIDATES_OUT.write_text(
        json.dumps(list(existing.values()), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(
        f"[flywheel] staged {len(candidates)} eval candidate(s) "
        f"({len(existing)} total) → {CANDIDATES_OUT.relative_to(RAG_ROOT)}"
    )

    # 3) Optionally append review stubs to the golden set.
    if args.apply_golden and candidates:
        golden = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
        have = {g.get("question", "").strip().lower() for g in golden}
        added = 0
        for cand in candidates.values():
            if cand["question"].strip().lower() not in have:
                golden.append(cand)
                added += 1
        GOLDEN_PATH.write_text(
            json.dumps(golden, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(
            f"[flywheel] --apply-golden: appended {added} stub(s) to "
            f"{GOLDEN_PATH.name} (set in_scope + relevant_sources by hand before relying on the gate)"
        )

    print(
        "[flywheel] Done. Re-run training/train_reranker.py to fold the new "
        "signal into the reranker, then eval/eval_retrieval.py --variant reranker "
        "--gate to verify the gain."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
