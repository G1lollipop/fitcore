# RAG evaluation (eval/)

This directory contains two complementary sets of evaluations:

| Script | Target | Metrics | LLM required |
|------|----------|------|-----------|
| `eval_retrieval.py` | **Retrieval layer** (vector + BM25 + optional rerank) | **Anchors**: anchor_recall@k / anchor_hit@k / anchor_mrr@k (deterministic, CI gate); **quality**: context_precision@k / context_hit@k (LLM judge, `--judge`) + abstention | No by default; only with `--judge` |
| `evaluate.py` | **End-to-end answers** (/v1/chat generation output) | relevance / completeness / accuracy (LLM-as-Judge) + latency | Yes |
| `eval_faithfulness.py` | **Generation-layer grounding** (/v1/chat) | faithfulness / answer_relevancy (RAGAS-style LLM judge) | Yes |
| `eval_abstention.py` | **Generation-layer abstention** (/v1/chat) | abstention precision / recall / F1 | Yes (chat) |

Agent evaluation (`web/lib/ai/eval/`):

| Script | Target | Metrics |
|------|----------|------|
| `eval-agent.ts` | Agent Step-1 tool selection | tool-selection accuracy / per-tool P/R/F1 / k hit rate / small-talk false-trigger rate |

Datasets:
- **`golden_dataset_en.json` (the single evaluation set / default / CI gate)** — English
  queries against an English KB, same-language retrieval. After the KB expansion it has grown
  to **73 questions** (67 in-scope + 6 abstention), covering training programming, technique,
  injury rehab, recovery, various supplements, nutrition, special populations, cardio, and
  health outcomes. All scripts read it by default; add new topics here.

(The old Chinese cross-language set `golden_dataset.json` has been removed: the product/KB is
fully English now, so the bilingual set is no longer maintained.)

---

## golden_dataset_en.json fields

```jsonc
{
  "id": "eval_009",
  "question": "How many sets per muscle group per week are best for hypertrophy?",
  "in_scope": true,                        // whether the answer can be found in the KB
  "relevant_sources": [                    // anchors: the must-hit representative documents (source = ingest file name)
    { "source": "auto_rt_hypertrophy_umbrella.txt", "grade": 3 }
  ],
  "expected_keywords": ["sets", "per week", "volume"],  // used by the LLM judge
  "topic": "training_volume",
  "difficulty": "medium"
}
```

- `relevant_sources` is now the **anchors**: the question's "must-hit representative documents" (document/source level, `source` = ingest file name), robust to re-chunking.
- `grade in {1,2,3}`: 3 = direct hit, 2 = partial support. Anchor metrics count recall/hit/mrr by `grade>=1`.
- Questions with `in_scope: false` are **abstention negatives**: the KB should not answer them (exercise progressions without an authoritative source, medical diagnosis, steroid usage, brand recommendations, real-time weather, etc.), used to evaluate "can it abstain / avoid false retrieval".

> **Why no longer use nDCG/precision against qrels?** The KB has grown to 1000+ documents, and it is no longer feasible to exhaustively label all relevant documents per question; under the old exact-qrels approach, many "unlabeled but actually relevant" documents would be treated as irrelevant, making nDCG/precision systematically underestimate quality and lose meaning. We therefore switched to two measures:
> 1. **Anchor metrics (deterministic)**: only ask "is the labeled must-hit document still in top-k" — a regression sentinel, independent of corpus size, used in the CI gate.
> 2. **Context relevance (LLM judge, `--judge`)**: directly judge whether each retrieved chunk is relevant to the query -> context_precision@k / context_hit@k, measuring absolute retrieval quality on a large corpus (RAGAS context-precision approach), run manually/nightly as needed.

---

## Reproducing: from KB expansion to metrics

Prerequisites: activate `.venv` under `rag/`, and set `GOOGLE_AI_STUDIO_API_KEY` in `.env`.

```bash
# 1) Fetch newly registered CC-BY sources (needs fetch deps: trafilatura/pyyaml/pypdf)
pip install -r requirements-dev.txt   # or install the fetch deps separately
python scripts/fetch_sources.py              # generates data/auto_*.txt

# 2) Ingest (use --force when switching backends or updating content)
python scripts/ingest_seed_kb.py --force

# 3) Run the retrieval evaluation (in-process, default k=3 5 10)
python eval/eval_retrieval.py --tag ensemble_baseline          # anchor metrics only (fast, no LLM)
python eval/eval_retrieval.py --judge --judge-k 5 --tag judged # add LLM-judge context relevance
python eval/eval_retrieval.py --judge --limit 20               # cost control: evaluate only the first 20 in-scope items
```

Output: a console comparison table + `eval/retrieval_report_<tag>_<ts>.json`.

> **Required after the first KB expansion**: run `--variant ensemble` once and backfill the
> `anchor_*` floors in `retrieval_baseline.json` with the measured values (recommended: set
> floors about 0.1 below the measured value), otherwise the gate thresholds are just placeholders.

> **Fetch/ingest pipeline hardening** (`scripts/fetch_sources.py` + `app/services/kb_service.py`):
> - HTML/PDF fetching uses a browser UA uniformly; when trafilatura's default downloader returns empty it falls back to requests — unlocking Springer/BMC/PMC/Frontiers (whose default crawler UA is blocked). Sites still fully blocked (MDPI Cloudflare 403, Taylor & Francis) are noted in comments in `sources.yaml`.
> - Trailing reference lists are auto-truncated (detected by citation-signal density), greatly reducing chunk noise and embedding calls.
> - Ingest batches embeddings (50 per batch): on hitting Gemini's free **per-minute** quota it automatically backs off 61s and retries; on **transient TLS/network errors** (SSL EOF, connection reset) it uses a short backoff retry — a single hiccup no longer fails an entire long document.
> - Note that the Gemini free tier also has a **1000 embeddings per day** hard cap (resets at Pacific midnight), which client-side throttling cannot work around; large ingests must be split across days or mind the remaining daily quota.

### Comparison experiments (numbers worth putting on a resume)

With the same qrels, switch between retrieval variants and produce a comparison table with one command (**no torch needed**, Chroma backend only):

```bash
python eval/eval_retrieval.py --variant all --tag compare
# outputs three rows bm25 / vector / ensemble: recall@3 recall@10 ndcg@10 mrr@10
```

You can also run a single path: `--variant bm25` / `--variant vector` / `--variant ensemble` (default).

**Weight sweep** (find the optimal vector/BM25 fusion ratio):

```bash
python eval/eval_retrieval.py --sweep 0 0.2 0.5 0.8 1.0 --tag weight_sweep
# each value is the vector weight, BM25 weight = 1 - it; w=1.0 is pure vector, w=0.0 is pure BM25
```

Once the optimal weight is decided, set `RETRIEVAL_VECTOR_WEIGHT=<value>` in `.env`, and production retrieval (`/v1/retrieve`, `/v1/chat`) picks it up.

> **Known finding (this project)**: queries were mostly Chinese while the KB is English, so BM25 lexical matching was almost useless (nDCG@10≈0.28).
> Equal-weight ensemble (0.5/0.5) gave nDCG@10≈0.82, **worse than pure vector's 0.99** — because BM25 dragged down the fusion.
> Therefore this project should raise `RETRIEVAL_VECTOR_WEIGHT` (close to 1.0), or use `--sweep` to find the optimum.

Add CrossEncoder reranking (locally needs torch + sentence-transformers). Use
`--variant reranker` so the eval actually runs candidates through the live
CrossEncoder compression path (the plain `ensemble` variant does NOT rerank):

```bash
RERANKER_ENABLED=true RERANKER_MODEL_NAME=cross-encoder/ms-marco-MiniLM-L-6-v2 \
  python eval/eval_retrieval.py --variant reranker --tag reranker_base
```

> Comparisons that require re-ingesting the KB (chunking strategy, embedding dimension, ensemble weights) are P3 and out of scope for this round.

### Fine-tuned domain reranker (training/)

A domain CrossEncoder is fine-tuned on synthetic `(query, positive)` pairs plus
mined hard negatives, then compared against the off-the-shelf MiniLM with the
same harness. The fine-tuned model drops into production through
`LOCAL_RERANKER_MODEL_PATH` with **no code change** (see
`app/services/retrieval/compression.py`).

Pipeline (from `rag/`):

```bash
# 1) Generate (query, positive) pairs (Gemini; bounded by free-tier quota).
#    The eval golden set is held out, NOT used for training.
python training/generate_pairs.py --max-per-source 3

# 2) Mine hard negatives + build a document-level train/val split.
python training/mine_hard_negatives.py --neg-per-pos 4          # BM25 negatives
# python training/mine_hard_negatives.py --use-rag --neg-per-pos 4  # + vector negatives

# 3) Fine-tune (GPU box / Colab; install training deps first).
pip install -r requirements-train.txt
python training/train_reranker.py --epochs 2 --batch-size 16    # → models/reranker-ft/
```

Measure the lift (base vs fine-tuned), with the LLM judge for context relevance:

```bash
RERANKER_ENABLED=true RERANKER_MODEL_NAME=cross-encoder/ms-marco-MiniLM-L-6-v2 \
  python eval/eval_retrieval.py --variant reranker --judge --tag reranker_base
RERANKER_ENABLED=true LOCAL_RERANKER_MODEL_PATH=./models/reranker-ft \
  python eval/eval_retrieval.py --variant reranker --judge --tag reranker_ft
```

Backfill the before/after numbers into `retrieval_baseline.json` →
`_reranker_ft_reference` so the gain is documented, and (optionally) tighten the
gate floors to the fine-tuned reranker's measured level.

### Evaluating the live endpoint

```bash
python eval/eval_retrieval.py --http   # hits {RAG_SERVICE_URL}/v1/retrieve
```

---

## Regression gate (`--gate`)

After evaluating, `eval_retrieval.py --gate` compares against the threshold floors in `retrieval_baseline.json`; if any metric regresses it fails with a non-zero exit code (for CI):

```bash
python eval/eval_retrieval.py --dataset golden_dataset_en.json --variant ensemble --gate
# PASS → exit 0; any recall@k / ndcg@10 / mrr@10 / frr below the floor → exit 1
```

The baseline (`retrieval_baseline.json`) uses **anchor metrics** for deterministic gating (context
relevance is a `--judge` quality measure and does not enter the gate, to save API). The current
values are **placeholder floors** and must be calibrated by backfilling the first `--variant ensemble`
measured values after the expanded KB is ingested:

| Metric | Placeholder floor | Description |
|------|------|------|
| anchor_hit@10 | ≥ 0.80 | fraction of questions hitting at least 1 anchor document in top-10 |
| anchor_recall@10 | ≥ 0.65 | fraction of anchor documents retrieved |
| anchor_mrr@10 | ≥ 0.55 | mean reciprocal rank of the first anchor hit |
| false_retrieval_rate | ≤ 0.34 | out-of-scope top-1 false high-score retrieval rate |

### CI wiring (repo root `.github/workflows/`)

- `rag-ci.yml` — runs `ruff check` + `ruff format --check` + `pytest` (including this directory's metric unit tests) on every PR/push touching `rag/`. No external API calls.
- `rag-eval.yml` — the consolidated evaluation suite. One nightly run + manual + path-filtered PR gates, with three jobs:
  - **retrieval-gate** — retrieval regression gate; runs on PRs touching `eval/`, `data/`, or `services/retrieval/`. Reads the **already-ingested Supabase** (only embeds queries, does not re-ingest in CI to avoid blowing the free quota) and runs the `--gate` above.
  - **agent-gate** — Agent Step-1 tool-selection gate (`web/lib/ai/eval/eval-agent.ts`); runs on PRs touching `web/lib/ai/`.
  - **answer-eval** — nightly/manual only: boots the backend once and runs the answer-level LLM-as-Judge (`evaluate.py`) + faithfulness (`eval_faithfulness.py`) + abstention (`eval_abstention.py`) gates.

> After changing the KB, re-ingest the new documents into Supabase (run `python scripts/ingest_seed_kb.py --force` locally with the Supabase env set), or the retrieval gate won't see them.

---

## Abstention notes

Without a similarity threshold the retrieval layer always returns k results, so `false_retrieval_rate` is only meaningful when the backend provides **comparable scores** (pure-vector Chroma similarity, or reranker enabled); under the base ensemble this metric returns -1 (not applicable).

**Generation-layer abstention** (Track A3): when `RETRIEVAL_MIN_SCORE>0` (under Supabase, `relevance_score = 1 - distance`), `RagService.chat()` clears the context and sets `retrievalMeta.abstained=true` when the top-1 score is below the threshold. Use `eval_abstention.py` to measure precision/recall over the full golden set.

---

## Unit tests

```bash
pytest tests/test_retrieval_metrics.py     # pure-function unit tests for the metrics library
```
