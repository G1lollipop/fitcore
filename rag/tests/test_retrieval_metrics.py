"""单测：eval/retrieval_metrics.py 的各指标边界与正确性。"""

from __future__ import annotations

import math
import sys
from pathlib import Path

# eval/ 不是常规包名（且 `eval` 是内置名），直接把 eval 目录加进 path 后按模块名导入。
_EVAL_DIR = Path(__file__).resolve().parents[1] / "eval"
if str(_EVAL_DIR) not in sys.path:
    sys.path.insert(0, str(_EVAL_DIR))

import retrieval_metrics as rm  # noqa: E402


def test_dedup_keep_order():
    assert rm.dedup_keep_order(["a", "b", "a", "c", "b"]) == ["a", "b", "c"]


def test_hit_rate():
    qrels = {"a.txt": 3}
    assert rm.hit_rate_at_k(["x.txt", "a.txt"], qrels, k=5) == 1.0
    assert rm.hit_rate_at_k(["x.txt", "y.txt"], qrels, k=5) == 0.0
    # 命中在第 2 位，但 k=1 截断后看不到
    assert rm.hit_rate_at_k(["x.txt", "a.txt"], qrels, k=1) == 0.0


def test_recall():
    qrels = {"a.txt": 3, "b.txt": 2}
    # 召回 1/2
    assert rm.recall_at_k(["a.txt", "x.txt"], qrels, k=5) == 0.5
    # 召回 2/2
    assert rm.recall_at_k(["a.txt", "b.txt"], qrels, k=5) == 1.0
    # k 截断后只看到 a
    assert rm.recall_at_k(["a.txt", "b.txt"], qrels, k=1) == 0.5


def test_precision():
    qrels = {"a.txt": 3, "b.txt": 1}
    # top-4 里命中 2 个 → 2/4
    assert rm.precision_at_k(["a.txt", "x.txt", "b.txt", "y.txt"], qrels, k=4) == 0.5
    assert rm.precision_at_k([], qrels, k=0) == 0.0


def test_mrr():
    qrels = {"a.txt": 3}
    assert rm.mrr_at_k(["a.txt", "x.txt"], qrels, k=5) == 1.0
    assert rm.mrr_at_k(["x.txt", "a.txt"], qrels, k=5) == 0.5
    assert rm.mrr_at_k(["x.txt", "y.txt", "a.txt"], qrels, k=5) == pytest_approx(1 / 3)
    assert rm.mrr_at_k(["x.txt"], qrels, k=5) == 0.0


def test_ndcg_perfect_ranking_is_one():
    qrels = {"a.txt": 3, "b.txt": 2, "c.txt": 1}
    ranked = ["a.txt", "b.txt", "c.txt"]
    assert rm.ndcg_at_k(ranked, qrels, k=3) == pytest_approx(1.0)


def test_ndcg_worse_ranking_is_lower():
    qrels = {"a.txt": 3, "b.txt": 2, "c.txt": 1}
    perfect = rm.ndcg_at_k(["a.txt", "b.txt", "c.txt"], qrels, k=3)
    shuffled = rm.ndcg_at_k(["c.txt", "b.txt", "a.txt"], qrels, k=3)
    assert shuffled < perfect
    assert 0.0 < shuffled < 1.0


def test_ndcg_manual_value():
    # 单个相关文档 grade=3 排在第 2 位：
    # gain = 2^3-1 = 7, DCG = 7/log2(3); IDCG = 7/log2(2)=7 → nDCG = 1/log2(3)
    qrels = {"a.txt": 3}
    val = rm.ndcg_at_k(["x.txt", "a.txt"], qrels, k=5)
    assert val == pytest_approx(1 / math.log2(3))


def test_average_precision():
    qrels = {"a.txt": 1, "b.txt": 1}
    # a 在 1，b 在 3：AP = (1/1 + 2/3)/2
    val = rm.average_precision_at_k(["a.txt", "x.txt", "b.txt"], qrels, k=5)
    assert val == pytest_approx((1.0 + 2 / 3) / 2)


def test_empty_qrels_returns_zero():
    assert rm.recall_at_k(["a.txt"], {}, k=5) == 0.0
    assert rm.ndcg_at_k(["a.txt"], {}, k=5) == 0.0
    assert rm.mrr_at_k(["a.txt"], {}, k=5) == 0.0


def test_compute_all_keys():
    qrels = {"a.txt": 3}
    out = rm.compute_all(["a.txt", "b.txt"], qrels, ks=[3, 5])
    assert "recall@3" in out and "ndcg@5" in out and "mrr@3" in out
    assert out["hit_rate@5"] == 1.0


def test_context_precision_and_hit():
    j = [True, False, True, False, False]
    assert rm.context_precision_at_k(j, 3) == pytest_approx(2 / 3)
    assert rm.context_precision_at_k(j, 5) == pytest_approx(2 / 5)
    assert rm.context_precision_at_k(j, 0) == 0.0
    assert rm.context_hit_at_k(j, 2) == 1.0
    assert rm.context_hit_at_k([False, False], 2) == 0.0
    assert rm.context_hit_at_k([], 3) == 0.0


def test_false_retrieval_rate():
    # 阈值 0.8：3 个分数里 2 个 >= 0.8 → 2/3
    assert rm.false_retrieval_rate([0.9, 0.85, 0.1], threshold=0.8) == pytest_approx(
        2 / 3
    )
    # 全 None → -1.0（后端不提供可比分数）
    assert rm.false_retrieval_rate([None, None], threshold=0.8) == -1.0


def pytest_approx(x: float):
    import pytest

    return pytest.approx(x, abs=1e-9)
