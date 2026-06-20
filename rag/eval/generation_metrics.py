"""
Generation-layer evaluation metrics (faithfulness + abstention).

Pure functions — no LLM / network — covered by unit tests.
LLM-judge helpers live in eval_faithfulness.py / eval_abstention.py.
"""

from __future__ import annotations

import re
from typing import Sequence

# Phrases indicating the model refused due to insufficient KB evidence.
ABSTENTION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"insufficient (evidence|information|data)", re.I),
    re.compile(r"don'?t have (enough|sufficient) (evidence|information|data)", re.I),
    re.compile(r"not enough (evidence|information|data)", re.I),
    re.compile(r"cannot find (relevant|specific) (information|evidence|data)", re.I),
    re.compile(r"no relevant (information|evidence|content|references)", re.I),
    re.compile(r"outside (my|the) (knowledge base|available references)", re.I),
    re.compile(r"beyond (what|the) (I|the) (can|have)", re.I),
    re.compile(r"资料不足"),
    re.compile(r"没有(找到|足够|相关)"),
    re.compile(r"无法(找到|提供).*依据"),
    re.compile(r"知识库.*(没有|未找到|无相关)"),
)


def is_abstention_response(answer: str) -> bool:
    """Heuristic: did the model refuse / say evidence is insufficient?"""
    text = (answer or "").strip()
    if not text:
        return False
    return any(p.search(text) for p in ABSTENTION_PATTERNS)


def split_atomic_claims(answer: str) -> list[str]:
    """
    Split an answer into candidate atomic statements for faithfulness checking.
    Uses sentence boundaries — LLM-judge refines further in eval_faithfulness.py.
    """
    text = (answer or "").strip()
    if not text:
        return []
    # Split on sentence-ending punctuation (EN + ZH).
    parts = re.split(r"(?<=[.!?。！？])\s+", text)
    claims: list[str] = []
    for part in parts:
        chunk = part.strip()
        if len(chunk) < 8:
            continue
        # Drop pure pleasantries / abstention-only lines from claim list.
        if is_abstention_response(chunk) and len(chunk) < 120:
            continue
        claims.append(chunk)
    return claims


def faithfulness_from_verdicts(supported: Sequence[bool]) -> float:
    """Fraction of atomic claims marked supported by context."""
    if not supported:
        return 1.0  # vacuously faithful (no factual claims)
    return sum(1 for s in supported if s) / len(supported)


def abstention_confusion(
    *,
    should_abstain: Sequence[bool],
    predicted_abstain: Sequence[bool],
) -> dict[str, float]:
    """
    Binary abstention metrics.
    should_abstain=True  → out-of-scope / no KB support expected.
    predicted_abstain    → model refused or retrieval layer abstained.
    """
    if len(should_abstain) != len(predicted_abstain):
        raise ValueError("label and prediction length mismatch")
    tp = fp = fn = tn = 0
    for exp, pred in zip(should_abstain, predicted_abstain, strict=True):
        if exp and pred:
            tp += 1
        elif not exp and pred:
            fp += 1
        elif exp and not pred:
            fn += 1
        else:
            tn += 1
    n = len(should_abstain) or 1
    precision = tp / (tp + fp) if (tp + fp) else 1.0
    recall = tp / (tp + fn) if (tp + fn) else 1.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall)
        else 0.0
    )
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "accuracy": round((tp + tn) / n, 4),
    }
