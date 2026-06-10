"""
Fetch authoritative knowledge-base sources listed in data/sources.yaml and
write them as clean, embed-ready text files into data/.

For each registry entry with `fetch: true` (and not `curated: true`):
  - type: html  → download + main-content extraction via trafilatura
  - type: pdf   → download + text extraction via pypdf

Output: data/auto_<id>.txt with a provenance header (Title / Source URL /
License / Tags) so citations keep their attribution. These files are then
embedded by scripts/ingest_seed_kb.py like any other data/*.txt.

Usage (from rag/):
  ./.venv/bin/python scripts/fetch_sources.py            # fetch all fetch:true
  ./.venv/bin/python scripts/fetch_sources.py --only who_physical_activity_2020
  ./.venv/bin/python scripts/fetch_sources.py --list

Requires: trafilatura, pyyaml, pypdf, requests  (see requirements-ingest-ci.txt).
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

RAG_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = RAG_ROOT / "data"
SOURCES_FILE = DATA_DIR / "sources.yaml"

MIN_BODY_CHARS = 500  # guard against extraction returning a near-empty page


def _load_sources() -> list[dict]:
    import yaml  # local import so --help works without deps

    if not SOURCES_FILE.exists():
        print(f"[fetch] Missing manifest: {SOURCES_FILE}")
        return []
    with open(SOURCES_FILE, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data.get("sources", []) or []


def _header(entry: dict) -> str:
    tags = entry.get("tags") or []
    tags_str = "; ".join(str(t) for t in tags)
    return (
        f"Title: {entry.get('title', entry['id'])}\n"
        f"Source URL: {entry.get('url', '')}\n"
        f"License: {entry.get('license', 'see source')}\n"
        f"Tags: {tags_str}\n\n"
    )


def _extract_html(url: str) -> str | None:
    import trafilatura

    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        return None
    text = trafilatura.extract(
        downloaded,
        include_comments=False,
        include_tables=True,
        favor_recall=True,
    )
    return text


def _extract_pdf(url: str) -> str | None:
    import requests
    from pypdf import PdfReader

    resp = requests.get(url, timeout=60, headers={"User-Agent": "FitCore-KB-Fetcher/1.0"})
    resp.raise_for_status()
    reader = PdfReader(io.BytesIO(resp.content))
    parts = [page.extract_text() or "" for page in reader.pages]
    return "\n\n".join(p.strip() for p in parts if p.strip())


def fetch_entry(entry: dict) -> str:
    """Returns one of: 'ok', 'skip', 'fail'."""
    sid = entry.get("id")
    if not sid:
        print("[fetch] entry without id, skipping")
        return "skip"
    if entry.get("curated"):
        print(f"[skip] {sid}: curated summary already in data/, not auto-fetching")
        return "skip"
    if not entry.get("fetch"):
        print(f"[skip] {sid}: fetch not enabled")
        return "skip"

    url = entry.get("url")
    stype = (entry.get("type") or "html").lower()
    print(f"[fetch] {sid} ({stype}) <- {url}")

    try:
        body = _extract_pdf(url) if stype == "pdf" else _extract_html(url)
    except Exception as exc:  # noqa: BLE001 (CLI tool — report and continue)
        print(f"[fail] {sid}: {exc}")
        return "fail"

    if not body or len(body) < MIN_BODY_CHARS:
        print(f"[fail] {sid}: extracted body too short ({len(body or '')} chars)")
        return "fail"

    out_path = DATA_DIR / f"auto_{sid}.txt"
    out_path.write_text(_header(entry) + body.strip() + "\n", encoding="utf-8")
    print(f"[ok]   {sid}: wrote {out_path.name} ({len(body)} chars)")
    return "ok"


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch KB sources from data/sources.yaml")
    parser.add_argument("--only", help="Fetch a single source id")
    parser.add_argument("--list", action="store_true", help="List registry entries and exit")
    args = parser.parse_args()

    sources = _load_sources()
    if not sources:
        return 1

    if args.list:
        for e in sources:
            flags = []
            if e.get("curated"):
                flags.append("curated")
            if e.get("fetch"):
                flags.append("fetch")
            print(f"- {e.get('id'):32} [{','.join(flags) or '-'}] {e.get('title', '')}")
        return 0

    if args.only:
        sources = [e for e in sources if e.get("id") == args.only]
        if not sources:
            print(f"[fetch] no source with id={args.only}")
            return 1

    ok = fail = skip = 0
    for entry in sources:
        result = fetch_entry(entry)
        ok += result == "ok"
        fail += result == "fail"
        skip += result == "skip"

    print(f"[summary] ok={ok}, failed={fail}, skipped={skip}, total={len(sources)}")
    return 0 if fail == 0 else 3


if __name__ == "__main__":
    raise SystemExit(main())
