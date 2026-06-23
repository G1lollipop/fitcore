"""Unit tests for generation-layer eval metrics (faithfulness + abstention)."""

from __future__ import annotations

import sys
from pathlib import Path

_EVAL_DIR = Path(__file__).resolve().parents[1] / "eval"
if str(_EVAL_DIR) not in sys.path:
    sys.path.insert(0, str(_EVAL_DIR))

import generation_metrics as gm  # noqa: E402


def test_is_abstention_response_en():
    assert gm.is_abstention_response(
        "I don't have enough evidence in the knowledge base to answer that."
    )
    assert gm.is_abstention_response(
        "There is no relevant information in the references provided."
    )


def test_is_abstention_response_negative():
    assert not gm.is_abstention_response("Creatine helps replenish ATP during training.")
    assert not gm.is_abstention_response("")


def test_split_atomic_claims():
    text = "Creatine supports ATP. Take 3-5 g daily. Hi there!"
    claims = gm.split_atomic_claims(text)
    assert len(claims) >= 2
    assert any("Creatine" in c for c in claims)


def test_faithfulness_from_verdicts():
    assert gm.faithfulness_from_verdicts([True, True, False]) == 2 / 3
    assert gm.faithfulness_from_verdicts([]) == 1.0


def test_abstention_confusion():
    m = gm.abstention_confusion(
        should_abstain=[True, True, False, False],
        predicted_abstain=[True, False, False, True],
    )
    assert m["tp"] == 1
    assert m["fn"] == 1
    assert m["fp"] == 1
    assert m["tn"] == 1
    assert m["recall"] == 0.5
    assert m["precision"] == 0.5
