"""
离线检索指标（document/source 级）
==================================

纯函数，无外部依赖，便于单测。所有指标都作用在「已排序的检索结果」上：

- ranked_sources : list[str]
    检索器返回的 source 标识，按相关性从高到低排序。允许重复（同一文档的
    多个 chunk 命中）；本模块统一按「首次出现」去重到文档级再算指标。
- qrels : dict[str, int]
    该 query 的标准答案：{source: grade}，grade ∈ {1,2,3}（越大越相关）。
    二元指标（recall/precision/mrr/hit_rate）将 grade >= 1 视为相关。
    nDCG 使用分级 grade。

约定：k 会被截断到 ranked 列表长度；qrels 为空时，召回类指标返回 0.0。
"""

from __future__ import annotations

import math
from typing import Iterable, Mapping, Sequence


def dedup_keep_order(items: Iterable[str]) -> list[str]:
    """按首次出现顺序去重（把 chunk 级排名折叠到文档级，保留各文档最好名次）。"""
    seen: set[str] = set()
    out: list[str] = []
    for it in items:
        if it not in seen:
            seen.add(it)
            out.append(it)
    return out


def _relevant_set(qrels: Mapping[str, int]) -> set[str]:
    return {s for s, g in qrels.items() if g >= 1}


def hit_rate_at_k(
    ranked_sources: Sequence[str], qrels: Mapping[str, int], k: int
) -> float:
    """Top-k 内是否至少命中 1 个相关文档（1.0 / 0.0）。"""
    relevant = _relevant_set(qrels)
    if not relevant:
        return 0.0
    topk = dedup_keep_order(ranked_sources)[:k]
    return 1.0 if any(s in relevant for s in topk) else 0.0


def recall_at_k(
    ranked_sources: Sequence[str], qrels: Mapping[str, int], k: int
) -> float:
    """命中的相关文档数 / 相关文档总数。"""
    relevant = _relevant_set(qrels)
    if not relevant:
        return 0.0
    topk = dedup_keep_order(ranked_sources)[:k]
    hits = sum(1 for s in topk if s in relevant)
    return hits / len(relevant)


def precision_at_k(
    ranked_sources: Sequence[str], qrels: Mapping[str, int], k: int
) -> float:
    """命中的相关文档数 / k。"""
    if k <= 0:
        return 0.0
    relevant = _relevant_set(qrels)
    topk = dedup_keep_order(ranked_sources)[:k]
    hits = sum(1 for s in topk if s in relevant)
    return hits / k


def mrr_at_k(ranked_sources: Sequence[str], qrels: Mapping[str, int], k: int) -> float:
    """第一个相关文档名次的倒数（top-k 内无相关则为 0）。"""
    relevant = _relevant_set(qrels)
    if not relevant:
        return 0.0
    topk = dedup_keep_order(ranked_sources)[:k]
    for idx, s in enumerate(topk, start=1):
        if s in relevant:
            return 1.0 / idx
    return 0.0


def _dcg(gains: Sequence[float]) -> float:
    # gain_i / log2(i + 1)，i 从 1 开始
    return sum(g / math.log2(i + 1) for i, g in enumerate(gains, start=1))


def ndcg_at_k(ranked_sources: Sequence[str], qrels: Mapping[str, int], k: int) -> float:
    """分级 nDCG@k，增益采用 2^grade - 1。qrels 为空返回 0.0。"""
    if not qrels:
        return 0.0
    topk = dedup_keep_order(ranked_sources)[:k]
    gains = [(2 ** qrels.get(s, 0) - 1) for s in topk]
    dcg = _dcg(gains)

    ideal_grades = sorted(qrels.values(), reverse=True)[:k]
    ideal_gains = [(2**g - 1) for g in ideal_grades]
    idcg = _dcg(ideal_gains)

    if idcg == 0:
        return 0.0
    return dcg / idcg


def average_precision_at_k(
    ranked_sources: Sequence[str], qrels: Mapping[str, int], k: int
) -> float:
    """AP@k：命中处 precision 的均值（按相关文档总数归一）。"""
    relevant = _relevant_set(qrels)
    if not relevant:
        return 0.0
    topk = dedup_keep_order(ranked_sources)[:k]
    hits = 0
    score = 0.0
    for idx, s in enumerate(topk, start=1):
        if s in relevant:
            hits += 1
            score += hits / idx
    return score / min(len(relevant), k)


def compute_all(
    ranked_sources: Sequence[str], qrels: Mapping[str, int], ks: Sequence[int]
) -> dict[str, float]:
    """对给定的多个 k 一次性算出全部指标，返回扁平 dict，键如 'recall@5'。"""
    out: dict[str, float] = {}
    for k in ks:
        out[f"hit_rate@{k}"] = hit_rate_at_k(ranked_sources, qrels, k)
        out[f"recall@{k}"] = recall_at_k(ranked_sources, qrels, k)
        out[f"precision@{k}"] = precision_at_k(ranked_sources, qrels, k)
        out[f"mrr@{k}"] = mrr_at_k(ranked_sources, qrels, k)
        out[f"ndcg@{k}"] = ndcg_at_k(ranked_sources, qrels, k)
        out[f"ap@{k}"] = average_precision_at_k(ranked_sources, qrels, k)
    return out


def context_precision_at_k(judgments: Sequence[bool], k: int) -> float:
    """LLM-judged context precision@k = relevant chunks / k (over top-k judged).

    `judgments[i]` = whether the i-th retrieved chunk (rank order) was judged
    relevant to the query. Corpus-size agnostic: needs no exhaustive qrels, so
    it stays meaningful as the KB grows to thousands of documents.
    """
    if k <= 0:
        return 0.0
    topk = list(judgments)[:k]
    if not topk:
        return 0.0
    return sum(1 for j in topk if j) / k


def context_hit_at_k(judgments: Sequence[bool], k: int) -> float:
    """1.0 if at least one of the top-k chunks was judged relevant, else 0.0."""
    return 1.0 if any(list(judgments)[:k]) else 0.0


def false_retrieval_rate(
    top1_scores: Sequence[float | None], threshold: float
) -> float:
    """
    abstention 评估（仅对 out-of-scope query）：top-1 相似度 >= threshold
    视为「本不该召回却高分召回」。只统计有分数的样本；分数全为 None 时返回
    -1.0 表示当前后端不提供可比分数（base ensemble 常见），需启用打分后端。
    """
    scored = [s for s in top1_scores if s is not None]
    if not scored:
        return -1.0
    flagged = sum(1 for s in scored if s >= threshold)
    return flagged / len(scored)
