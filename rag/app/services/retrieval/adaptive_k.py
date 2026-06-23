"""
Heuristic to pick the final number of documents (k) returned to the LLM.

Recall-side keeps k=10 wide for high coverage; this function trims after
reranking. Pure string heuristics — no LLM call, zero added latency.
"""


def compute_retrieval_k(query: str) -> int:
    """
    Adaptively compute the final number of documents (k) to use.

    Complexity heuristic:
      - Complex (multi-concept comparison / comprehensive plan) -> k=8
      - Simple factual (definition / single value)             -> k=3
      - Default medium complexity                              -> k=5

    Note: the keyword signal lists below are substring-matched against the
    query text.
    """
    _COMPLEX_SIGNALS = [
        "difference",
        "contrast",
        "compare",
        "comparison",
        "plan",
        "program",
        "how to",
        "how do",
        "steps",
        "process",
        "comprehensive",
        "thorough",
        "detailed",
        "summary",
        "analyze",
        "explain",
    ]
    _SIMPLE_SIGNALS = [
        "what is",
        "definition",
        "what's it called",
        "how many grams",
        "how many reps",
        "how many sets",
        "how many days",
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
