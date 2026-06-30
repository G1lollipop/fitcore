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

Requires: trafilatura, pyyaml, pypdf, requests  (see requirements-dev.txt).
"""

from __future__ import annotations

import argparse
import io
import re
from pathlib import Path

RAG_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = RAG_ROOT / "data"
SOURCES_FILE = DATA_DIR / "sources.yaml"

MIN_BODY_CHARS = 500  # guard against extraction returning a near-empty page

# Some open-access hosts (Springer/BMC/PMC) return an empty body to
# trafilatura's default crawler UA. A normal browser UA gets the full HTML.
_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def _load_sources() -> list[dict]:
    import yaml  # local import so --help works without deps

    if not SOURCES_FILE.exists():
        print(f"[fetch] Missing manifest: {SOURCES_FILE}")
        return []
    with open(SOURCES_FILE, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data.get("sources", []) or []


# A reference list (often 100+ entries) is pure citation noise for retrieval and
# massively inflates the chunk/embedding count. Detect the bibliography in the
# back half of the document by citation-line density and drop it.
# Bibliography lines carry dense citation signals (DOIs, "Journal. 2021;..",
# PubMed links). Body prose almost never does. Detect by signal, not by line
# shape, so it works for both HTML (one ref/line) and PDF (refs wrap lines).
_CITE_SIGNAL_RE = re.compile(
    r"\bdoi\b|10\.\d{4,}/|(19|20)\d{2}\s*[;:]|pubmed", re.IGNORECASE
)


def _looks_like_citation(line: str) -> bool:
    return bool(_CITE_SIGNAL_RE.search(line))


def _trim_reference_tail(text: str | None) -> str | None:
    """Cut the trailing bibliography (often 100+ entries → huge chunk noise).

    The reference list is a long, dense run of citation lines at the document
    tail. We find the earliest citation-start (in the back ~70%) from which the
    rest of the document is citation-dense, and cut there. PDF references wrap
    across lines, so we use density rather than a fixed window. Body lists in
    the front are never scanned, so numbered recommendations stay intact.
    """
    if not text:
        return text
    lines = text.splitlines()
    n = len(lines)
    if n < 60:
        return text
    starts = [i for i, ln in enumerate(lines) if _looks_like_citation(ln)]
    if len(starts) < 15:
        return text
    for s in starts:
        if s < n * 0.3:
            continue
        tail = [x for x in starts if x >= s]
        if len(tail) >= 15 and len(tail) >= 0.2 * (n - s):
            trimmed = "\n".join(lines[:s]).rstrip()
            if len(trimmed) >= MIN_BODY_CHARS:
                return trimmed + "\n"
            break
    return text


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

    def _extract(html: str | None) -> str | None:
        if not html:
            return None
        return trafilatura.extract(
            html,
            include_comments=False,
            include_tables=True,
            favor_recall=True,
        )

    # 1) trafilatura's built-in downloader (sufficient for most sites).
    text = _extract(trafilatura.fetch_url(url))
    if text and len(text) >= MIN_BODY_CHARS:
        return _trim_reference_tail(text)

    # 2) Fallback: requests with a browser UA — bypasses Springer/BMC/PMC blocking of default crawler UAs.
    import requests

    try:
        resp = requests.get(url, timeout=60, headers={"User-Agent": _BROWSER_UA})
        resp.raise_for_status()
    except Exception:  # noqa: BLE001 (CLI tool: on failure, fall back to trafilatura result)
        return _trim_reference_tail(text)
    return _trim_reference_tail(_extract(resp.text) or text)


def _extract_pdf(url: str) -> str | None:
    import requests
    from pypdf import PdfReader

    resp = requests.get(url, timeout=60, headers={"User-Agent": _BROWSER_UA})
    resp.raise_for_status()
    reader = PdfReader(io.BytesIO(resp.content))
    parts = [page.extract_text() or "" for page in reader.pages]
    return _trim_reference_tail("\n\n".join(p.strip() for p in parts if p.strip()))


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
    parser = argparse.ArgumentParser(
        description="Fetch KB sources from data/sources.yaml"
    )
    parser.add_argument("--only", help="Fetch a single source id")
    parser.add_argument(
        "--list", action="store_true", help="List registry entries and exit"
    )
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
