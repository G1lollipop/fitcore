"""Select a high-quality subset of the KB for the cloud (Supabase + Gemini free)
deployment track, and write data/cloud_keep.txt (one filename per line).

Strategy:
  1. ALWAYS keep the curated/core docs (non auto_epmc_*: ISSN position stands,
     hydration, concurrent-training, etc.) — authoritative, hand-checked.
  2. ALWAYS keep every eval anchor referenced by golden_dataset_en.json so the
     cloud retrieval eval still has its qrels.
  3. Fill the rest up to --target by per-topic quality ranking of the harvested
     auto_epmc_* docs (systematic reviews / meta-analyses / position stands first,
     then longer = more comprehensive), round-robin across topics for breadth.

Then ingest the subset to the cloud store:
  EMBEDDING_PROVIDER=gemini VECTOR_BACKEND=supabase CHUNK_SIZE=3500 \
    ./.venv/Scripts/python scripts/ingest_seed_kb.py --keep-list data/cloud_keep.txt --force
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

RAG_ROOT = Path(__file__).resolve().parents[1]
DATA = RAG_ROOT / "data"
EVAL = RAG_ROOT / "eval"

_HIGH_EVIDENCE = (
    "systematic review", "meta-analysis", "meta analysis", "umbrella review",
    "position stand", "consensus", "guideline", "scoping review", "narrative review",
)


def _primary_tag(tags: str) -> str:
    return (tags.split(";")[0].strip() or "misc").lower()


def _quality(m: dict) -> float:
    title = (m.get("title") or "").lower()
    score = sum(2.0 for kw in _HIGH_EVIDENCE if kw in title)
    try:
        size = (DATA / m["file"]).stat().st_size
    except OSError:
        size = 0
    score += min(size / 1e5, 3.0)  # up to +3 for longer (more comprehensive) docs
    return score


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=int, default=250, help="Target total number of documents")
    ap.add_argument("--out", default="data/cloud_keep.txt")
    args = ap.parse_args()

    all_txt = sorted(p.name for p in DATA.glob("*.txt"))
    core = [n for n in all_txt if not n.startswith("auto_epmc_")]

    # eval anchors (en dataset is the canonical eval set)
    anchors: set[str] = set()
    ds = json.loads((EVAL / "golden_dataset_en.json").read_text(encoding="utf-8"))
    for item in ds:
        for rs in item.get("relevant_sources", []):
            anchors.add(rs["source"])

    keep: set[str] = set(core) | anchors
    print(f"[prune] core={len(core)} + eval-anchors(union)={len(keep)} must-keep")

    manifest = json.loads((DATA / "harvested_sources.json").read_text(encoding="utf-8"))
    by_tag: dict[str, list[dict]] = defaultdict(list)
    for m in manifest:
        if m["file"] in keep:
            continue
        by_tag[_primary_tag(m.get("tags", ""))].append(m)
    for tag in by_tag:
        by_tag[tag].sort(key=_quality, reverse=True)

    # round-robin across topics until target reached (breadth-first quality)
    tags = sorted(by_tag, key=lambda t: -len(by_tag[t]))
    cursors = {t: 0 for t in tags}
    progressed = True
    while len(keep) < args.target and progressed:
        progressed = False
        for t in tags:
            if len(keep) >= args.target:
                break
            i = cursors[t]
            if i < len(by_tag[t]):
                keep.add(by_tag[t][i]["file"])
                cursors[t] += 1
                progressed = True

    keep_existing = sorted(f for f in keep if (DATA / f).exists())
    out_path = RAG_ROOT / args.out
    out_path.write_text("\n".join(keep_existing) + "\n", encoding="utf-8")

    # report by primary tag
    tag_of = {m["file"]: _primary_tag(m.get("tags", "")) for m in manifest}
    dist: dict[str, int] = defaultdict(int)
    for f in keep_existing:
        dist[tag_of.get(f, "core/curated")] += 1
    print(f"[prune] wrote {out_path} with {len(keep_existing)} docs")
    print(f"[prune] core/curated kept: {sum(1 for f in keep_existing if not f.startswith('auto_epmc_'))}")
    top = sorted(dist.items(), key=lambda kv: -kv[1])[:15]
    print("[prune] top topics:", ", ".join(f"{k}:{v}" for k, v in top))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
