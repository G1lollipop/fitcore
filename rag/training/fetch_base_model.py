"""
Download a model snapshot into a LOCAL folder using plain HTTP requests, so
training/train_reranker.py can run fully offline:  --base-model ./models/<name>

Two sources (pick whichever your network can reach):
  --source modelscope  (DEFAULT): ModelScope hub (modelscope.cn) — works in
      mainland China where huggingface.co is blocked. e.g. BAAI/bge-reranker-base.
  --source hf: a Hugging Face mirror endpoint (--endpoint, default hf-mirror.com).
      NOTE: some networks intercept huggingface.co and the mirror's /resolve/
      paths 308-redirect there, so this can still fail — prefer modelscope.

Usage (from rag/):
    python training/fetch_base_model.py                                  # bge-reranker-base via ModelScope
    python training/fetch_base_model.py --source hf \
        --repo cross-encoder/ms-marco-MiniLM-L-6-v2 --endpoint https://hf-mirror.com
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import requests

_TRAIN_DIR = Path(__file__).resolve().parent
RAG_ROOT = _TRAIN_DIR.parent

DEFAULT_REPO = "BAAI/bge-reranker-base"
DEFAULT_SOURCE = "modelscope"
MODELSCOPE_BASE = "https://modelscope.cn/api/v1/models"
# Files we never need locally for training/inference.
_SKIP_SUFFIXES = (".gitattributes",)
_SKIP_NAMES = {"README.md"}

# Mirror caveat: hf-mirror.com proxies file downloads under /resolve/ but its
# /api/models/.../revision/... endpoint 302-redirects to huggingface.co (which
# is blocked here). So we don't rely on the API listing — we try it, and on any
# failure fall back to this candidate file list, skipping 404s. Covers BERT-style
# cross-encoders (config + weights + WordPiece tokenizer); optional files (e.g.
# safetensors / tokenizer.json) are downloaded only if present.
_FALLBACK_FILES = [
    "config.json",
    "pytorch_model.bin",
    "model.safetensors",
    "vocab.txt",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "sentence_bert_config.json",
]
# Files that MUST be present for the model to load (abort if all weights miss).
_REQUIRED_ANY = [("pytorch_model.bin", "model.safetensors")]


def _hf_plan(endpoint: str, repo: str, revision: str):
    """Return (files, url_builder) for a HF mirror endpoint."""
    files = _FALLBACK_FILES
    try:
        api = f"{endpoint}/api/models/{repo}/revision/{revision}"
        resp = requests.get(api, timeout=15, allow_redirects=False)
        if resp.status_code >= 300:
            raise RuntimeError(
                f"mirror redirects api to the blocked hub (status {resp.status_code})"
            )
        files = [
            s["rfilename"]
            for s in resp.json().get("siblings", [])
            if s.get("rfilename")
        ]
        print(f"[fetch] HF API listing: {len(files)} files")
    except Exception as exc:  # noqa: BLE001
        print(f"[fetch] HF API listing unavailable ({exc}); using fallback file list")

    def url(name: str) -> str:
        return f"{endpoint}/{repo}/resolve/{revision}/{name}"

    return files, url


def _modelscope_plan(repo: str, revision: str):
    """Return (files, url_builder) for the ModelScope hub (modelscope.cn)."""
    resp = requests.get(
        f"{MODELSCOPE_BASE}/{repo}/repo/files",
        params={"Revision": revision},
        timeout=30,
    )
    resp.raise_for_status()
    entries = resp.json().get("Data", {}).get("Files", [])
    files = [e["Path"] for e in entries if e.get("Type") == "blob" and e.get("Path")]
    print(f"[fetch] ModelScope listing: {len(files)} files")

    def url(name: str) -> str:
        return f"{MODELSCOPE_BASE}/{repo}/repo?Revision={revision}&FilePath={name}"

    return files, url


def _select_files(files: list[str]) -> list[str]:
    """Drop boilerplate; if safetensors exist, skip the redundant .bin weights."""
    keep = [f for f in files if f not in _SKIP_NAMES and not f.endswith(_SKIP_SUFFIXES)]
    has_safetensors = any(f.endswith(".safetensors") for f in keep)
    if has_safetensors:
        keep = [f for f in keep if not f.endswith((".bin",))]
    return keep


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch a reranker base model")
    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument(
        "--source", choices=["modelscope", "hf"], default=DEFAULT_SOURCE
    )
    parser.add_argument(
        "--endpoint",
        default=os.environ.get("HF_ENDPOINT", "https://hf-mirror.com"),
        help="HF mirror endpoint (only used with --source hf)",
    )
    parser.add_argument(
        "--out", default=None, help="Local folder (default models/<repo-basename>)"
    )
    parser.add_argument(
        "--revision",
        default=None,
        help="Default: 'master' for modelscope, 'main' for hf",
    )
    args = parser.parse_args()

    revision = args.revision or ("master" if args.source == "modelscope" else "main")
    out_dir = (
        Path(args.out) if args.out else RAG_ROOT / "models" / args.repo.split("/")[-1]
    )
    if not out_dir.is_absolute():
        out_dir = RAG_ROOT / out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.source == "modelscope":
        files, build_url = _modelscope_plan(args.repo, revision)
    else:
        files, build_url = _hf_plan(args.endpoint.rstrip("/"), args.repo, revision)

    files = _select_files(files)
    print(f"[fetch] downloading {len(files)} files → {out_dir}")
    got: list[str] = []
    for name in files:
        dest = out_dir / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            with requests.get(build_url(name), stream=True, timeout=300) as r:
                if r.status_code == 404:
                    print(f"  [skip] {name} (not in repo)")
                    continue
                r.raise_for_status()
                total = 0
                with dest.open("wb") as fh:
                    for chunk in r.iter_content(chunk_size=1 << 20):
                        if chunk:
                            fh.write(chunk)
                            total += len(chunk)
            got.append(name)
            print(f"  [ok] {name} ({total / 1024 / 1024:.1f} MB)")
        except Exception as exc:  # noqa: BLE001
            print(f"  [fail] {name}: {exc}")

    for group in _REQUIRED_ANY:
        if not any(g in got for g in group):
            print(
                f"[fetch] ERROR: none of {group} downloaded — model won't load. "
                "Check connectivity to the source."
            )
            return 1

    print(
        f"[fetch] done ({len(got)} files). Train with:\n"
        f"  --base-model ./{out_dir.relative_to(RAG_ROOT).as_posix()}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
