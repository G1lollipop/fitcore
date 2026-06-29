"""
Offline retrieval evaluation Runner (large-corpus edition)
==========================================================

Once the KB grows to 1000+ documents, exhaustively labeling "precise qrels of
1-3 files per question" is no longer feasible, and the old nDCG/precision would
systematically underestimate quality because many "unlabeled but actually
relevant" documents are treated as irrelevant. This Runner therefore uses two
complementary measures:

1) Anchor metrics (deterministic, zero LLM, used for CI gating) — they only ask
   "is the must-hit anchor document for this question still retrieved?":
   anchor_recall@k / anchor_hit@k / anchor_mrr@k (against the golden set's
   relevant_sources). This is a regression sentinel: robust to re-chunking,
   independent of corpus size, and remains stably comparable after the KB grows.

2) Context relevance (LLM-as-judge, optional --judge) — does not rely on
   exhaustive labeling and directly judges "is each retrieved chunk relevant to
   this query?": context_precision@k / context_hit@k. This measures the
   "absolute quality" of retrieval on a large corpus (RAGAS context-precision
   approach).

It also computes the top-1 score false_retrieval_rate for out-of-scope
(abstention) queries.

Two fetch modes: in-process (default, import RagService) / HTTP (--http, hits
/v1/retrieve).

Run (from rag/, with .venv activated and the KB already ingested):
    python eval/eval_retrieval.py                         # anchor metrics only (fast, no LLM)
    python eval/eval_retrieval.py --judge                 # add LLM-judge context relevance
    python eval/eval_retrieval.py --variant all --tag cmp # bm25/vector/ensemble comparison
    python eval/eval_retrieval.py --gate                  # regression gate against baseline
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parent.parent
_EVAL_DIR = Path(__file__).resolve().parent
load_dotenv(_ROOT / ".env")
for _p in (str(_ROOT), str(_EVAL_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import retrieval_metrics as rm  # noqa: E402

DATASET_PATH = _EVAL_DIR / "golden_dataset_en.json"
DEFAULT_KS = [3, 5, 10]
RETRIEVE_DEPTH_ENV = "EVAL_RETRIEVE_DEPTH"


# ─── Fetch: each retrieval result returns a chunk list [{source, text, score}] ──


def _chunks_from_docs(docs) -> list[dict]:
    out: list[dict] = []
    for i, d in enumerate(docs):
        meta = getattr(d, "metadata", None) or {}
        score = meta.get("relevance_score")
        if score is None:
            score = meta.get("score")
        out.append(
            {
                "source": meta.get("source") or meta.get("title") or f"doc{i}",
                "text": getattr(d, "page_content", "") or "",
                "score": float(score) if isinstance(score, (int, float)) else None,
            }
        )
    return out


def _chunks_from_http(chunks: list[dict]) -> list[dict]:
    out: list[dict] = []
    for i, c in enumerate(chunks):
        s = c.get("score")
        out.append(
            {
                "source": c.get("source") or c.get("title") or f"doc{i}",
                "text": c.get("text") or c.get("snippet") or c.get("content") or "",
                "score": float(s) if isinstance(s, (int, float)) else None,
            }
        )
    return out


class ProcessInRetriever:
    """In-process retriever invocation; supports switching bm25 / vector / ensemble / weighted variants for comparison."""

    def __init__(self, depth: int = 10) -> None:
        from app.services.rag_service import RagService  # noqa: WPS433

        self.rag = RagService()
        self.rag.warmup()
        self._depth = depth
        self._variant = "ensemble"
        self._variant_retrievers: dict = {}

    def available_variants(self) -> list[str]:
        return ["bm25", "vector", "ensemble"]

    def _is_supabase(self) -> bool:
        return not hasattr(self.rag.vector_service, "vector_store")

    def _all_corpus_docs(self):
        from langchain_core.documents import Document  # noqa: WPS433

        vs = self.rag.vector_service
        if self._is_supabase():
            from app.services.retrieval.supabase_store import fetch_all_chunk_documents  # noqa: WPS433

            return fetch_all_chunk_documents(vs.client)
        # Paginated fetch (a single Chroma .get() trips SQLite's max-variables
        # limit on a large corpus). Reuse the store's paginated helper.
        data = vs._fetch_all_chunks()
        return [
            Document(page_content=t, metadata=m or {})
            for t, m in zip(data.get("documents", []), data.get("metadatas", []))
        ]

    def _vector_only_retriever(self):
        if getattr(self, "_vector_sub", None) is not None:
            return self._vector_sub
        vs = self.rag.vector_service
        if self._is_supabase():
            from app.services.retrieval.supabase_store import (
                SupabaseSimilarityRetriever,
            )  # noqa: WPS433

            self._vector_sub = SupabaseSimilarityRetriever(
                client=vs.client, embedding=vs.embedding, k=self._depth
            )
        else:
            self._vector_sub = vs.vector_store.as_retriever(
                search_kwargs={"k": self._depth}
            )
        return self._vector_sub

    def _bm25_retriever(self):
        if getattr(self, "_bm25_sub", None) is not None:
            return self._bm25_sub
        from langchain_community.retrievers import BM25Retriever  # noqa: WPS433

        r = BM25Retriever.from_documents(self._all_corpus_docs())
        r.k = self._depth
        self._bm25_sub = r
        return r

    def _build_variant(self, variant: str):
        if variant in self._variant_retrievers:
            return self._variant_retrievers[variant]
        if variant == "ensemble":
            retriever = self.rag.base_retriever
        elif variant == "reranker":
            # Exercises the live reranking path: RagService's compression
            # retriever (CrossEncoder over the ensemble candidates). Honors
            # RERANKER_ENABLED + the configured model (RERANKER_MODEL_NAME or
            # LOCAL_RERANKER_MODEL_PATH), so a base vs fine-tuned comparison is
            # just two runs with different model env vars. Falls back to the
            # base ensemble when the reranker is disabled/unavailable.
            retriever = (
                self.rag._get_compression_retriever() or self.rag.base_retriever
            )
        elif variant == "vector":
            retriever = self._vector_only_retriever()
        elif variant == "bm25":
            retriever = self._bm25_retriever()
        elif variant.startswith("w="):
            from langchain_classic.retrievers import EnsembleRetriever  # noqa: WPS433

            wv = float(variant[2:])
            retriever = EnsembleRetriever(
                retrievers=[self._vector_only_retriever(), self._bm25_retriever()],
                weights=[wv, 1.0 - wv],
            )
        else:
            raise ValueError(f"Unknown retrieval variant: {variant}")
        self._variant_retrievers[variant] = retriever
        return retriever

    def set_variant(self, variant: str) -> None:
        self._variant = variant
        self._build_variant(variant)

    def retrieve(self, query: str, depth: int) -> list[dict]:
        retriever = self._build_variant(self._variant)
        docs = retriever.invoke(query)[:depth]
        return _chunks_from_docs(docs)

    def config_label(self) -> dict:
        from app.core.settings import get_settings  # noqa: WPS433

        s = get_settings()
        return {
            "mode": "process-in",
            "variant": self._variant,
            "vector_backend": os.getenv("VECTOR_BACKEND", "chroma"),
            "reranker_enabled": bool(getattr(s, "reranker_enabled", False)),
            "chunking_strategy": getattr(s, "chunking_strategy", None),
        }


class HttpRetriever:
    def __init__(self) -> None:
        self.base = os.getenv("RAG_SERVICE_URL", "http://127.0.0.1:8000")

    def retrieve(self, query: str, depth: int) -> list[dict]:
        import requests  # noqa: WPS433

        resp = requests.post(
            f"{self.base}/v1/retrieve",
            json={
                "query": query,
                "sessionId": "eval",
                "userContext": {},
                "topK": depth,
            },
            timeout=90,
        )
        resp.raise_for_status()
        return _chunks_from_http(resp.json().get("chunks", []))

    def available_variants(self) -> list[str]:
        return ["ensemble"]

    def set_variant(self, variant: str) -> None:
        return None

    def config_label(self) -> dict:
        return {
            "mode": "http",
            "variant": "ensemble",
            "endpoint": f"{self.base}/v1/retrieve",
        }


# ─── LLM judge: decide whether a single chunk is relevant to the query ────────

_JUDGE = None


def _get_judge():
    global _JUDGE
    if _JUDGE is not None:
        return _JUDGE
    from langchain_openai import ChatOpenAI  # noqa: WPS433

    from app.core.settings import get_settings  # noqa: WPS433

    s = get_settings()
    if not s.llm_api_key:
        raise RuntimeError("LLM API key is not configured; cannot use --judge")
    model = os.getenv("EVAL_JUDGE_MODEL") or s.rag_chat_model
    _JUDGE = ChatOpenAI(
        model=model, api_key=s.llm_api_key, base_url=s.llm_base_url, temperature=0
    )
    return _JUDGE


# Inter-call spacing for the LLM judge (free Gemini flash ≈ 10 RPM / 250 RPD).
# Raise EVAL_JUDGE_SLEEP (e.g. 5–6) to stay under the rate limit on small samples.
_JUDGE_SLEEP = float(os.getenv("EVAL_JUDGE_SLEEP", "0.2"))
_JUDGE_MAX_RETRIES = 4


def judge_chunk_relevant(question: str, text: str) -> bool:
    if not text.strip():
        return False
    prompt = (
        "You judge whether a retrieved passage is RELEVANT for answering a user's "
        "fitness/nutrition question (it helps answer it, even partially).\n\n"
        f"Question: {question}\n\n"
        f'Passage:\n"""\n{text[:3000]}\n"""\n\n'
        'Answer ONLY "yes" or "no".'
    )
    for attempt in range(_JUDGE_MAX_RETRIES):
        try:
            resp = _get_judge().invoke(prompt)
            t = (resp.content or "").strip().lower()
            return t.startswith("y")
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            is_quota = (
                "RESOURCE_EXHAUSTED" in msg or "429" in msg or "quota" in msg.lower()
            )
            if is_quota and attempt < _JUDGE_MAX_RETRIES - 1:
                wait = 20 * (attempt + 1)
                print(
                    f"  [judge] rate-limited; waiting {wait}s then retry ({attempt + 1})..."
                )
                time.sleep(wait)
                continue
            print(f"  [judge error] {exc}")
            return False
    return False


# ─── Main flow ────────────────────────────────────────────────────────────────


def _eval_one_variant(
    retriever,
    variant,
    in_scope,
    abstain,
    ks,
    depth,
    threshold,
    use_judge,
    judge_k,
    use_http,
    verbose,
):
    retriever.set_variant(variant)
    per_query: list[dict] = []
    agg: dict[str, float] = {}
    judged_n = 0

    for item in in_scope:
        qrels = {
            rs["source"]: int(rs.get("grade", 1))
            for rs in item.get("relevant_sources", [])
        }
        try:
            chunks = retriever.retrieve(item["question"], depth)
        except Exception as exc:  # noqa: BLE001
            per_query.append({"id": item["id"], "error": str(exc)})
            if verbose:
                print(f"{item['id']:<10} ERROR: {exc}")
            continue
        ranked = [c["source"] for c in chunks]

        metrics: dict[str, float] = {}
        # Anchor metrics (only counted in the aggregate when the question has anchors)
        has_anchor = bool(qrels)
        for k in ks:
            metrics[f"anchor_recall@{k}"] = rm.recall_at_k(ranked, qrels, k)
            metrics[f"anchor_hit@{k}"] = rm.hit_rate_at_k(ranked, qrels, k)
            metrics[f"anchor_mrr@{k}"] = rm.mrr_at_k(ranked, qrels, k)

        # Keyword coverage (deterministic content quality, NO LLM): how many of
        # the question's expected_keywords appear in the top-k retrieved chunk
        # texts. Stays meaningful as the corpus grows (doesn't care which doc).
        kw_list = item.get("expected_keywords") or []
        has_kw = bool(kw_list)
        chunk_texts = [c["text"] for c in chunks]
        for k in ks:
            metrics[f"keyword_coverage@{k}"] = rm.keyword_coverage_at_k(
                chunk_texts, kw_list, k
            )

        # LLM-judge context relevance (optional)
        judgments: list[bool] = []
        if use_judge:
            for c in chunks[:judge_k]:
                judgments.append(judge_chunk_relevant(item["question"], c["text"]))
                time.sleep(_JUDGE_SLEEP)
            for k in ks:
                if k <= judge_k:
                    metrics[f"context_precision@{k}"] = rm.context_precision_at_k(
                        judgments, k
                    )
                    metrics[f"context_hit@{k}"] = rm.context_hit_at_k(judgments, k)
            judged_n += 1

        # Aggregate: anchor metrics only when has_anchor; keyword metrics only
        # when has_kw; context metrics only when judged.
        for key, val in metrics.items():
            if key.startswith("anchor_") and not has_anchor:
                continue
            if key.startswith("keyword_") and not has_kw:
                continue
            agg[key] = agg.get(key, 0.0) + val

        per_query.append(
            {
                "id": item["id"],
                "topic": item.get("topic", ""),
                "anchors": list(qrels.keys()),
                "has_keywords": has_kw,
                "retrieved": rm.dedup_keep_order(ranked)[:depth],
                "judgments": judgments if use_judge else None,
                "metrics": metrics,
            }
        )
        if verbose:
            cp = metrics.get(f"context_precision@{min(judge_k, ks[-1])}")
            cp_s = f" ctxP@{min(judge_k, ks[-1])}={cp:.2f}" if cp is not None else ""
            print(
                f"{item['id']:<10} {item.get('topic', ''):<18} "
                f"aHit@{ks[-1]}={metrics.get(f'anchor_hit@{ks[-1]}', 0):.0f} "
                f"kwCov@{ks[-1]}={metrics.get(f'keyword_coverage@{ks[-1]}', 0):.2f}{cp_s}"
            )
        if not use_http:
            time.sleep(0.1)

    # Denominators: anchor → # anchored questions; keyword → # questions with
    # expected_keywords; context → # judged questions.
    n_anchor = max(len([p for p in per_query if p.get("anchors")]), 1)
    n_kw = max(len([p for p in per_query if p.get("has_keywords")]), 1)
    n_judge = max(judged_n, 1)
    summary: dict[str, float] = {}
    for key, total in agg.items():
        if key.startswith("context_"):
            denom = n_judge
        elif key.startswith("keyword_"):
            denom = n_kw
        else:
            denom = n_anchor
        summary[key] = round(total / denom, 4)
    summary["_n_in_scope"] = len(in_scope)
    summary["_n_anchored"] = n_anchor
    summary["_n_keyworded"] = n_kw
    summary["_n_judged"] = judged_n

    # abstention
    top1s: list[float | None] = []
    detail: list[dict] = []
    for item in abstain:
        try:
            chunks = retriever.retrieve(item["question"], depth)
        except Exception as exc:  # noqa: BLE001
            detail.append({"id": item["id"], "error": str(exc)})
            continue
        top1 = chunks[0]["score"] if chunks else None
        top1s.append(top1)
        detail.append(
            {
                "id": item["id"],
                "top1_source": chunks[0]["source"] if chunks else None,
                "top1_score": top1,
            }
        )
    frr = rm.false_retrieval_rate(top1s, threshold)

    return (
        summary,
        per_query,
        {"false_retrieval_rate": frr, "threshold": threshold, "detail": detail},
    )


def _emit_step_summary(lines: list[str]) -> None:
    path = os.getenv("GITHUB_STEP_SUMMARY")
    if not path:
        return
    try:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
    except OSError:
        pass


def _run_gate(results: dict, gate_variant: str, baseline_path: Path) -> int:
    if not baseline_path.is_absolute():
        baseline_path = _EVAL_DIR / baseline_path
    if not baseline_path.exists():
        print(f"\n[gate] Baseline file not found: {baseline_path} (skipping gate)")
        return 0
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    thresholds: dict[str, float] = baseline.get("thresholds", {})
    if gate_variant not in results:
        print(f"\n[gate] Variant {gate_variant} has no results; cannot gate")
        return 1

    summary = results[gate_variant]["summary"]
    failures: list[str] = []
    rows = [
        "",
        "## Retrieval regression gate — variant=" + gate_variant,
        "",
        "| Metric | Actual | Floor | Status |",
        "|---|---|---|---|",
    ]
    print(
        f"\n=== Retrieval regression gate (variant={gate_variant}, baseline {baseline_path.name}) ==="
    )
    for metric, floor in thresholds.items():
        actual = float(summary.get(metric, 0.0))
        ok = actual + 1e-9 >= float(floor)
        print(
            f"  {metric:<22} {actual:>7.3f}  floor {float(floor):>6.3f}  [{'PASS' if ok else 'FAIL'}]"
        )
        rows.append(
            f"| {metric} | {actual:.3f} | ≥ {float(floor)} | {'✅' if ok else '❌'} |"
        )
        if not ok:
            failures.append(f"{metric} {actual:.3f} < {floor}")

    max_frr = baseline.get("abstention", {}).get("max_false_retrieval_rate")
    if max_frr is not None:
        frr = results[gate_variant]["abstention"]["false_retrieval_rate"]
        if frr is not None and frr >= 0:
            ok = frr <= float(max_frr) + 1e-9
            print(
                f"  {'false_retrieval_rate':<22} {frr:>7.3f}  cap {float(max_frr):>6.3f}  [{'PASS' if ok else 'FAIL'}]"
            )
            rows.append(
                f"| false_retrieval_rate | {frr:.3f} | ≤ {float(max_frr)} | {'✅' if ok else '❌'} |"
            )
            if not ok:
                failures.append(f"false_retrieval_rate {frr:.3f} > {max_frr}")

    _emit_step_summary(rows)
    if failures:
        msg = "Retrieval metric regression: " + "; ".join(failures)
        print(f"\n[gate] FAIL — {msg}")
        if os.getenv("GITHUB_ACTIONS"):
            print(f"::error::{msg}")
        return 1
    print("\n[gate] PASS — all retrieval metrics meet their thresholds")
    return 0


def evaluate(
    ks,
    use_http,
    tag,
    threshold,
    variant_arg,
    sweep=None,
    dataset_path=None,
    gate=False,
    baseline_path="retrieval_baseline.json",
    use_judge=False,
    judge_k=5,
    limit=None,
) -> int:
    ds_path = Path(dataset_path) if dataset_path else DATASET_PATH
    if not ds_path.is_absolute():
        ds_path = _EVAL_DIR / ds_path
    dataset = json.loads(ds_path.read_text(encoding="utf-8"))
    in_scope = [d for d in dataset if d.get("in_scope")]
    abstain = [d for d in dataset if not d.get("in_scope")]
    if limit:
        in_scope = in_scope[:limit]

    depth = max(int(os.getenv(RETRIEVE_DEPTH_ENV, max(ks))), max(ks))
    retriever = HttpRetriever() if use_http else ProcessInRetriever(depth=depth)

    if sweep:
        variants = [f"w={round(w, 3)}" for w in sweep]
    elif variant_arg == "all":
        variants = retriever.available_variants()
    else:
        variants = [variant_arg]

    print(
        "=== FitCore retrieval evaluation (deterministic anchors + optional LLM-judge context relevance) ==="
    )
    print(f"Dataset   : {ds_path.name}")
    print(f"Config    : {json.dumps(retriever.config_label(), ensure_ascii=False)}")
    print(
        f"in-scope : {len(in_scope)} items | abstention : {len(abstain)} items | candidate depth : {depth}"
    )
    print(
        f"k values  : {ks} | variants : {variants} | LLM judge : {use_judge} (judge_k={judge_k})"
    )

    verbose = len(variants) == 1
    results: dict[str, dict] = {}
    for v in variants:
        summary, per_query, abst = _eval_one_variant(
            retriever,
            v,
            in_scope,
            abstain,
            ks,
            depth,
            threshold,
            use_judge,
            judge_k,
            use_http,
            verbose,
        )
        results[v] = {"summary": summary, "per_query": per_query, "abstention": abst}

    # ── Comparison table ──
    print("\n=== Variant comparison (in-scope average) ===")
    cmp_cols = [
        f"anchor_hit@{ks[-1]}",
        f"anchor_recall@{ks[-1]}",
        f"keyword_coverage@{ks[-1]}",
    ]
    if use_judge:
        cmp_cols += [
            f"context_precision@{min(judge_k, ks[-1])}",
            f"context_hit@{min(judge_k, ks[-1])}",
        ]
    cmp_header = f"{'variant':<12} " + " ".join(f"{c:>22}" for c in cmp_cols)
    print(cmp_header)
    print("-" * len(cmp_header))
    for v in variants:
        s = results[v]["summary"]
        print(f"{v:<12} " + " ".join(f"{s.get(c, 0):>22.3f}" for c in cmp_cols))

    print(
        "\n[abstention] out-of-scope top-1 false-retrieval rate (lower is better; -1 = backend has no comparable scores)"
    )
    for v in variants:
        print(
            f"  {v:<12} false_retrieval_rate@{threshold}: {results[v]['abstention']['false_retrieval_rate']:.3f}"
        )

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    tag_part = f"{tag}_" if tag else ""
    report = {
        "evaluated_at": datetime.now().isoformat(),
        "tag": tag,
        "config": retriever.config_label(),
        "ks": ks,
        "retrieve_depth": depth,
        "use_judge": use_judge,
        "judge_k": judge_k,
        "variants": variants,
        "results": results,
    }
    out_path = _EVAL_DIR / f"retrieval_report_{tag_part}{ts}.json"
    out_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\nReport saved: {out_path}")

    if gate:
        return _run_gate(results, variants[0], Path(baseline_path))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Offline retrieval evaluation (anchor recall + LLM-judge context relevance)"
    )
    parser.add_argument(
        "--http",
        action="store_true",
        help="Use HTTP /v1/retrieve instead of in-process",
    )
    parser.add_argument(
        "--k",
        nargs="+",
        type=int,
        default=DEFAULT_KS,
        help="List of k values, e.g. --k 3 5 10",
    )
    parser.add_argument("--tag", default="", help="Report tag")
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.8,
        help="abstention false-retrieval score threshold",
    )
    parser.add_argument(
        "--variant",
        default="ensemble",
        choices=["ensemble", "reranker", "vector", "bm25", "all"],
        help="'reranker' exercises the live CrossEncoder path (needs "
        "RERANKER_ENABLED=true + torch); used for base-vs-fine-tuned comparison",
    )
    parser.add_argument(
        "--sweep",
        nargs="*",
        type=float,
        help="Vector-weight sweep, e.g. --sweep 0 0.5 1.0",
    )
    parser.add_argument(
        "--dataset",
        default=None,
        help="Evaluation set (default golden_dataset_en.json)",
    )
    parser.add_argument(
        "--judge",
        action="store_true",
        help="Enable LLM-judge context relevance (requires an LLM key)",
    )
    parser.add_argument(
        "--judge-k",
        type=int,
        default=5,
        help="LLM-judge the first N chunks per question (cost control)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Evaluate only the first N in-scope items (cost control)",
    )
    parser.add_argument(
        "--gate",
        action="store_true",
        help="Regression gate: compare against --baseline thresholds",
    )
    parser.add_argument("--baseline", default="retrieval_baseline.json")
    args = parser.parse_args()

    sweep = None
    if args.sweep is not None:
        sweep = args.sweep or [0.0, 0.2, 0.5, 0.8, 1.0]

    return evaluate(
        sorted(set(args.k)),
        args.http,
        args.tag,
        args.threshold,
        args.variant,
        sweep,
        args.dataset,
        args.gate,
        args.baseline,
        args.judge,
        args.judge_k,
        args.limit,
    )


if __name__ == "__main__":
    raise SystemExit(main())
