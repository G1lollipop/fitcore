"""
离线检索评估 Runner
====================

独立于 LLM-as-Judge（evaluate.py），只评「检索层」本身的质量：把每条 in-scope
query 的检索结果（ranked source 列表）对照 golden_dataset.json 里的 qrels，算出
Recall@k / Precision@k / MRR@k / nDCG@k / hit_rate@k；对 out-of-scope（abstention）
query 统计 top-1 分数分布与 false_retrieval_rate。

两种取数模式：
  - 进程内（默认）：直接 import 并调用 RagService.retrieve()，不必起 HTTP 服务。
      需要 GOOGLE_AI_STUDIO_API_KEY（embedding）及向量库已灌入。
  - HTTP（--http）：POST {RAG_SERVICE_URL}/v1/retrieve，评估线上端点。

运行（在 rag/，已激活 .venv）：
    python eval/eval_retrieval.py
    python eval/eval_retrieval.py --http --k 3 5 10
    python eval/eval_retrieval.py --tag ensemble_baseline   # 给本次报告打标签

报告：控制台对比表 + eval/retrieval_report_<tag>_<ts>.json
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
# _ROOT 让 `app.*` 可导入；_EVAL_DIR 让同目录的 retrieval_metrics 可导入。
for _p in (str(_ROOT), str(_EVAL_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import retrieval_metrics as rm  # noqa: E402  (eval/ 同目录模块)

# 英文集为主集（KB 全为英文文献，产品也走全英文）；与 CI 门禁保持一致。
DATASET_PATH = _EVAL_DIR / "golden_dataset_en.json"  # noqa: E305
DEFAULT_KS = [3, 5, 10]
# 检索候选深度：取够 max(k) 条用于算 @k 指标。
RETRIEVE_DEPTH_ENV = "EVAL_RETRIEVE_DEPTH"


# ─── 取数：ranked sources + top1 score ──────────────────────────────────────


def _sources_from_docs(docs) -> tuple[list[str], float | None]:
    """从 LangChain Document 列表抽 (ranked_sources, top1_score)。"""
    ranked: list[str] = []
    top1_score: float | None = None
    for i, d in enumerate(docs):
        meta = getattr(d, "metadata", None) or {}
        ranked.append(meta.get("source") or meta.get("title") or f"doc{i}")
        if i == 0:
            s = meta.get("relevance_score")
            if s is None:
                s = meta.get("score")
            top1_score = float(s) if isinstance(s, (int, float)) else None
    return ranked, top1_score


def _sources_from_http(chunks: list[dict]) -> tuple[list[str], float | None]:
    ranked = [
        c.get("source") or c.get("title") or f"doc{i}" for i, c in enumerate(chunks)
    ]
    top1 = None
    if chunks:
        s = chunks[0].get("score")
        top1 = float(s) if isinstance(s, (int, float)) else None
    return ranked, top1


class ProcessInRetriever:
    """进程内调用 RagService.retrieve()。支持切换检索变体做对照实验。"""

    def __init__(self, depth: int = 10) -> None:
        from app.services.rag_service import RagService  # noqa: WPS433

        self.rag = RagService()
        self.rag.warmup()
        self._depth = depth
        self._variant = "ensemble"
        self._variant_retrievers: dict = {}

    def available_variants(self) -> list[str]:
        """Chroma / Supabase 后端都能拆 vector / bm25 单路做对照。"""
        return ["bm25", "vector", "ensemble"]

    def _is_supabase(self) -> bool:
        # Chroma 服务有 .vector_store；Supabase 服务有 .client。
        return not hasattr(self.rag.vector_service, "vector_store")

    def _all_corpus_docs(self):
        """取全量 chunk 文档（给 BM25 建索引）。两后端通用。"""
        from langchain_core.documents import Document  # noqa: WPS433

        vs = self.rag.vector_service
        if self._is_supabase():
            from app.services.retrieval.supabase_store import fetch_all_chunk_documents  # noqa: WPS433

            return fetch_all_chunk_documents(vs.client)
        data = vs.vector_store.get()
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
            # 加权融合：w= 向量权重，BM25 权重 = 1 - w。
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

    def _bm25_retriever(self):
        if getattr(self, "_bm25_sub", None) is not None:
            return self._bm25_sub
        from langchain_community.retrievers import BM25Retriever  # noqa: WPS433

        r = BM25Retriever.from_documents(self._all_corpus_docs())
        r.k = self._depth
        self._bm25_sub = r
        return r

    def set_variant(self, variant: str) -> None:
        self._variant = variant
        self._build_variant(variant)

    def retrieve(self, query: str, depth: int) -> tuple[list[str], float | None]:
        retriever = self._build_variant(self._variant)
        docs = retriever.invoke(query)[:depth]
        return _sources_from_docs(docs)

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
    """调用 {RAG_SERVICE_URL}/v1/retrieve。"""

    def __init__(self) -> None:
        self.base = os.getenv("RAG_SERVICE_URL", "http://127.0.0.1:8000")

    def retrieve(self, query: str, depth: int) -> tuple[list[str], float | None]:
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
        return _sources_from_http(resp.json().get("chunks", []))

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


# ─── 主流程 ─────────────────────────────────────────────────────────────────


def _eval_one_variant(
    retriever, variant, in_scope, abstain, ks, depth, threshold, use_http, verbose
):
    """对单个检索变体跑全量 query，返回 (summary, per_query, abstention)。"""
    retriever.set_variant(variant)
    per_query: list[dict] = []
    agg: dict[str, float] = {}

    if verbose:
        header = (
            f"{'ID':<10} {'topic':<20} "
            + " ".join(f"{'R@' + str(k):>6}" for k in ks)
            + f" {'nDCG@' + str(ks[-1]):>8} {'MRR':>6}"
        )
        print(f"\n--- variant = {variant} ---")
        print(header)
        print("-" * len(header))

    for item in in_scope:
        qrels = {
            rs["source"]: int(rs.get("grade", 1))
            for rs in item.get("relevant_sources", [])
        }
        try:
            ranked, _ = retriever.retrieve(item["question"], depth)
        except Exception as exc:  # noqa: BLE001
            per_query.append({"id": item["id"], "error": str(exc)})
            if verbose:
                print(f"{item['id']:<10} ERROR: {exc}")
            continue

        metrics = rm.compute_all(ranked, qrels, ks)
        for key, val in metrics.items():
            agg[key] = agg.get(key, 0.0) + val
        per_query.append(
            {
                "id": item["id"],
                "question": item["question"],
                "topic": item.get("topic", ""),
                "relevant_sources": list(qrels.keys()),
                "retrieved": rm.dedup_keep_order(ranked)[:depth],
                "metrics": metrics,
            }
        )
        if verbose:
            row = f"{item['id']:<10} {item.get('topic', ''):<20} "
            row += " ".join(f"{metrics[f'recall@{k}']:>6.2f}" for k in ks)
            row += (
                f" {metrics[f'ndcg@{ks[-1]}']:>8.3f} {metrics[f'mrr@{ks[-1]}']:>6.2f}"
            )
            print(row)
        if not use_http:
            time.sleep(0.15)

    n = max(len([p for p in per_query if "metrics" in p]), 1)
    summary = {key: round(total / n, 4) for key, total in agg.items()}
    if verbose:
        print("-" * len(header))
        avg = f"{'平均':<10} {'':<20} "
        avg += " ".join(f"{summary.get(f'recall@{k}', 0):>6.3f}" for k in ks)
        avg += f" {summary.get(f'ndcg@{ks[-1]}', 0):>8.3f} {summary.get(f'mrr@{ks[-1]}', 0):>6.2f}"
        print(avg)

    # abstention
    top1s: list[float | None] = []
    detail: list[dict] = []
    for item in abstain:
        try:
            ranked, top1 = retriever.retrieve(item["question"], depth)
        except Exception as exc:  # noqa: BLE001
            detail.append({"id": item["id"], "error": str(exc)})
            continue
        top1s.append(top1)
        detail.append(
            {
                "id": item["id"],
                "top1_source": ranked[0] if ranked else None,
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
    """CI 友好：若在 GitHub Actions 里，把门禁结果写进 job summary。"""
    path = os.getenv("GITHUB_STEP_SUMMARY")
    if not path:
        return
    try:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
    except OSError:
        pass


def _run_gate(results: dict, gate_variant: str, baseline_path: Path) -> int:
    """对照 baseline 阈值检查 gate_variant 的指标，回归则返回非 0。

    baseline JSON 结构（见 eval/retrieval_baseline.json）：
      { "variant": "ensemble",
        "thresholds": { "recall@10": 0.95, "ndcg@10": 0.90, ... },
        "abstention": { "max_false_retrieval_rate": 0.34 } }  # 可选
    """
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
    rows = [
        "",
        "## 检索回归门禁 — variant=" + gate_variant,
        "",
        "| 指标 | 实测 | 下限 | 状态 |",
        "|---|---|---|---|",
    ]
    print(f"\n=== 检索回归门禁（variant={gate_variant}，基线 {baseline_path.name}）===")
    for metric, floor in thresholds.items():
        actual = float(summary.get(metric, 0.0))
        ok = actual + 1e-9 >= float(floor)
        status = "PASS" if ok else "FAIL"
        print(f"  {metric:<12} {actual:>7.3f}  下限 {float(floor):>6.3f}  [{status}]")
        rows.append(
            f"| {metric} | {actual:.3f} | ≥ {float(floor)} | {'✅' if ok else '❌'} |"
        )
        if not ok:
            failures.append(f"{metric} {actual:.3f} < {floor}")

    abst_rule = baseline.get("abstention", {})
    max_frr = abst_rule.get("max_false_retrieval_rate")
    if max_frr is not None:
        frr = results[gate_variant]["abstention"]["false_retrieval_rate"]
        if frr is not None and frr >= 0:  # -1 = 后端无可比分数，跳过
            ok = frr <= float(max_frr) + 1e-9
            status = "PASS" if ok else "FAIL"
            print(f"  {'frr':<12} {frr:>7.3f}  上限 {float(max_frr):>6.3f}  [{status}]")
            rows.append(
                f"| false_retrieval_rate | {frr:.3f} | ≤ {float(max_frr)} | {'✅' if ok else '❌'} |"
            )
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
    ks,
    use_http,
    tag,
    threshold,
    variant_arg,
    sweep=None,
    dataset_path=None,
    gate=False,
    baseline_path="retrieval_baseline.json",
) -> int:
    ds_path = Path(dataset_path) if dataset_path else DATASET_PATH
    if not ds_path.is_absolute():
        ds_path = _EVAL_DIR / ds_path
    print(f"数据集     : {ds_path.name}")
    dataset = json.loads(ds_path.read_text(encoding="utf-8"))
    in_scope = [d for d in dataset if d.get("in_scope")]
    abstain = [d for d in dataset if not d.get("in_scope")]

    depth = max(int(os.getenv(RETRIEVE_DEPTH_ENV, max(ks))), max(ks))
    retriever = HttpRetriever() if use_http else ProcessInRetriever(depth=depth)

    if sweep:
        # 权重扫描：每个值是向量权重，BM25 权重 = 1 - 它。
        variants = [f"w={round(w, 3)}" for w in sweep]
    elif variant_arg == "all":
        variants = retriever.available_variants()
    else:
        variants = [variant_arg]

    print("=== FitCore 检索评估（离线，document 级 qrels）===")
    print(f"配置     : {json.dumps(retriever.config_label(), ensure_ascii=False)}")
    print(
        f"in-scope : {len(in_scope)} 条 | abstention : {len(abstain)} 条 | 候选深度 : {depth}"
    )
    print(f"k 值     : {ks} | 变体 : {variants}")

    # 单变体时打印逐题明细；多变体对比时只打印对比表，避免刷屏。
    verbose = len(variants) == 1
    results: dict[str, dict] = {}
    for v in variants:
        summary, per_query, abst = _eval_one_variant(
            retriever, v, in_scope, abstain, ks, depth, threshold, use_http, verbose
        )
        results[v] = {"summary": summary, "per_query": per_query, "abstention": abst}

    # ── 对比表 ──────────────────────────────────────────────────────────────
    print("\n=== 变体对比（in-scope 平均）===")
    cmp_cols = [
        f"recall@{ks[0]}",
        f"recall@{ks[-1]}",
        f"ndcg@{ks[-1]}",
        f"mrr@{ks[-1]}",
    ]
    cmp_header = f"{'variant':<12} " + " ".join(f"{c:>12}" for c in cmp_cols)
    print(cmp_header)
    print("-" * len(cmp_header))
    for v in variants:
        s = results[v]["summary"]
        row = f"{v:<12} " + " ".join(f"{s.get(c, 0):>12.3f}" for c in cmp_cols)
        print(row)

    print(
        "\n[abstention] out-of-scope top-1 分数误召回率（越低越好；-1=后端无可比分数）"
    )
    for v in variants:
        frr = results[v]["abstention"]["false_retrieval_rate"]
        print(f"  {v:<12} false_retrieval_rate@{threshold}: {frr:.3f}")

    # ── 写报告 ──────────────────────────────────────────────────────────────
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    tag_part = f"{tag}_" if tag else ""
    report = {
        "evaluated_at": datetime.now().isoformat(),
        "tag": tag,
        "config": retriever.config_label(),
        "ks": ks,
        "retrieve_depth": depth,
        "variants": variants,
        "results": results,
    }
    out_path = _EVAL_DIR / f"retrieval_report_{tag_part}{ts}.json"
    out_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\n报告已保存: {out_path}")

    if gate:
        # 门禁只对单一生产变体生效（默认 ensemble）；sweep / all 取第一项。
        return _run_gate(results, variants[0], Path(baseline_path))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="离线检索评估（Recall/MRR/nDCG）")
    parser.add_argument(
        "--http", action="store_true", help="走 HTTP /v1/retrieve 而非进程内"
    )
    parser.add_argument(
        "--k", nargs="+", type=int, default=DEFAULT_KS, help="k 值列表，如 --k 3 5 10"
    )
    parser.add_argument("--tag", default="", help="报告标签（标记本次配置）")
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.8,
        help="abstention false_retrieval 分数阈值",
    )
    parser.add_argument(
        "--variant",
        default="ensemble",
        choices=["ensemble", "vector", "bm25", "all"],
        help="检索变体；all=对比 bm25/vector/ensemble",
    )
    parser.add_argument(
        "--sweep",
        nargs="*",
        type=float,
        help="向量权重扫描，如 --sweep 0 0.2 0.5 0.8 1.0（不带值则用默认网格）",
    )
    parser.add_argument(
        "--dataset",
        default=None,
        help="评测集文件名（默认 golden_dataset_en.json 主集；跨语种难例用 golden_dataset.json）",
    )
    parser.add_argument(
        "--gate",
        action="store_true",
        help="回归门禁：评测后对照 --baseline 阈值，指标回归则退出码非 0（供 CI 用）",
    )
    parser.add_argument(
        "--baseline",
        default="retrieval_baseline.json",
        help="门禁基线阈值文件（默认 eval/retrieval_baseline.json）",
    )
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
    )


if __name__ == "__main__":
    raise SystemExit(main())
