"""
离线检索评估 Runner（大语料版）
================================

KB 已扩到 1000+ 篇后，「每题只标 1–3 个文件的精确 qrels」无法穷举标注，旧的
nDCG/precision 会因大量「未标注但其实相关」的文档被当成不相关而系统性低估。本
Runner 因此用两套互补口径：

1) 锚点指标（确定性、零 LLM、CI 门禁用）——只问「这题必中的锚点文档是否仍被检索到」：
   anchor_recall@k / anchor_hit@k / anchor_mrr@k（对 golden 的 relevant_sources）。
   它是回归哨兵：抗 re-chunk、与语料规模无关，扩库后依然稳定可比。

2) 上下文相关性（LLM-as-judge、可选 --judge）——不依赖穷举标注，直接判「检索到的
   每个 chunk 对该 query 是否相关」：context_precision@k / context_hit@k。这是大语料
   下衡量检索「绝对质量」的口径（RAGAS context precision 思路）。

另外对 out-of-scope（abstention）query 统计 top-1 分数误召回率 false_retrieval_rate。

两种取数模式：进程内（默认，import RagService）/ HTTP（--http，打 /v1/retrieve）。

运行（rag/，已激活 .venv，且已灌库）：
    python eval/eval_retrieval.py                         # 仅锚点指标（快、无需 LLM）
    python eval/eval_retrieval.py --judge                 # 加 LLM 裁判 context 相关性
    python eval/eval_retrieval.py --variant all --tag cmp # bm25/vector/ensemble 对比
    python eval/eval_retrieval.py --gate                  # 对照 baseline 回归门禁
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


# ─── 取数：每条检索结果返回 chunk 列表 [{source, text, score}] ────────────────


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
    """进程内调用检索器；支持切换 bm25 / vector / ensemble / 加权变体做对照。"""

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
            raise ValueError(f"未知检索变体: {variant}")
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
            json={"query": query, "sessionId": "eval", "userContext": {}, "topK": depth},
            timeout=90,
        )
        resp.raise_for_status()
        return _chunks_from_http(resp.json().get("chunks", []))

    def available_variants(self) -> list[str]:
        return ["ensemble"]

    def set_variant(self, variant: str) -> None:
        return None

    def config_label(self) -> dict:
        return {"mode": "http", "variant": "ensemble", "endpoint": f"{self.base}/v1/retrieve"}


# ─── LLM 裁判：判断单个 chunk 对 query 是否相关 ──────────────────────────────

_JUDGE = None


def _get_judge():
    global _JUDGE
    if _JUDGE is not None:
        return _JUDGE
    from langchain_openai import ChatOpenAI  # noqa: WPS433

    from app.core.settings import get_settings  # noqa: WPS433

    s = get_settings()
    if not s.llm_api_key:
        raise RuntimeError("LLM API key 未配置，无法用 --judge")
    model = os.getenv("EVAL_JUDGE_MODEL") or s.rag_chat_model
    _JUDGE = ChatOpenAI(
        model=model, api_key=s.llm_api_key, base_url=s.llm_base_url, temperature=0
    )
    return _JUDGE


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
    try:
        resp = _get_judge().invoke(prompt)
        t = (resp.content or "").strip().lower()
        return t.startswith("y")
    except Exception as exc:  # noqa: BLE001
        print(f"  [judge error] {exc}")
        return False


# ─── 主流程 ─────────────────────────────────────────────────────────────────


def _eval_one_variant(
    retriever, variant, in_scope, abstain, ks, depth, threshold, use_judge, judge_k,
    use_http, verbose,
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
        # 锚点指标（仅当该题标了锚点时才计入聚合）
        has_anchor = bool(qrels)
        for k in ks:
            metrics[f"anchor_recall@{k}"] = rm.recall_at_k(ranked, qrels, k)
            metrics[f"anchor_hit@{k}"] = rm.hit_rate_at_k(ranked, qrels, k)
            metrics[f"anchor_mrr@{k}"] = rm.mrr_at_k(ranked, qrels, k)

        # LLM 裁判 context 相关性（可选）
        judgments: list[bool] = []
        if use_judge:
            for c in chunks[:judge_k]:
                judgments.append(judge_chunk_relevant(item["question"], c["text"]))
                if not use_http:
                    time.sleep(0.2)
            for k in ks:
                if k <= judge_k:
                    metrics[f"context_precision@{k}"] = rm.context_precision_at_k(judgments, k)
                    metrics[f"context_hit@{k}"] = rm.context_hit_at_k(judgments, k)
            judged_n += 1

        # 聚合：锚点指标只在 has_anchor 时累计；context 指标只在 judged 时累计
        for key, val in metrics.items():
            if key.startswith("anchor_") and not has_anchor:
                continue
            agg[key] = agg.get(key, 0.0) + val

        per_query.append(
            {
                "id": item["id"],
                "topic": item.get("topic", ""),
                "anchors": list(qrels.keys()),
                "retrieved": rm.dedup_keep_order(ranked)[:depth],
                "judgments": judgments if use_judge else None,
                "metrics": metrics,
            }
        )
        if verbose:
            cp = metrics.get(f"context_precision@{min(judge_k, ks[-1])}")
            cp_s = f" ctxP@{min(judge_k, ks[-1])}={cp:.2f}" if cp is not None else ""
            print(
                f"{item['id']:<10} {item.get('topic',''):<18} "
                f"aR@{ks[-1]}={metrics.get(f'anchor_recall@{ks[-1]}',0):.2f} "
                f"aHit@{ks[-1]}={metrics.get(f'anchor_hit@{ks[-1]}',0):.0f}{cp_s}"
            )
        if not use_http:
            time.sleep(0.1)

    # 分母：锚点指标按「有锚点的题数」；context 指标按「judged 题数」
    n_anchor = max(len([p for p in per_query if p.get("anchors")]), 1)
    n_judge = max(judged_n, 1)
    summary: dict[str, float] = {}
    for key, total in agg.items():
        denom = n_judge if key.startswith("context_") else n_anchor
        summary[key] = round(total / denom, 4)
    summary["_n_in_scope"] = len(in_scope)
    summary["_n_anchored"] = n_anchor
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
        print(f"\n[gate] 基线文件不存在: {baseline_path}（跳过门禁）")
        return 0
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    thresholds: dict[str, float] = baseline.get("thresholds", {})
    if gate_variant not in results:
        print(f"\n[gate] 变体 {gate_variant} 无结果，无法门禁")
        return 1

    summary = results[gate_variant]["summary"]
    failures: list[str] = []
    rows = ["", "## 检索回归门禁 — variant=" + gate_variant, "", "| 指标 | 实测 | 下限 | 状态 |", "|---|---|---|---|"]
    print(f"\n=== 检索回归门禁（variant={gate_variant}，基线 {baseline_path.name}）===")
    for metric, floor in thresholds.items():
        actual = float(summary.get(metric, 0.0))
        ok = actual + 1e-9 >= float(floor)
        print(f"  {metric:<22} {actual:>7.3f}  下限 {float(floor):>6.3f}  [{'PASS' if ok else 'FAIL'}]")
        rows.append(f"| {metric} | {actual:.3f} | ≥ {float(floor)} | {'✅' if ok else '❌'} |")
        if not ok:
            failures.append(f"{metric} {actual:.3f} < {floor}")

    max_frr = baseline.get("abstention", {}).get("max_false_retrieval_rate")
    if max_frr is not None:
        frr = results[gate_variant]["abstention"]["false_retrieval_rate"]
        if frr is not None and frr >= 0:
            ok = frr <= float(max_frr) + 1e-9
            print(f"  {'false_retrieval_rate':<22} {frr:>7.3f}  上限 {float(max_frr):>6.3f}  [{'PASS' if ok else 'FAIL'}]")
            rows.append(f"| false_retrieval_rate | {frr:.3f} | ≤ {float(max_frr)} | {'✅' if ok else '❌'} |")
            if not ok:
                failures.append(f"false_retrieval_rate {frr:.3f} > {max_frr}")

    _emit_step_summary(rows)
    if failures:
        msg = "检索指标回归: " + "; ".join(failures)
        print(f"\n[gate] FAIL — {msg}")
        if os.getenv("GITHUB_ACTIONS"):
            print(f"::error::{msg}")
        return 1
    print("\n[gate] PASS — 所有检索指标达标")
    return 0


def evaluate(
    ks, use_http, tag, threshold, variant_arg, sweep=None, dataset_path=None,
    gate=False, baseline_path="retrieval_baseline.json", use_judge=False,
    judge_k=5, limit=None,
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

    print("=== FitCore 检索评估（锚点确定性 + 可选 LLM 裁判 context 相关性）===")
    print(f"数据集   : {ds_path.name}")
    print(f"配置     : {json.dumps(retriever.config_label(), ensure_ascii=False)}")
    print(
        f"in-scope : {len(in_scope)} 条 | abstention : {len(abstain)} 条 | 候选深度 : {depth}"
    )
    print(f"k 值     : {ks} | 变体 : {variants} | LLM 裁判 : {use_judge}（judge_k={judge_k}）")

    verbose = len(variants) == 1
    results: dict[str, dict] = {}
    for v in variants:
        summary, per_query, abst = _eval_one_variant(
            retriever, v, in_scope, abstain, ks, depth, threshold, use_judge,
            judge_k, use_http, verbose,
        )
        results[v] = {"summary": summary, "per_query": per_query, "abstention": abst}

    # ── 对比表 ──
    print("\n=== 变体对比（in-scope 平均）===")
    cmp_cols = [f"anchor_recall@{ks[-1]}", f"anchor_hit@{ks[-1]}", f"anchor_mrr@{ks[-1]}"]
    if use_judge:
        cmp_cols += [f"context_precision@{min(judge_k, ks[-1])}", f"context_hit@{min(judge_k, ks[-1])}"]
    cmp_header = f"{'variant':<12} " + " ".join(f"{c:>22}" for c in cmp_cols)
    print(cmp_header)
    print("-" * len(cmp_header))
    for v in variants:
        s = results[v]["summary"]
        print(f"{v:<12} " + " ".join(f"{s.get(c, 0):>22.3f}" for c in cmp_cols))

    print("\n[abstention] out-of-scope top-1 误召回率（越低越好；-1=后端无可比分数）")
    for v in variants:
        print(f"  {v:<12} false_retrieval_rate@{threshold}: {results[v]['abstention']['false_retrieval_rate']:.3f}")

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
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n报告已保存: {out_path}")

    if gate:
        return _run_gate(results, variants[0], Path(baseline_path))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="离线检索评估（锚点召回 + LLM 裁判 context 相关性）")
    parser.add_argument("--http", action="store_true", help="走 HTTP /v1/retrieve 而非进程内")
    parser.add_argument("--k", nargs="+", type=int, default=DEFAULT_KS, help="k 值列表，如 --k 3 5 10")
    parser.add_argument("--tag", default="", help="报告标签")
    parser.add_argument("--threshold", type=float, default=0.8, help="abstention 误召回分数阈值")
    parser.add_argument("--variant", default="ensemble", choices=["ensemble", "vector", "bm25", "all"])
    parser.add_argument("--sweep", nargs="*", type=float, help="向量权重扫描，如 --sweep 0 0.5 1.0")
    parser.add_argument("--dataset", default=None, help="评测集（默认 golden_dataset_en.json）")
    parser.add_argument("--judge", action="store_true", help="开启 LLM 裁判 context 相关性（需 LLM key）")
    parser.add_argument("--judge-k", type=int, default=5, help="每题 LLM 裁判前 N 个 chunk（控成本）")
    parser.add_argument("--limit", type=int, default=None, help="只评前 N 条 in-scope（控成本）")
    parser.add_argument("--gate", action="store_true", help="回归门禁：对照 --baseline 阈值")
    parser.add_argument("--baseline", default="retrieval_baseline.json")
    args = parser.parse_args()

    sweep = None
    if args.sweep is not None:
        sweep = args.sweep or [0.0, 0.2, 0.5, 0.8, 1.0]

    return evaluate(
        sorted(set(args.k)), args.http, args.tag, args.threshold, args.variant,
        sweep, args.dataset, args.gate, args.baseline, args.judge, args.judge_k,
        args.limit,
    )


if __name__ == "__main__":
    raise SystemExit(main())
