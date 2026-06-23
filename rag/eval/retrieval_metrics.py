"""
Offline retrieval metrics (document/source level)
==================================================

Pure functions with no external dependencies, easy to unit-test. All metrics
operate on "ranked retrieval results":

- ranked_sources : list[str]
    The source identifiers returned by the retriever, ordered from most to least
    relevant. Duplicates are allowed (multiple chunks of the same document
    hitting); this module deduplicates by "first occurrence" to the document
    level before computing metrics.
- qrels : dict[str, int]
    The gold answers for the query: {source: grade}, grade in {1,2,3} (higher is
    more relevant). Binary metrics (recall/precision/mrr/hit_rate) treat
    grade >= 1 as relevant. nDCG uses the graded grade.

Convention: k is truncated to the length of the ranked list; when qrels is
empty, recall-style metrics return 0.0.
"""

from __future__ import annotations

import math
from typing import Iterable, Mapping, Sequence


def dedup_keep_order(items: Iterable[str]) -> list[str]:
    """Deduplicate in first-occurrence order (collapse chunk-level ranking to document level, keeping each document's best rank)."""
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
    """Whether at least one relevant document is hit within the top-k (1.0 / 0.0)."""
    relevant = _relevant_set(qrels)
    if not relevant:
        return 0.0
    topk = dedup_keep_order(ranked_sources)[:k]
    return 1.0 if any(s in relevant for s in topk) else 0.0


def recall_at_k(
    ranked_sources: Sequence[str], qrels: Mapping[str, int], k: int
) -> float:
    """Number of relevant documents hit / total number of relevant documents."""
    relevant = _relevant_set(qrels)
    if not relevant:
        return 0.0
    topk = dedup_keep_order(ranked_sources)[:k]
    hits = sum(1 for s in topk if s in relevant)
    return hits / len(relevant)


def precision_at_k(
    ranked_sources: Sequence[str], qrels: Mapping[str, int], k: int
) -> float:
    """Number of relevant documents hit / k."""
    if k <= 0:
        return 0.0
    relevant = _relevant_set(qrels)
    topk = dedup_keep_order(ranked_sources)[:k]
    hits = sum(1 for s in topk if s in relevant)
    return hits / k


def mrr_at_k(ranked_sources: Sequence[str], qrels: Mapping[str, int], k: int) -> float:
    """Reciprocal of the rank of the first relevant document (0 if none within top-k)."""
    relevant = _relevant_set(qrels)
    if not relevant:
        return 0.0
    topk = dedup_keep_order(ranked_sources)[:k]
    for idx, s in enumerate(topk, start=1):
        if s in relevant:
            return 1.0 / idx
    return 0.0


def _dcg(gains: Sequence[float]) -> float:
    # gain_i / log2(i + 1), i starts at 1
    return sum(g / math.log2(i + 1) for i, g in enumerate(gains, start=1))


def ndcg_at_k(ranked_sources: Sequence[str], qrels: Mapping[str, int], k: int) -> float:
    """Graded nDCG@k using gain 2^grade - 1. Returns 0.0 when qrels is empty."""
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
    """AP@k: mean precision at hit positions (normalized by total relevant documents)."""
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
    """Compute all metrics at once for the given k values; returns a flat dict with keys like 'recall@5'."""
    out: dict[str, float] = {}
    for k in ks:
        out[f"hit_rate@{k}"] = hit_rate_at_k(ranked_sources, qrels, k)
        out[f"recall@{k}"] = recall_at_k(ranked_sources, qrels, k)
        out[f"precision@{k}"] = precision_at_k(ranked_sources, qrels, k)
        out[f"mrr@{k}"] = mrr_at_k(ranked_sources, qrels, k)
        out[f"ndcg@{k}"] = ndcg_at_k(ranked_sources, qrels, k)
        out[f"ap@{k}"] = average_precision_at_k(ranked_sources, qrels, k)
    return out


def keyword_coverage_at_k(
    chunk_texts: Sequence[str], keywords: Sequence[str], k: int
) -> float:
    """Deterministic content-quality score — NO LLM.

    Fraction of the question's expected_keywords that appear (case-insensitive
    substring) anywhere in the concatenated top-k retrieved chunk texts. Measures
    whether retrieval actually surfaced the expected key facts/numbers, which —
    unlike sparse file-level anchors — stays meaningful as the corpus grows to
    thousands of docs (it doesn't care WHICH doc supplied the fact).

    Empty keyword list → 1.0 (vacuous); callers should exclude such items from
    the aggregate. Substring match means it slightly UNDER-counts when the KB
    phrases a fact differently than the keyword (a known, conservative bias).
    """
    kws = [str(w).strip().lower() for w in keywords if str(w).strip()]
    if not kws:
        return 1.0
    blob = " ".join(t for t in list(chunk_texts)[:k] if t).lower()
    found = sum(1 for kw in kws if kw in blob)
    return found / len(kws)


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
    Abstention evaluation (only for out-of-scope queries): a top-1 similarity
    >= threshold counts as "retrieved with a high score when it should not have
    been." Only samples with scores are counted; when all scores are None it
    returns -1.0, meaning the current backend provides no comparable scores
    (common for the base ensemble) and a scoring backend must be enabled.
    """
    scored = [s for s in top1_scores if s is not None]
    if not scored:
        return -1.0
    flagged = sum(1 for s in scored if s >= threshold)
    return flagged / len(scored)
