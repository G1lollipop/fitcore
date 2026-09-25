"""
Batch-ingest local seed knowledge files via KnowledgeBaseService (Chroma or Supabase).

Usage (from repo root):
  cd d:\\Projects\\Fitcore\\Rag
  .\\.venv\\Scripts\\python scripts\\ingest_seed_kb.py
  .\\.venv\\Scripts\\python scripts\\ingest_seed_kb.py --force

Notes:
- Requires GOOGLE_AI_STUDIO_API_KEY (Gemini embeddings).
- Default: md5 de-dup in ./md5.text (identical content skipped — after switching to Supabase, if items still show "skipped", use --force).
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
    parser = argparse.ArgumentParser(
        description="Ingest data/auto_*.txt into vector store"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ignore md5.text dedup and force write (use for the first Supabase ingest or when updating content)",
    )
    parser.add_argument(
        "--keep-list",
        default=None,
        help="Only ingest files listed in this file (one file name per line, e.g. data/cloud_keep.txt); "
        "used for ingesting a curated cloud subset. If omitted, ingest all data/auto_*.txt.",
    )
    args = parser.parse_args()

    keep: set[str] | None = None
    if args.keep_list:
        kp = Path(args.keep_list)
        if not kp.is_absolute():
            kp = RAG_ROOT / kp
        keep = {
            ln.strip()
            for ln in kp.read_text(encoding="utf-8").splitlines()
            if ln.strip() and not ln.startswith("#")
        }
        print(f"[ingest] keep-list: ingesting only {len(keep)} files (from {kp.name})")

    from app.core.settings import get_settings  # noqa: WPS433

    if not get_settings().llm_api_key:
        print(
            "[ingest] Missing GOOGLE_AI_STUDIO_API_KEY. Set it in rag/.env or your environment."
        )
        return 2

    from app.infra.supabase_client import supabase_configured, vector_backend  # noqa: WPS433

    if vector_backend() == "supabase" and not supabase_configured():
        print(
            "[ingest] VECTOR_BACKEND=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (rag/.env)"
        )
        return 2

    from app.infra.cache import CacheManager  # noqa: WPS433
    from app.services.kb_service import KnowledgeBaseService  # noqa: WPS433 (runtime import after sys.path)

    # Share a CacheManager so each successful upload invalidates retrieval/
    # embedding caches. With CACHE_BACKEND=redis this clears the *shared* cache
    # the API reads, so it won't serve rankings computed against the old corpus.
    cache_manager = CacheManager()
    service = KnowledgeBaseService(cache_manager=cache_manager)

    # KB files: auto-fetched sources (auto_*.txt produced by
    # scripts/fetch_sources.py).
    patterns = [
        str(RAG_ROOT / "data" / "auto_*.txt"),
    ]

    files: list[Path] = []
    for pattern in patterns:
        files.extend(Path(p) for p in sorted(glob(pattern)))

    if keep is not None:
        files = [f for f in files if f.name in keep]

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
                print(f"[Failed] {path.name}: {result.get('message')}")
                continue

            msg = result.get("message", "")
            print(f"[Done] {path.name}: {msg}")
            if isinstance(msg, str) and msg.startswith("[Skipped]"):
                skipped += 1
            else:
                ok += 1
        except Exception as exc:  # noqa: BLE001 (CLI tool)
            failed += 1
            print(f"[Error] {path.name}: {exc}")
            msg = str(exc)
            # Only the daily wall (quotaId ...PerDay..., limit 1000) should abort
            # the whole run; per-minute (limit 100) limits are handled by retries
            # inside the embedding throttler.
            if ("RESOURCE_EXHAUSTED" in msg or "429" in msg) and (
                "PerDay" in msg or "limit: 1000" in msg
            ):
                print(
                    "[ingest] Daily embedding quota exhausted. Aborting ingestion loop."
                )
                return 3

    print(
        f"[Summary] success={ok}, skipped={skipped}, failed={failed}, total={len(files)}"
    )

    # Cache invalidation crosses processes only with a shared backend (Redis).
    # With the default in-process memory cache, the running API keeps its own
    # cache + BM25 index until restarted.
    if ok > 0:
        from app.core.settings import get_settings  # noqa: WPS433

        if get_settings().cache_backend == "redis":
            print(
                "[Cache] Invalidated the shared cache (Redis); a running API will rebuild the retriever on the next query."
            )
        else:
            print(
                "[Cache] Currently using in-memory cache (process-isolated); restart any running API service to load the new corpus."
            )

    return 0 if failed == 0 else 3


if __name__ == "__main__":
    raise SystemExit(main())
