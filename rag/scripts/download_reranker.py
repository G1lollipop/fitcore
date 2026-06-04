"""
Download the BGE reranker model from ModelScope (CN-friendly mirror).

Usage (from repo root):
  cd d:\\Projects\\Fitcore\\Rag
  .\\.venv\\Scripts\\python scripts\\download_reranker.py

After download completes, point the RAG service at the local snapshot via .env:
  RERANKER_MODEL_PATH=<the path printed below>

Or skip the local download and pull from HuggingFace hub at runtime:
  RERANKER_MODEL_NAME=BAAI/bge-reranker-base
"""

import os
from pathlib import Path

from modelscope.hub.snapshot_download import snapshot_download


def main() -> None:
    save_dir = Path.cwd() / "models"
    save_dir.mkdir(exist_ok=True)

    print("Downloading BGE-Reranker-Base from ModelScope...")
    model_path = snapshot_download("Xorbits/bge-reranker-base", cache_dir=str(save_dir))

    print("=" * 60)
    print("Download complete.")
    print(f"Model path: {model_path}")
    print(f"Add this to Rag/.env:  RERANKER_MODEL_PATH={model_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
