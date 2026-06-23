"""
RAG evaluation Pipeline
=======================

How to run:
    cd rag
    python eval/evaluate.py

Prerequisites:
    1. The RAG backend is running (python backend_api.py)
    2. GOOGLE_AI_STUDIO_API_KEY is set (in the environment or .env)

Evaluation dimensions (LLM-as-Judge, 1-5 each, finally normalized to 0-1):
    - relevance     : whether the answer is on topic
    - completeness  : whether it covers the key information
    - accuracy      : whether the content is accurate and reliable

Additional metrics (no LLM required):
    - citation_count: number of citations returned
    - latency_ms    : request latency (milliseconds)

Report output:
    - console summary table
    - eval/eval_report_<timestamp>.json (detailed results)
"""

import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv

# Load rag/.env
_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_ROOT / ".env")

# Allow this script to import app.* (reusing the main backend's settings)
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from langchain_openai import ChatOpenAI  # noqa: E402

from app.core.settings import get_settings  # noqa: E402

_settings = get_settings()

RAG_SERVICE_URL = os.getenv("RAG_SERVICE_URL", "http://127.0.0.1:8000")
# The judge model defaults to the main backend's; EVAL_JUDGE_MODEL can still override it.
JUDGE_MODEL = os.getenv("EVAL_JUDGE_MODEL") or _settings.rag_chat_model
DATASET_PATH = Path(__file__).parent / "golden_dataset_en.json"


def _build_judge_llm() -> ChatOpenAI:
    """Same as RagService: use Gemini's OpenAI-compatible endpoint."""
    if not _settings.llm_api_key:
        raise RuntimeError(
            "LLM API key is not configured (GOOGLE_AI_STUDIO_API_KEY); the judge cannot call the LLM"
        )
    return ChatOpenAI(
        model=JUDGE_MODEL,
        api_key=_settings.llm_api_key,
        base_url=_settings.llm_base_url,
        temperature=0,
    )


_JUDGE_LLM: ChatOpenAI | None = None


def _get_judge_llm() -> ChatOpenAI:
    global _JUDGE_LLM
    if _JUDGE_LLM is None:
        _JUDGE_LLM = _build_judge_llm()
    return _JUDGE_LLM


# ─── Call the RAG service ───────────────────────────────────────────────────


def call_rag(question: str, session_id: str) -> dict:
    """Call /v1/chat and return the answer, citations, and latency."""
    start = time.time()
    try:
        resp = requests.post(
            f"{RAG_SERVICE_URL}/v1/chat",
            json={"query": question, "sessionId": session_id, "userContext": {}},
            timeout=90,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        return {
            "answer": "",
            "citations": [],
            "retrieved_count": 0,
            "latency_ms": -1,
            "error": str(exc),
        }

    elapsed_ms = int((time.time() - start) * 1000)
    return {
        "answer": data.get("answer", ""),
        "citations": data.get("citations", []),
        "retrieved_count": data.get("retrievalMeta", {}).get("retrievedCount", 0),
        "latency_ms": elapsed_ms,
        "error": None,
    }


# ─── LLM judging ────────────────────────────────────────────────────────────


def judge_answer(question: str, answer: str, expected_keywords: list[str]) -> dict:
    """
    Use Gemini as the judge LLM to score answer quality.
    Each dimension is out of 5 and finally normalized to [0, 1].
    """
    if not answer.strip():
        return {
            "relevance": 0.0,
            "completeness": 0.0,
            "accuracy": 0.0,
            "comment": "Empty answer",
        }

    kw_list = ", ".join(expected_keywords) if expected_keywords else "(none)"

    prompt = f"""You are a quality-evaluation expert for RAG systems. Evaluate the quality of the following fitness Q&A.

[User question]
{question}

[System answer]
{answer}

[Reference key information (for assessing completeness)]
{kw_list}

Score the answer on the following three dimensions (each an integer from 1 to 5):
1. relevance: does the answer directly address the question
2. completeness: does the answer cover the points in the reference key information
3. accuracy: is the answer consistent with professional knowledge in the fitness domain

Output JSON only, in the format:
{{"relevance": <1-5>, "completeness": <1-5>, "accuracy": <1-5>, "comment": "<comment of at most 30 words>"}}"""

    try:
        llm = _get_judge_llm()
        response = llm.invoke(prompt)
        content: str = (response.content or "").strip() if response is not None else ""
        if not content:
            raise ValueError("The judge model returned empty content")
        # Extract JSON (the model may add explanatory text before/after the JSON)
        m = re.search(r"\{[^{}]+\}", content, re.DOTALL)
        if not m:
            raise ValueError(f"Could not extract JSON from the model output: {content[:200]}")
        scores = json.loads(m.group())
        return {
            "relevance": round(scores.get("relevance", 0) / 5, 3),
            "completeness": round(scores.get("completeness", 0) / 5, 3),
            "accuracy": round(scores.get("accuracy", 0) / 5, 3),
            "comment": scores.get("comment", ""),
        }
    except Exception as exc:
        print(f"  [judge error] {exc}")
        return {
            "relevance": 0.0,
            "completeness": 0.0,
            "accuracy": 0.0,
            "comment": f"Evaluation failed: {exc}",
        }


# ─── Main evaluation flow ─────────────────────────────────────────────────────


def evaluate():
    dataset: list[dict] = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    results: list[dict] = []

    print("=== FitCore RAG evaluation Pipeline ===")
    print(f"Service URL : {RAG_SERVICE_URL}")
    print(f"Judge model : {JUDGE_MODEL}")
    print(f"Test cases  : {len(dataset)}\n")
    print(
        f"{'ID':<12} {'Question':<22} {'Relev':>6} {'Compl':>6} {'Accur':>6} {'Cite':>4} {'Lat(ms)':>9}"
    )
    print("-" * 75)

    for item in dataset:
        q = item["question"]
        session_id = f"eval_{item['id']}_{int(time.time())}"

        # Call RAG
        rag_result = call_rag(q, session_id)

        if rag_result["error"]:
            print(f"{item['id']:<12} {q[:20]:<22} {'ERROR':>6} - {rag_result['error']}")
            results.append(
                {"id": item["id"], "question": q, "error": rag_result["error"]}
            )
            continue

        # LLM judging
        scores = judge_answer(
            q, rag_result["answer"], item.get("expected_keywords", [])
        )

        result = {
            "id": item["id"],
            "question": q,
            "topic": item.get("topic", ""),
            "difficulty": item.get("difficulty", ""),
            "answer": rag_result["answer"],
            "citation_count": rag_result["retrieved_count"],
            "latency_ms": rag_result["latency_ms"],
            **scores,
        }
        results.append(result)

        print(
            f"{item['id']:<12} {q[:20]:<22} "
            f"{scores['relevance']:>6.2f} {scores['completeness']:>6.2f} {scores['accuracy']:>6.2f} "
            f"{rag_result['retrieved_count']:>4} {rag_result['latency_ms']:>9}"
        )

        # Avoid API rate limiting
        time.sleep(0.5)

    # ── Summary ───────────────────────────────────────────────────────────
    valid = [r for r in results if "error" not in r]
    if not valid:
        print("\nNo valid results. Check whether the RAG service is running.")
        return

    avg_rel = sum(r["relevance"] for r in valid) / len(valid)
    avg_com = sum(r["completeness"] for r in valid) / len(valid)
    avg_acc = sum(r["accuracy"] for r in valid) / len(valid)
    avg_lat = sum(r["latency_ms"] for r in valid) / len(valid)
    avg_cit = sum(r["citation_count"] for r in valid) / len(valid)

    print("-" * 75)
    print(
        f"{'Average':>34} {avg_rel:>6.3f} {avg_com:>6.3f} {avg_acc:>6.3f} "
        f"{avg_cit:>4.1f} {avg_lat:>9.0f}"
    )

    report = {
        "evaluated_at": datetime.now().isoformat(),
        "rag_service_url": RAG_SERVICE_URL,
        "judge_model": JUDGE_MODEL,
        "summary": {
            "total_cases": len(dataset),
            "valid_cases": len(valid),
            "avg_relevance": round(avg_rel, 3),
            "avg_completeness": round(avg_com, 3),
            "avg_accuracy": round(avg_acc, 3),
            "avg_latency_ms": round(avg_lat, 1),
            "avg_citation_count": round(avg_cit, 1),
        },
        "results": results,
    }

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = Path(__file__).parent / f"eval_report_{ts}.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"\nReport saved to: {report_path}")
    print(
        f"\n[Summary] relevance {avg_rel:.3f} | completeness {avg_com:.3f} | accuracy {avg_acc:.3f} | avg latency {avg_lat:.0f}ms"
    )


if __name__ == "__main__":
    evaluate()
