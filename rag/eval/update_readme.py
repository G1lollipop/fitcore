"""
跑完 evaluate.py 之后执行此脚本，自动把最新评估结果更新到根目录 README.md。

用法：
    cd Rag
    python eval/update_readme.py
"""

import json
import re
from pathlib import Path

EVAL_DIR = Path(__file__).parent
README_PATH = Path(__file__).parent.parent.parent / "README.md"


def find_latest_report() -> Path | None:
    reports = sorted(EVAL_DIR.glob("eval_report_*.json"), reverse=True)
    return reports[0] if reports else None


def update_readme(report: dict) -> None:
    s = report["summary"]
    readme = README_PATH.read_text(encoding="utf-8")

    table = (
        "| 指标 | 得分 |\n"
        "|---|---|\n"
        f"| **平均相关性** | `{s['avg_relevance']:.3f}` |\n"
        f"| **平均完整性** | `{s['avg_completeness']:.3f}` |\n"
        f"| **平均准确性** | `{s['avg_accuracy']:.3f}` |\n"
        f"| **平均延迟** | `{s['avg_latency_ms']:.0f} ms` |\n"
        f"| **平均引用条数** | `{s['avg_citation_count']:.1f}` |"
    )

    # 替换 README 中的评估结果表格
    pattern = r"(\| 指标 \| 得分 \|.*?)(\*跑完评估)"
    replacement = table + "\n\n\\2"
    new_readme = re.sub(pattern, replacement, readme, flags=re.DOTALL)

    if new_readme == readme:
        print("未找到可替换的表格区域，请检查 README 格式。")
        return

    README_PATH.write_text(new_readme, encoding="utf-8")
    print(f"README 已更新：")
    print(f"  相关性: {s['avg_relevance']:.3f}  完整性: {s['avg_completeness']:.3f}  准确性: {s['avg_accuracy']:.3f}")
    print(f"  延迟: {s['avg_latency_ms']:.0f}ms  引用: {s['avg_citation_count']:.1f} 条/次")


if __name__ == "__main__":
    report_path = find_latest_report()
    if not report_path:
        print("未找到评估报告，请先运行 evaluate.py")
        exit(1)

    print(f"读取报告: {report_path.name}")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    update_readme(report)
