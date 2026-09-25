"""
Fine-tune a CrossEncoder reranker on the mined ``(query, passage, label)`` set.

Base model: ``cross-encoder/ms-marco-MiniLM-L-6-v2`` (a ~22M-param, single-logit
relevance scorer) — the same family the live reranker loads via
``app/services/retrieval/compression.py`` (``HuggingFaceCrossEncoder`` →
``CrossEncoderReranker``). Saving with ``model.save(output)`` produces a folder
that drops straight into production through ``LOCAL_RERANKER_MODEL_PATH``.

This script is intentionally NOT importable by the API and its deps
(torch / sentence-transformers) live only in ``requirements-train.txt`` so the
production image stays slim. Run it on a GPU box (RTX 50-series: install a
CUDA 12.8 torch build first) or Colab / Kaggle; CPU also works (slower).

Usage (from rag/, in a training env with torch + sentence-transformers):
    pip install -r requirements-train.txt
    python training/train_reranker.py --epochs 2 --batch-size 16
    # → models/reranker-ft/
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_TRAIN_DIR = Path(__file__).resolve().parent
RAG_ROOT = _TRAIN_DIR.parent
for _p in (str(RAG_ROOT), str(_TRAIN_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

DEFAULT_TRAIN = _TRAIN_DIR / "data" / "reranker_train.jsonl"
DEFAULT_VAL = _TRAIN_DIR / "data" / "reranker_val.jsonl"
DEFAULT_OUTPUT = RAG_ROOT / "models" / "reranker-ft"
DEFAULT_BASE = "cross-encoder/ms-marco-MiniLM-L-6-v2"


def _load_examples(path: Path):
    """Read a {query, passage, label} jsonl into sentence-transformers InputExamples."""
    from sentence_transformers import InputExample  # noqa: WPS433

    if not path.exists():
        raise FileNotFoundError(
            f"training file not found: {path} — run generate_pairs.py + "
            "mine_hard_negatives.py first"
        )
    examples = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        q, p = row.get("query"), row.get("passage")
        if not q or not p:
            continue
        examples.append(InputExample(texts=[q, p], label=float(row.get("label", 0))))
    return examples


def _build_evaluator(val_examples):
    """Best-effort binary-classification evaluator (API name varies by ST version)."""
    if not val_examples:
        return None
    try:
        from sentence_transformers.cross_encoder.evaluation import (  # noqa: WPS433
            CEBinaryClassificationEvaluator,
        )

        return CEBinaryClassificationEvaluator.from_input_examples(
            val_examples, name="val"
        )
    except Exception:  # noqa: BLE001
        try:
            from sentence_transformers.cross_encoder.evaluation import (  # noqa: WPS433
                CrossEncoderClassificationEvaluator,
            )

            return CrossEncoderClassificationEvaluator.from_input_examples(
                val_examples, name="val"
            )
        except Exception as exc:  # noqa: BLE001
            print(f"[train] no val evaluator available ({exc}); training without it")
            return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Fine-tune a CrossEncoder reranker")
    parser.add_argument("--train", default=str(DEFAULT_TRAIN))
    parser.add_argument("--val", default=str(DEFAULT_VAL))
    parser.add_argument("--base-model", default=DEFAULT_BASE)
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--max-length", type=int, default=384)
    parser.add_argument("--warmup-ratio", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=13)
    args = parser.parse_args()

    from sentence_transformers import CrossEncoder  # noqa: WPS433
    from torch.utils.data import DataLoader  # noqa: WPS433

    try:
        import torch  # noqa: WPS433

        device = "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:  # noqa: BLE001
        device = "cpu"
    print(f"[train] device={device} base={args.base_model}")

    train_path = Path(args.train)
    val_path = Path(args.val)
    if not train_path.is_absolute():
        train_path = RAG_ROOT / train_path
    if not val_path.is_absolute():
        val_path = RAG_ROOT / val_path
    output_path = Path(args.output)
    if not output_path.is_absolute():
        output_path = RAG_ROOT / output_path
    output_path.parent.mkdir(parents=True, exist_ok=True)

    train_examples = _load_examples(train_path)
    val_examples = _load_examples(val_path) if val_path.exists() else []
    print(f"[train] train={len(train_examples)} val={len(val_examples)}")
    if not train_examples:
        print("[train] No training examples; aborting.")
        return 1

    model = CrossEncoder(
        args.base_model,
        num_labels=1,
        max_length=args.max_length,
        device=device,
    )

    train_dataloader = DataLoader(
        train_examples, shuffle=True, batch_size=args.batch_size
    )
    warmup_steps = int(len(train_dataloader) * args.epochs * args.warmup_ratio)
    evaluator = _build_evaluator(val_examples)

    print(
        f"[train] epochs={args.epochs} batch={args.batch_size} "
        f"lr={args.lr} warmup_steps={warmup_steps}"
    )
    model.fit(
        train_dataloader=train_dataloader,
        evaluator=evaluator,
        epochs=args.epochs,
        warmup_steps=warmup_steps,
        optimizer_params={"lr": args.lr},
        output_path=str(output_path),
        use_amp=(device == "cuda"),
    )

    model.save(str(output_path))
    print(f"[train] saved fine-tuned reranker → {output_path}")
    print(
        "[train] To serve it, set in rag/.env:\n"
        "  RERANKER_ENABLED=true\n"
        f"  LOCAL_RERANKER_MODEL_PATH=./{output_path.relative_to(RAG_ROOT).as_posix()}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
