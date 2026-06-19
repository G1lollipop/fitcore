# RAG 评估（eval/）

本目录有两套互补的评估：

| 脚本 | 评估对象 | 指标 | 是否需 LLM |
|------|----------|------|-----------|
| `eval_retrieval.py` | **检索层**（向量+BM25+可选重排） | Recall@k / Precision@k / MRR@k / nDCG@k / hit_rate@k + abstention | 否（只需 embedding） |
| `evaluate.py` | **端到端答案**（/v1/chat 生成结果） | relevance / completeness / accuracy（LLM-as-Judge）+ latency | 是 |

数据集：
- **`golden_dataset_en.json`（主集 / 默认 / CI 门禁）** — 英文 query 对英文 KB，同语种检索，
  代表产品真实形态（KB 全为英文文献、产品走全英文）。脚本默认就读它，新主题只往这里加题。
- `golden_dataset.json`（**已冻结**，可选） — 中文 query 对英文 KB 的**跨语种**难例基准。
  不再随新主题扩充，仅用于回归观察跨语种检索鲁棒性（见下方「已知发现」）。

默认即英文主集；要跑跨语种基准用 `--dataset golden_dataset.json`。

---

## golden_dataset.json 字段

```jsonc
{
  "id": "eval_009",
  "question": "每周每个肌群练多少组...",
  "in_scope": true,                       // 是否能从 KB 找到答案
  "relevant_sources": [                   // 文档级 qrels（source = 灌库文件名）
    { "source": "auto_rt_hypertrophy_umbrella.txt", "grade": 3 }
  ],
  "expected_keywords": ["组数", "每周"],   // 供 evaluate.py 的 LLM-judge 用
  "topic": "training_volume",
  "difficulty": "medium"
}
```

- **qrels 用 document/source 级**（`source` = 灌库时的文件名），抗 re-chunk，稳健。
- `grade ∈ {1,2,3}`：3=直接命中，2=部分支撑，1=弱相关。二元指标按 `grade>=1`，nDCG 用分级。
- `in_scope: false` 的题是 **abstention 负样本**：KB 无授权干净来源，用于评估「无相关文档时是否误召回 / 能否弃答」。

> KB 仅收录 CC-BY / 公共领域 / 官方指南（见 `../data/sources.yaml`）。动作技术/姿势、过度训练、引体进阶等没有授权干净来源的题，被刻意标为 `in_scope:false`。

---

## 复现：从扩库到出指标

前置：在 `rag/` 下激活 `.venv`，`.env` 配好 `GOOGLE_AI_STUDIO_API_KEY`。

```bash
# 1) 抓取新登记的 CC-BY 源（需 fetch 依赖：trafilatura/pyyaml/pypdf）
pip install -r requirements-ingest-ci.txt   # 或单独装 fetch 依赖
python scripts/fetch_sources.py              # 生成 data/auto_*.txt

# 2) 灌库（切后端或更新正文用 --force）
python scripts/ingest_seed_kb.py --force

# 3) 跑检索评估（进程内，默认 k=3 5 10）
python eval/eval_retrieval.py --tag ensemble_baseline
```

输出：控制台对比表 +  `eval/retrieval_report_<tag>_<ts>.json`。

> **抓取/灌库管线加固**（`scripts/fetch_sources.py` + `app/services/kb_service.py`）：
> - HTML/PDF 抓取统一用浏览器 UA；trafilatura 默认下载器抽空时回退到 requests —— 解锁 Springer/BMC/PMC/Frontiers（默认爬虫 UA 被挡）。仍挡死的（MDPI Cloudflare 403、Taylor & Francis）在 `sources.yaml` 注释留痕。
> - 自动截断尾部参考文献列表（按引用信号密度检测），大幅减少 chunk 噪声与 embedding 调用。
> - 灌库对 embedding 分批（每批 50）：撞 Gemini 免费**每分钟**额度自动退避 61s 重试；撞**瞬时 TLS/网络错误**（SSL EOF、连接重置）短退避重试 —— 一次抖动不再让整篇长文档失败。
> - 注意 Gemini 免费层还有**每日 1000 次** embedding 硬上限（按太平洋午夜重置），客户端节流救不了；大批量灌库需分日或留意当日余量。

### 对照实验（出可写进简历的数字）

同一份 qrels，切不同检索变体，一条命令出对比表（**无需 torch**，仅 Chroma 后端）：

```bash
python eval/eval_retrieval.py --variant all --tag compare
# 输出 bm25 / vector / ensemble 三行对比：recall@3 recall@10 ndcg@10 mrr@10
```

也可单独跑某一路：`--variant bm25` / `--variant vector` / `--variant ensemble`（默认）。

**权重扫描**（找最优向量/BM25 融合比例）：

```bash
python eval/eval_retrieval.py --sweep 0 0.2 0.5 0.8 1.0 --tag weight_sweep
# 每个值是向量权重，BM25 权重 = 1 - 它；w=1.0 即纯向量，w=0.0 即纯 BM25
```

定下最优权重后，在 `.env` 设 `RETRIEVAL_VECTOR_WEIGHT=<值>`，生产检索（`/v1/retrieve`、`/v1/chat`）即生效。

> **已知发现（本项目）**：query 多为中文、KB 为英文，BM25 词法匹配几乎失效（nDCG@10≈0.28）。
> 等权重 ensemble（0.5/0.5）nDCG@10≈0.82，**劣于纯向量的 0.99**——因为 BM25 拖累融合。
> 因此本项目应把 `RETRIEVAL_VECTOR_WEIGHT` 调高（接近 1.0），或用 `--sweep` 定最优。

加 CrossEncoder 重排（本地需 torch + sentence-transformers）：

```bash
RERANKER_ENABLED=true python eval/eval_retrieval.py --tag reranker_on
```

> 需重灌库的对照（chunking 策略、embedding 维度、ensemble 权重）属于 P3，不在本轮。

### 评估线上端点

```bash
python eval/eval_retrieval.py --http   # 打 {RAG_SERVICE_URL}/v1/retrieve
```

---

## 回归门禁（`--gate`）

`eval_retrieval.py --gate` 评测后对照 `retrieval_baseline.json` 的阈值地板，任一指标回归即以非 0 退出码失败（供 CI 用）：

```bash
python eval/eval_retrieval.py --dataset golden_dataset_en.json --variant ensemble --gate
# PASS → exit 0；任一 recall@k / ndcg@10 / mrr@10 / frr 低于地板 → exit 1
```

基线（`retrieval_baseline.json`）是**保守地板**（明显低于当前观测，抓真实回归而非噪声）：

| 指标 | 地板 | 当前观测（扩库后，ensemble@0.8 / supabase） |
|------|------|------|
| recall@3 | ≥ 0.90 | 1.000 |
| recall@10 | ≥ 0.95 | 1.000 |
| ndcg@10 | ≥ 0.90 | 0.964 |
| mrr@10 | ≥ 0.88 | 0.967 |
| false_retrieval_rate | ≤ 0.34 | 0.000 |

### CI 接线（仓库根 `.github/workflows/`）

- `rag-ci.yml` — 每个 PR/push 跑 `ruff check` + `pytest`（含本目录指标单测）。不调外部 API。
- `rag-retrieval-eval.yml` — **检索回归门禁**：nightly + 手动 + 改到 `eval/` `data/` `services/retrieval/` 的 PR 触发。读**已灌好的 Supabase**（只 embed query，不在 CI 重灌，避免炸免费额度），跑上面的 `--gate`。
- `rag-nightly-eval.yml` — 答案层 LLM-as-Judge nightly 门禁（`evaluate.py`）。

> KB 变更后需先跑手动 workflow「RAG KB ingest (Supabase)」把新文档灌进库，检索门禁才看得到。

---

## abstention 说明

检索层无相似度阈值时永远返回 k 条，所以 `false_retrieval_rate` 只有在后端提供**可比分数**（纯向量 Chroma 相似度、或开启 reranker）时才有意义；base ensemble 下该项返回 -1（不适用）。真正的「弃答」评估在 `/v1/chat` 生成层，属于 P2。

---

## 单元测试

```bash
pytest tests/test_retrieval_metrics.py     # 指标库纯函数单测
```
