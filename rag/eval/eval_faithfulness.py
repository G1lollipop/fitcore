"""
RAGAS-style faithfulness / groundedness eval for /v1/chat answers.

For each in-scope golden question:
  1. Call /v1/chat (or RagService.chat in-process).
  2. Split the answer into atomic claims.
  3. LLM-judge: is each claim supported by retrieved context snippets?

Also reports answer_relevancy proxy (existing LLM-judge relevance from evaluate.py).

Run (rag/, venv active, backend up OR in-process):
    python eval/eval_faithfulness.py
    python eval/eval_faithfulness.py --gate
"""

from __future__ import annotations

import argparse
import json
import os
import re
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

from langchain_openai import ChatOpenAI  # noqa: E402

from app.core.settings import get_settings  # noqa: E402
from generation_metrics import (  # noqa: E402
    faithfulness_from_verdicts,
    split_atomic_claims,
)

DATASET_PATH = _EVAL_DIR / "golden_dataset_en.json"
DEFAULT_BASELINE = _EVAL_DIR / "faithfulness_baseline.json"


def _build_judge() -> ChatOpenAI:
    settings = get_settings()
    if not settings.llm_api_key:
        raise RuntimeError("LLM API key not configured")
    model = os.getenv("EVAL_JUDGE_MODEL") or settings.rag_chat_model
    return ChatOpenAI(
        model=model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        temperature=0,
    )


_JUDGE: ChatOpenAI | None = None
_JUDGE_ERROR_COUNT = 0


def get_judge() -> ChatOpenAI:
    global _JUDGE
    if _JUDGE is None:
        _JUDGE = _build_judge()
    return _JUDGE


def judge_claim_supported(claim: str, context: str) -> bool:
    """LLM-as-judge: is this atomic claim entailed by the retrieved context?"""
    global _JUDGE_ERROR_COUNT
    if not context.strip():
        return False
    prompt = f"""You are evaluating RAG faithfulness (groundedness).

Retrieved context:
\"\"\"
{context[:6000]}
\"\"\"

Claim to verify:
\"{claim}\"

Is the claim fully supported by the context (no information beyond what context states)?
Answer ONLY "yes" or "no"."""
    try:
        resp = get_judge().invoke(prompt)
        text = (resp.content or "").strip().lower()
        return text.startswith("yes") or text == "y"
    except Exception as exc:  # noqa: BLE001
        _JUDGE_ERROR_COUNT += 1
        print(f"  [judge error] {exc}")
        return False


def judge_answer_relevancy(question: str, answer: str) -> float:
    """0-1 proxy for RAGAS answer_relevancy (single LLM score)."""
    global _JUDGE_ERROR_COUNT
    if not answer.strip():
        return 0.0
    prompt = f"""Rate how relevant this answer is to the question on a 1-5 integer scale.
5 = directly and fully addresses the question; 1 = off-topic or empty.

Question: {question}
Answer: {answer[:2000]}

Reply JSON only: {{"score": <1-5>}}"""
    try:
        resp = get_judge().invoke(prompt)
        text = (resp.content or "").strip()
        m = re.search(r"\{[^{}]+\}", text)
        if not m:
            raise ValueError("Judge returned no score JSON")
        data = json.loads(m.group())
        return round(float(data.get("score", 0)) / 5.0, 3)
    except Exception as exc:  # noqa: BLE001
        _JUDGE_ERROR_COUNT += 1
        print(f"  [judge error] {exc}")
        return 0.0


def call_chat_inprocess(question: str, session_id: str) -> dict:
    from app.services.rag_service import RagService  # noqa: WPS433

    rag = RagService()
    rag.warmup()
    result = rag.chat(question, session_id, user_context={}, top_k=None)
    ctx_parts = [c.get("snippet", "") for c in result.get("citations", [])]
    return {
        "answer": result.get("answer", ""),
        "context": "\n\n".join(ctx_parts),
        "citations": result.get("citations", []),
        "retrieval_meta": result.get("retrieval_meta", {}),
    }


def call_chat_http(question: str, session_id: str, base_url: str) -> dict:
    import requests  # noqa: WPS433

    resp = requests.post(
        f"{base_url.rstrip('/')}/v1/chat",
        json={"query": question, "sessionId": session_id, "userContext": {}},
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    ctx = "\n\n".join(c.get("snippet", "") for c in data.get("citations", []))
    return {
        "answer": data.get("answer", ""),
        "context": ctx,
        "citations": data.get("citations", []),
        "retrieval_meta": data.get("retrievalMeta", {}),
    }


def evaluate_faithfulness(
    *,
    dataset_path: Path,
    use_http: bool,
    limit: int | None,
    gate: bool,
    baseline_path: Path,
    tag: str,
) -> int:
    global _JUDGE_ERROR_COUNT
    _JUDGE_ERROR_COUNT = 0

    dataset: list[dict] = json.loads(dataset_path.read_text(encoding="utf-8"))
    in_scope = [d for d in dataset if d.get("in_scope", True)]
    if limit:
        in_scope = in_scope[:limit]

    base_url = os.getenv("RAG_SERVICE_URL", "http://127.0.0.1:8000")
    print("=== FitCore Faithfulness Eval ===")
    print(f"In-scope cases: {len(in_scope)}")
    print(f"Mode: {'HTTP' if use_http else 'in-process'}\n")

    results: list[dict] = []
    faith_scores: list[float] = []
    rel_scores: list[float] = []

    for item in in_scope:
        q = item["question"]
        sid = f"faith_{item['id']}_{int(time.time())}"
        print(f"{item['id']}: {q[:50]}…")

        try:
            chat = (
                call_chat_http(q, sid, base_url)
                if use_http
                else call_chat_inprocess(q, sid)
            )
        except Exception as exc:  # noqa: BLE001
            print(f"  ERROR: {exc}")
            results.append({"id": item["id"], "error": str(exc)})
            continue

        claims = split_atomic_claims(chat["answer"])
        verdicts = [judge_claim_supported(c, chat["context"]) for c in claims]
        faith = faithfulness_from_verdicts(verdicts)
        rel = judge_answer_relevancy(q, chat["answer"])

        faith_scores.append(faith)
        rel_scores.append(rel)
        results.append(
            {
                "id": item["id"],
                "question": q,
                "faithfulness": faith,
                "answer_relevancy": rel,
                "claim_count": len(claims),
                "supported_claims": sum(verdicts),
                "abstained": chat["retrieval_meta"].get("abstained"),
                "answer_preview": chat["answer"][:200],
            }
        )
        print(f"  faithfulness={faith:.3f} relevancy={rel:.3f} claims={len(claims)}")
        time.sleep(0.5)

    summary = {
        "total_cases": len(in_scope),
        "valid_cases": len(faith_scores),
        "chat_error_cases": len(in_scope) - len(faith_scores),
        "judge_error_count": _JUDGE_ERROR_COUNT,
        "avg_faithfulness": round(sum(faith_scores) / max(len(faith_scores), 1), 4),
        "avg_answer_relevancy": round(sum(rel_scores) / max(len(rel_scores), 1), 4),
    }

    print("\n--- Summary ---")
    print(f"avg_faithfulness    : {summary['avg_faithfulness']}")
    print(f"avg_answer_relevancy: {summary['avg_answer_relevancy']}")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = _EVAL_DIR / f"faithfulness_report_{tag + '_' if tag else ''}{ts}.json"
    report_path.write_text(
        json.dumps(
            {
                "evaluated_at": datetime.now().isoformat(),
                "summary": summary,
                "results": results,
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
        return 1

    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    thresholds = baseline.get("thresholds", {})
    metric_values = {
        "faithfulness": summary["avg_faithfulness"],
        "answer_relevancy": summary["avg_answer_relevancy"],
    }
    failures: list[str] = []
    if not summary["valid_cases"]:
        failures.append("valid_cases 0")
    if summary["chat_error_cases"]:
        failures.append(f"chat_errors {summary['chat_error_cases']} > 0")
    if summary["judge_error_count"]:
        failures.append(f"judge_errors {summary['judge_error_count']} > 0")
    for metric, floor in thresholds.items():
        actual = float(metric_values.get(metric, 0))
        if actual + 1e-9 < float(floor):
            failures.append(f"{metric} {actual:.3f} < {floor}")

    if failures:
        print("[gate] FAIL:", "; ".join(failures))
        return 1
    print("[gate] PASS")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Faithfulness / groundedness eval")
    parser.add_argument("--http", action="store_true", help="Use HTTP /v1/chat")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--gate", action="store_true")
    parser.add_argument("--baseline", default=str(DEFAULT_BASELINE.name))
    parser.add_argument("--dataset", default=str(DATASET_PATH.name))
    parser.add_argument("--tag", default="")
    args = parser.parse_args()

    ds = (
        _EVAL_DIR / args.dataset
        if not Path(args.dataset).is_absolute()
        else Path(args.dataset)
    )
    return evaluate_faithfulness(
        dataset_path=ds,
        use_http=args.http,
        limit=args.limit,
        gate=args.gate,
        baseline_path=Path(args.baseline),
        tag=args.tag,
    )


if __name__ == "__main__":
    raise SystemExit(main())
