"""
RAG 评估 Pipeline
=================

运行方式：
    cd Rag
    python eval/evaluate.py

前置条件：
    1. RAG 后端已启动（python backend_api.py）
    2. 设置好 GOOGLE_AI_STUDIO_API_KEY 环境变量（或在 .env 里）

评估维度（LLM-as-Judge，每项 1-5 分，最终归一化到 0-1）：
    - relevance     : 回答是否切题
    - completeness  : 是否涵盖关键信息
    - accuracy      : 内容是否准确可靠

附加指标（不需要 LLM）：
    - citation_count: 返回的引用条数
    - latency_ms    : 请求延迟（毫秒）

报告输出：
    - 控制台摘要表格
    - eval/eval_report_<timestamp>.json（详细结果）
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

# 加载 Rag/.env
_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_ROOT / ".env")

# 让本脚本能 import app.* (复用主后端的 settings)
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from langchain_openai import ChatOpenAI  # noqa: E402

from app.core.settings import get_settings  # noqa: E402

_settings = get_settings()

RAG_SERVICE_URL = os.getenv("RAG_SERVICE_URL", "http://127.0.0.1:8000")
# 评判模型默认与主后端一致；EVAL_JUDGE_MODEL 仍可单独覆盖。
JUDGE_MODEL = os.getenv("EVAL_JUDGE_MODEL") or _settings.rag_chat_model
DATASET_PATH = Path(__file__).parent / "golden_dataset.json"


def _build_judge_llm() -> ChatOpenAI:
    """与 RagService 一致：走 Gemini 的 OpenAI 兼容端点。"""
    if not _settings.llm_api_key:
        raise RuntimeError("LLM API key 未配置 (GOOGLE_AI_STUDIO_API_KEY)；评判器无法调用 LLM")
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


# ─── 调用 RAG 服务 ──────────────────────────────────────────────────────────

def call_rag(question: str, session_id: str) -> dict:
    """调用 /v1/chat，返回回答、引用和延迟。"""
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
        return {"answer": "", "citations": [], "retrieved_count": 0, "latency_ms": -1, "error": str(exc)}

    elapsed_ms = int((time.time() - start) * 1000)
    return {
        "answer": data.get("answer", ""),
        "citations": data.get("citations", []),
        "retrieved_count": data.get("retrievalMeta", {}).get("retrievedCount", 0),
        "latency_ms": elapsed_ms,
        "error": None,
    }


# ─── LLM 评判 ──────────────────────────────────────────────────────────────

def judge_answer(question: str, answer: str, expected_keywords: list[str]) -> dict:
    """
    用 Gemini 作为评判 LLM，对回答质量打分。
    每项满分 5 分，最终归一化到 [0, 1]。
    """
    if not answer.strip():
        return {"relevance": 0.0, "completeness": 0.0, "accuracy": 0.0, "comment": "回答为空"}

    kw_list = "、".join(expected_keywords) if expected_keywords else "（无）"

    prompt = f"""你是一个 RAG 系统质量评估专家。请评估以下健身问答的质量。

【用户问题】
{question}

【系统回答】
{answer}

【参考关键信息（评估完整性用）】
{kw_list}

请从以下三个维度打分（每项 1-5 分整数）：
1. relevance（相关性）：回答是否直接回应了问题
2. completeness（完整性）：回答是否涵盖了参考关键信息中的要点
3. accuracy（准确性）：回答内容是否符合健身领域的专业知识

只输出 JSON，格式：
{{"relevance": <1-5>, "completeness": <1-5>, "accuracy": <1-5>, "comment": "<不超过30字的评语>"}}"""

    try:
        llm = _get_judge_llm()
        response = llm.invoke(prompt)
        content: str = (response.content or "").strip() if response is not None else ""
        if not content:
            raise ValueError("评判模型返回了空内容")
        # 提取 JSON（模型可能在 JSON 前后加解释性文字）
        m = re.search(r"\{[^{}]+\}", content, re.DOTALL)
        if not m:
            raise ValueError(f"无法从模型输出中提取 JSON：{content[:200]}")
        scores = json.loads(m.group())
        return {
            "relevance": round(scores.get("relevance", 0) / 5, 3),
            "completeness": round(scores.get("completeness", 0) / 5, 3),
            "accuracy": round(scores.get("accuracy", 0) / 5, 3),
            "comment": scores.get("comment", ""),
        }
    except Exception as exc:
        print(f"  [判断器错误] {exc}")
        return {"relevance": 0.0, "completeness": 0.0, "accuracy": 0.0, "comment": f"评估失败: {exc}"}


# ─── 主评估流程 ─────────────────────────────────────────────────────────────

def evaluate():
    dataset: list[dict] = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    results: list[dict] = []

    print("=== FitCore RAG 评估 Pipeline ===")
    print(f"服务地址 : {RAG_SERVICE_URL}")
    print(f"评判模型 : {JUDGE_MODEL}")
    print(f"测试用例 : {len(dataset)} 条\n")
    print(f"{'ID':<12} {'问题':<22} {'相关性':>6} {'完整性':>6} {'准确性':>6} {'引用':>4} {'延迟(ms)':>9}")
    print("-" * 75)

    for item in dataset:
        q = item["question"]
        session_id = f"eval_{item['id']}_{int(time.time())}"

        # 调用 RAG
        rag_result = call_rag(q, session_id)

        if rag_result["error"]:
            print(f"{item['id']:<12} {q[:20]:<22} {'ERROR':>6} - {rag_result['error']}")
            results.append({"id": item["id"], "question": q, "error": rag_result["error"]})
            continue

        # LLM 评判
        scores = judge_answer(q, rag_result["answer"], item.get("expected_keywords", []))

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

        # 避免 API 限速
        time.sleep(0.5)

    # ── 汇总 ──────────────────────────────────────────────────────────────
    valid = [r for r in results if "error" not in r]
    if not valid:
        print("\n没有有效结果，请检查 RAG 服务是否启动。")
        return

    avg_rel = sum(r["relevance"] for r in valid) / len(valid)
    avg_com = sum(r["completeness"] for r in valid) / len(valid)
    avg_acc = sum(r["accuracy"] for r in valid) / len(valid)
    avg_lat = sum(r["latency_ms"] for r in valid) / len(valid)
    avg_cit = sum(r["citation_count"] for r in valid) / len(valid)

    print("-" * 75)
    print(
        f"{'平均':>34} {avg_rel:>6.3f} {avg_com:>6.3f} {avg_acc:>6.3f} "
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
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n报告已保存至: {report_path}")
    print(f"\n【汇总】相关性 {avg_rel:.3f} | 完整性 {avg_com:.3f} | 准确性 {avg_acc:.3f} | 平均延迟 {avg_lat:.0f}ms")


if __name__ == "__main__":
    evaluate()
