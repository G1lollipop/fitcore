"""
Batch-ingest local seed knowledge files via KnowledgeBaseService (Chroma or Supabase).

Usage (from repo root):
  cd d:\\Projects\\Fitcore\\Rag
  .\\.venv\\Scripts\\python scripts\\ingest_seed_kb.py
  .\\.venv\\Scripts\\python scripts\\ingest_seed_kb.py --force

Notes:
- Requires GOOGLE_AI_STUDIO_API_KEY (Gemini embeddings).
- Default: md5 de-dup in ./md5.text (identical content skipped — 切到 Supabase 后若仍显示「跳过」请用 --force)。
"""

from __future__ import annotations

import argparse
import sys
from glob import glob
from pathlib import Path

from dotenv import load_dotenv

# Ensure imports work no matter the current working directory
RAG_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAG_ROOT))
load_dotenv(RAG_ROOT / ".env")


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest fitcore_kb_*.txt into vector store")
    parser.add_argument(
        "--force",
        action="store_true",
        help="忽略 md5.text 去重，强制写入（首次灌入 Supabase 或更新正文时用）",
    )
    args = parser.parse_args()

    from app.core.settings import get_settings  # noqa: WPS433

    if not get_settings().llm_api_key:
        print(
            "[ingest] Missing GOOGLE_AI_STUDIO_API_KEY. Set it in rag/.env or your environment."
        )
        return 2

    from app.infra.supabase_client import supabase_configured, vector_backend  # noqa: WPS433

    if vector_backend() == "supabase" and not supabase_configured():
        print(
            "[ingest] VECTOR_BACKEND=supabase 需要 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY（Rag/.env）"
        )
        return 2

    from app.infra.cache import CacheManager  # noqa: WPS433
    from app.services.kb_service import KnowledgeBaseService  # noqa: WPS433 (runtime import after sys.path)

    # Share a CacheManager so each successful upload invalidates retrieval/
    # embedding caches. With CACHE_BACKEND=redis this clears the *shared* cache
    # the API reads, so it won't serve rankings computed against the old corpus.
    cache_manager = CacheManager()
    service = KnowledgeBaseService(cache_manager=cache_manager)

    patterns = [
        str(RAG_ROOT / "data" / "fitcore_kb_*.txt"),
    ]

    files: list[Path] = []
    for pattern in patterns:
        files.extend(Path(p) for p in sorted(glob(pattern)))

    if not files:
        print("[ingest] No matching files found.")
        return 1

    ok = 0
    skipped = 0
    failed = 0

    for path in files:
        try:
            content = path.read_bytes()
            result = service.upload_file(
                content, path.name, mime_type="text/plain", ignore_md5=args.force
            )
            if not result.get("success"):
                failed += 1
                print(f"[失败] {path.name}: {result.get('message')}")
                continue

            msg = result.get("message", "")
            print(f"[完成] {path.name}: {msg}")
            if isinstance(msg, str) and msg.startswith("[跳过]"):
                skipped += 1
            else:
                ok += 1
        except Exception as exc:  # noqa: BLE001 (CLI tool)
            failed += 1
            print(f"[异常] {path.name}: {exc}")

    print(f"[汇总] success={ok}, skipped={skipped}, failed={failed}, total={len(files)}")

    # Cache invalidation crosses processes only with a shared backend (Redis).
    # With the default in-process memory cache, the running API keeps its own
    # cache + BM25 index until restarted.
    if ok > 0:
        from app.core.settings import get_settings  # noqa: WPS433

        if get_settings().cache_backend == "redis":
            print("[缓存] 已失效共享缓存（Redis）；运行中的 API 会在下次查询重建检索器。")
        else:
            print(
                "[缓存] 当前为内存缓存（进程隔离）；如有运行中的 API 服务，请重启以加载新语料。"
            )

    return 0 if failed == 0 else 3


if __name__ == "__main__":
    raise SystemExit(main())
