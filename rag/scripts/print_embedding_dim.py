"""
Print DashScope embedding dimension for the configured model (validates SQL vector(1024)).

Usage:
  cd Rag
  .venv\\Scripts\\python scripts\\print_embedding_dim.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

RAG_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAG_ROOT))

from dotenv import load_dotenv

load_dotenv(RAG_ROOT / ".env")

from app.core import constants as config  # noqa: E402
from langchain_community.embeddings import DashScopeEmbeddings  # noqa: E402


def main() -> int:
    if not os.getenv("DASHSCOPE_API_KEY"):
        print("Missing DASHSCOPE_API_KEY")
        return 2
    emb = DashScopeEmbeddings(model=config.embedding_model_name)
    v = emb.embed_query("dimension check")
    print(f"model={config.embedding_model_name} dim={len(v)}")
    print("Supabase migration vector(N) 中的 N 必须等于上述 dim。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
