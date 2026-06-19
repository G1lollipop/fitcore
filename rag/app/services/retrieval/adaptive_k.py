"""
Heuristic to pick the final number of documents (k) returned to the LLM.

Recall-side keeps k=10 wide for high coverage; this function trims after
reranking. Pure string heuristics — no LLM call, zero added latency.
"""


def compute_retrieval_k(query: str) -> int:
    """
    自适应计算最终使用的文档数量 k。

    复杂度判断逻辑：
      - 复杂型（多概念对比 / 综合方案）→ k=8
      - 简单事实型（定义 / 单一数值）  → k=3
      - 默认中等复杂度                → k=5
    """
    _COMPLEX_SIGNALS = [
        "区别",
        "对比",
        "比较",
        "计划",
        "方案",
        "怎么",
        "如何",
        "步骤",
        "流程",
        "综合",
        "全面",
        "详细",
        "总结",
        "分析",
        "difference",
        "compare",
        "how to",
        "plan",
        "explain",
    ]
    _SIMPLE_SIGNALS = [
        "是什么",
        "定义",
        "叫什么",
        "英文",
        "what is",
        "多少克",
        "多少次",
        "几组",
        "几天",
    ]

    q = query.strip()
    complex_hits = sum(1 for s in _COMPLEX_SIGNALS if s in q)
    simple_hits = sum(1 for s in _SIMPLE_SIGNALS if s in q)
    char_count = len(q)

    if complex_hits >= 2 or char_count > 40:
        return 8
    if simple_hits >= 1 and complex_hits == 0:
        return 3
    return 5
