"""Failed requests must never produce a passing evaluation gate."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "eval"))

import eval_abstention  # noqa: E402
import eval_faithfulness  # noqa: E402
import evaluate  # noqa: E402


@pytest.mark.parametrize("module", [eval_abstention, eval_faithfulness])
def test_chat_failure_fails_gate_and_preserves_report(module, tmp_path, monkeypatch):
    dataset = tmp_path / "dataset.json"
    dataset.write_text(json.dumps([{"id": "case1", "question": "test", "in_scope": True}]))
    baseline = tmp_path / "baseline.json"
    baseline.write_text('{"thresholds": {}}')
    monkeypatch.setattr(module, "_EVAL_DIR", tmp_path)

    def failed_chat(*args):
        raise RuntimeError("HTTP 500")

    monkeypatch.setattr(module, "call_chat_http", failed_chat)
    run = getattr(module, "evaluate_abstention", None) or module.evaluate_faithfulness
    assert run(
        dataset_path=dataset, use_http=True, limit=None, gate=True,
        baseline_path=baseline, tag="test",
    ) == 1
    report = json.loads(next(tmp_path.glob("*_report_*.json")).read_text())
    assert report["results"][0]["error"] == "HTTP 500"


def test_answer_failure_still_writes_report(tmp_path, monkeypatch):
    dataset = tmp_path / "dataset.json"
    dataset.write_text(json.dumps([{"id": "case1", "question": "test"}]))
    monkeypatch.setattr(evaluate, "DATASET_PATH", dataset)
    monkeypatch.setattr(evaluate, "__file__", str(tmp_path / "evaluate.py"))
    monkeypatch.setattr(evaluate, "call_rag", lambda *args: {"error": "HTTP 500"})
    assert evaluate.evaluate() == 1
    report = json.loads(next(tmp_path.glob("eval_report_*.json")).read_text())
    assert report["summary"]["valid_cases"] == 0
    assert report["summary"]["error_cases"] == 1
