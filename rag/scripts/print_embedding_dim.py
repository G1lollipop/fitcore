"""
Print the embedding dimension for the configured Gemini model.

Use it to confirm EMBEDDING_DIM (and the Supabase migration's vector(N)) match
what the API actually returns.

Usage:
  cd rag
  ./.venv/bin/python scripts/print_embedding_dim.py
"""

from __future__ import annotations

import sys
from pathlib import Path

RAG_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAG_ROOT))

from dotenv import load_dotenv

load_dotenv(RAG_ROOT / ".env")

from app.core.settings import get_settings  # noqa: E402
from app.infra.embeddings import get_embedding  # noqa: E402


def main() -> int:
    settings = get_settings()
    if not settings.llm_api_key:
        print("Missing GOOGLE_AI_STUDIO_API_KEY")
        return 2
    emb = get_embedding()
    v = emb.embed_query("dimension check")
    print(
        f"model={settings.embedding_model} "
        f"configured_dim={settings.embedding_dim} actual_dim={len(v)}"
    )
    print("N in the Supabase migration vector(N) must equal actual_dim.")
    return 0 if len(v) == settings.embedding_dim else 1


if __name__ == "__main__":
    raise SystemExit(main())
