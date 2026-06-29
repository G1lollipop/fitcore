"""
Generate ``(query, positive_chunk)`` training pairs for the reranker.

For each sampled KB chunk, ask Gemini to write one or more natural
fitness/nutrition questions that the chunk directly answers, producing positive
``(query, chunk)`` pairs. Output is appended one JSON object per line to
``training/data/pairs.jsonl`` and is **resumable**: a re-run skips any chunk uid
already present in the output file.

Methodology note
----------------
The eval golden set (``eval/golden_dataset_en.json``) is deliberately NOT used
as a training source — it stays held out so the reranker gains measured by
``eval/eval_retrieval.py`` reflect generalization, not memorization.

Quota
-----
Gemini's free tier caps chat requests per minute and per day. Use
``--max-per-source`` / ``--limit`` to bound the number of LLM calls; the script
backs off and retries on 429 / RESOURCE_EXHAUSTED, mirroring the ingest path.

Usage (from rag/, with .venv active and GOOGLE_AI_STUDIO_API_KEY set):
    python training/generate_pairs.py --max-per-source 3
    python training/generate_pairs.py --limit 200 --questions-per-chunk 2
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

_TRAIN_DIR = Path(__file__).resolve().parent
RAG_ROOT = _TRAIN_DIR.parent
for _p in (str(RAG_ROOT), str(_TRAIN_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)
load_dotenv(RAG_ROOT / ".env")

from corpus import Chunk, group_by_source, load_corpus_chunks  # noqa: E402

DEFAULT_OUT = _TRAIN_DIR / "data" / "pairs.jsonl"

_QUOTA_SIGNALS = ("RESOURCE_EXHAUSTED", "429", "quota")
_MAX_RETRIES = 5

_PROMPT = (
    "You are building a retrieval training set for a fitness & nutrition "
    "knowledge base. Read the passage below and write {n} concise, natural "
    "question(s) that a real user might ask and that THIS passage directly and "
    "fully answers. Vary phrasing; do not copy the passage wording verbatim; do "
    "not reference 'the passage'. Avoid questions the passage only partially "
    "addresses.\n\n"
    "Return ONLY a JSON array of strings, nothing else.\n\n"
    'Passage:\n"""\n{passage}\n"""'
)


def _build_llm(model: str | None):
    from langchain_openai import ChatOpenAI  # noqa: WPS433

    from app.core.settings import get_settings  # noqa: WPS433

    s = get_settings()
    if not s.llm_api_key:
        raise RuntimeError(
            "GOOGLE_AI_STUDIO_API_KEY is not set; cannot generate queries"
        )
    return ChatOpenAI(
        model=model or s.rag_chat_model,
        api_key=s.llm_api_key,
        base_url=s.llm_base_url,
        temperature=0.7,
    )


def _extract_json_array(text: str) -> list[str]:
    """Best-effort parse of a JSON string array, tolerating code fences / prose."""
    if not text:
        return []
    cleaned = text.strip()
    # Strip ```json ... ``` fences if present.
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
    # Grab the first [...] block.
    match = re.search(r"\[.*\]", cleaned, flags=re.DOTALL)
    candidate = match.group(0) if match else cleaned
    try:
        parsed = json.loads(candidate)
        if isinstance(parsed, list):
            return [str(x).strip() for x in parsed if str(x).strip()]
    except json.JSONDecodeError:
        pass
    # Fallback: one question per non-empty line.
    lines = [ln.strip(" -*\t") for ln in cleaned.splitlines()]
    return [ln for ln in lines if ln.endswith("?")]


def _generate_for_chunk(llm, chunk: Chunk, n: int) -> list[str]:
    prompt = _PROMPT.format(n=n, passage=chunk.text[:3000])
    for attempt in range(_MAX_RETRIES):
        try:
            resp = llm.invoke(prompt)
            questions = _extract_json_array(getattr(resp, "content", "") or "")
            # De-dup within the chunk and cap to n.
            seen: set[str] = set()
            out: list[str] = []
            for q in questions:
                key = q.lower()
                if key not in seen and len(q) > 8:
                    seen.add(key)
                    out.append(q)
            return out[:n]
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            is_quota = any(sig in msg for sig in _QUOTA_SIGNALS)
            if is_quota and attempt < _MAX_RETRIES - 1:
                wait = 30 * (attempt + 1)
                print(f"  [gen] rate-limited; waiting {wait}s then retry...")
                time.sleep(wait)
                continue
            print(f"  [gen error] {chunk.uid}: {exc}")
            return []
    return []


def _load_done_uids(out_path: Path) -> set[str]:
    if not out_path.exists():
        return set()
    done: set[str] = set()
    for line in out_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            done.add(json.loads(line)["uid"])
        except (json.JSONDecodeError, KeyError):
            continue
    return done


def _sample_chunks(
    chunks: list[Chunk], max_per_source: int, min_chars: int, seed: int
) -> list[Chunk]:
    rng = random.Random(seed)
    by_source = group_by_source([c for c in chunks if len(c.text) >= min_chars])
    sampled: list[Chunk] = []
    for source in sorted(by_source):
        pool = by_source[source]
        rng.shuffle(pool)
        sampled.extend(pool[:max_per_source])
    rng.shuffle(sampled)
    return sampled


def _dump_chunks(args) -> int:
    """OFFLINE mode: sample chunks to a JSON file for manual / chat-agent query
    authoring (no Gemini call). Skips uids already present in --out."""
    out_path = Path(args.out)
    if not out_path.is_absolute():
        out_path = RAG_ROOT / out_path
    dump_path = Path(args.dump_chunks)
    if not dump_path.is_absolute():
        dump_path = RAG_ROOT / dump_path
    dump_path.parent.mkdir(parents=True, exist_ok=True)

    chunks = load_corpus_chunks()
    sampled = _sample_chunks(chunks, args.max_per_source, args.min_chars, args.seed)
    done = _load_done_uids(out_path)
    sampled = [c for c in sampled if c.uid not in done]
    if args.limit:
        sampled = sampled[: args.limit]

    payload = [
        {
            "uid": c.uid,
            "source": c.source,
            "chunk_index": c.chunk_index,
            "text": c.text[:1400],
        }
        for c in sampled
    ]
    dump_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        f"[dump] wrote {len(payload)} chunks (excluded {len(done)} already-done) "
        f"→ {dump_path}"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate (query, positive) pairs")
    parser.add_argument("--max-per-source", type=int, default=3)
    parser.add_argument(
        "--limit", type=int, default=None, help="Cap total chunks processed"
    )
    parser.add_argument("--questions-per-chunk", type=int, default=1)
    parser.add_argument("--min-chars", type=int, default=200)
    parser.add_argument("--seed", type=int, default=13)
    parser.add_argument("--model", default=None)
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument(
        "--sleep", type=float, default=0.5, help="Seconds between LLM calls"
    )
    parser.add_argument(
        "--dump-chunks",
        default=None,
        help="OFFLINE mode: sample chunks and write them to this JSON file "
        "(no Gemini call), so queries can be authored by hand / by the chat "
        "agent. Skips already-done uids from --out.",
    )
    args = parser.parse_args()

    if args.dump_chunks:
        return _dump_chunks(args)

    out_path = Path(args.out)
    if not out_path.is_absolute():
        out_path = RAG_ROOT / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)

    chunks = load_corpus_chunks()
    if not chunks:
        print("[gen] No corpus chunks found under rag/data; nothing to do.")
        return 1

    sampled = _sample_chunks(chunks, args.max_per_source, args.min_chars, args.seed)
    if args.limit:
        sampled = sampled[: args.limit]

    done = _load_done_uids(out_path)
    todo = [c for c in sampled if c.uid not in done]
    print(
        f"[gen] corpus chunks={len(chunks)} sampled={len(sampled)} "
        f"already_done={len(done)} to_generate={len(todo)}"
    )
    if not todo:
        print("[gen] Nothing new to generate (all sampled chunks already done).")
        return 0

    llm = _build_llm(args.model)
    written = 0
    with out_path.open("a", encoding="utf-8") as fh:
        for i, chunk in enumerate(todo, start=1):
            questions = _generate_for_chunk(llm, chunk, args.questions_per_chunk)
            for q in questions:
                fh.write(
                    json.dumps(
                        {
                            "query": q,
                            "positive": chunk.text,
                            "source": chunk.source,
                            "chunk_index": chunk.chunk_index,
                            "uid": chunk.uid,
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                written += 1
            fh.flush()
            if i % 25 == 0:
                print(f"  [gen] {i}/{len(todo)} chunks → {written} pairs so far")
            time.sleep(args.sleep)

    print(f"[gen] Done. Wrote {written} new pairs → {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
