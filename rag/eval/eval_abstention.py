"""
Generation-layer abstention eval for /v1/chat.

Uses golden_dataset_en.json:
  - in_scope=false → should abstain (refuse / insufficient evidence)
  - in_scope=true  → should NOT abstain

Metrics: precision / recall / F1 / accuracy (see generation_metrics.abstention_confusion).

Run:
    python eval/eval_abstention.py
    RETRIEVAL_MIN_SCORE=0.35 python eval/eval_abstention.py --gate
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

from generation_metrics import abstention_confusion, is_abstention_response  # noqa: E402

DATASET_PATH = _EVAL_DIR / "golden_dataset_en.json"
DEFAULT_BASELINE = _EVAL_DIR / "abstention_baseline.json"


def call_chat_inprocess(question: str, session_id: str) -> dict:
    from app.services.rag_service import RagService  # noqa: WPS433

    rag = RagService()
    rag.warmup()
    return rag.chat(question, session_id, user_context={}, top_k=None)


def call_chat_http(question: str, session_id: str, base_url: str) -> dict:
    import requests  # noqa: WPS433

    resp = requests.post(
        f"{base_url.rstrip('/')}/v1/chat",
        json={"query": question, "sessionId": session_id, "userContext": {}},
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    return {
        "answer": data.get("answer", ""),
        "retrieval_meta": data.get("retrievalMeta", {}),
    }


def predicted_abstain(answer: str, retrieval_meta: dict) -> bool:
    if retrieval_meta.get("abstained"):
        return True
    return is_abstention_response(answer)


def evaluate_abstention(
    *,
    dataset_path: Path,
    use_http: bool,
    limit: int | None,
    gate: bool,
    baseline_path: Path,
    tag: str,
) -> int:
    dataset: list[dict] = json.loads(dataset_path.read_text(encoding="utf-8"))
    if limit:
        dataset = dataset[:limit]

    base_url = os.getenv("RAG_SERVICE_URL", "http://127.0.0.1:8000")
    min_score = os.getenv("RETRIEVAL_MIN_SCORE", "0")
    print("=== FitCore Generation-Layer Abstention Eval ===")
    print(f"Cases: {len(dataset)} | RETRIEVAL_MIN_SCORE={min_score}")
    print(f"Mode: {'HTTP' if use_http else 'in-process'}\n")

    should: list[bool] = []
    pred: list[bool] = []
    rows: list[dict] = []

    for item in dataset:
        q = item["question"]
        exp_abstain = not item.get("in_scope", True)
        sid = f"abst_{item['id']}_{int(time.time())}"

        try:
            result = (
                call_chat_http(q, sid, base_url)
                if use_http
                else call_chat_inprocess(q, sid)
            )
        except Exception as exc:  # noqa: BLE001
            print(f"{item['id']}: ERROR {exc}")
            continue

        meta = result.get("retrieval_meta") or {}
        got = predicted_abstain(result.get("answer", ""), meta)
        should.append(exp_abstain)
        pred.append(got)
        ok = exp_abstain == got
        rows.append(
            {
                "id": item["id"],
                "in_scope": item.get("in_scope", True),
                "expected_abstain": exp_abstain,
                "predicted_abstain": got,
                "correct": ok,
                "retrieval_meta": meta,
                "answer_preview": (result.get("answer") or "")[:160],
            }
        )
        mark = "OK" if ok else "MISS"
        print(f"{item['id']} [{mark}] expected_abstain={exp_abstain} got={got}")
        time.sleep(0.4)

    metrics = abstention_confusion(should_abstain=should, predicted_abstain=pred)
    print("\n--- Summary ---")
    for k in ("precision", "recall", "f1", "accuracy"):
        print(f"{k}: {metrics[k]}")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = _EVAL_DIR / f"abstention_report_{tag + '_' if tag else ''}{ts}.json"
    report_path.write_text(
        json.dumps(
            {
                "evaluated_at": datetime.now().isoformat(),
                "retrieval_min_score": min_score,
                "summary": metrics,
                "results": rows,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\nReport: {report_path}")

    if not gate:
        return 0

    if not baseline_path.is_absolute():
        baseline_path = _EVAL_DIR / baseline_path
    if not baseline_path.exists():
        print(f"[gate] baseline missing: {baseline_path}")
        return 0

    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    thresholds = baseline.get("thresholds", {})
    failures: list[str] = []
    for metric, floor in thresholds.items():
        actual = float(metrics.get(metric, 0))
        if actual + 1e-9 < float(floor):
            failures.append(f"{metric} {actual:.3f} < {floor}")

    max_fp = baseline.get("max_false_abstention_rate")
    if max_fp is not None and metrics["tn"] + metrics["fp"] > 0:
        fp_rate = metrics["fp"] / (metrics["tn"] + metrics["fp"])
        if fp_rate > float(max_fp) + 1e-9:
            failures.append(f"false_abstention_rate {fp_rate:.3f} > {max_fp}")

    if failures:
        print("[gate] FAIL:", "; ".join(failures))
        return 1
    print("[gate] PASS")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Generation-layer abstention eval")
    parser.add_argument("--http", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--gate", action="store_true")
    parser.add_argument("--baseline", default=str(DEFAULT_BASELINE.name))
    parser.add_argument("--dataset", default=str(DATASET_PATH.name))
    parser.add_argument("--tag", default="")
    args = parser.parse_args()

    ds = _EVAL_DIR / args.dataset if not Path(args.dataset).is_absolute() else Path(args.dataset)
    return evaluate_abstention(
        dataset_path=ds,
        use_http=args.http,
        limit=args.limit,
        gate=args.gate,
        baseline_path=Path(args.baseline),
        tag=args.tag,
    )


if __name__ == "__main__":
    raise SystemExit(main())
