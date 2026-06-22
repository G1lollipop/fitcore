# RAG 评估（eval/）

本目录有两套互补的评估：

| 脚本 | 评估对象 | 指标 | 是否需 LLM |
|------|----------|------|-----------|
| `eval_retrieval.py` | **检索层**（向量+BM25+可选重排） | **锚点**：anchor_recall@k / anchor_hit@k / anchor_mrr@k（确定性，CI 门禁）；**质量**：context_precision@k / context_hit@k（LLM 裁判，`--judge`）+ abstention | 默认否；`--judge` 才需 |
| `evaluate.py` | **端到端答案**（/v1/chat 生成结果） | relevance / completeness / accuracy（LLM-as-Judge）+ latency | 是 |
| `eval_faithfulness.py` | **生成层接地**（/v1/chat） | faithfulness / answer_relevancy（RAGAS-style LLM-judge） | 是 |
| `eval_abstention.py` | **生成层弃答**（/v1/chat） | abstention precision / recall / F1 | 是（chat） |

Agent 评估（`web/lib/ai/eval/`）：

| 脚本 | 评估对象 | 指标 |
|------|----------|------|
| `eval-agent.ts` | Agent Step-1 工具选择 | tool-selection accuracy / per-tool P/R/F1 / k 命中率 / 闲聊误触发率 |

数据集：
- **`golden_dataset_en.json`（唯一评测集 / 默认 / CI 门禁）** — 英文 query 对英文 KB，
  同语种检索。扩库后已扩到 **73 题**（67 in-scope + 6 abstention），覆盖训练编排/动作技术/
  受伤康复/恢复/各类补剂/营养/特殊人群/心肺/健康结局。所有脚本默认读它，新主题往这里加题。

（旧的中文跨语种集 `golden_dataset.json` 已移除：产品/KB 走全英文，不再维护双语集。）

---

## golden_dataset_en.json 字段

```jsonc
{
  "id": "eval_009",
  "question": "How many sets per muscle group per week are best for hypertrophy?",
  "in_scope": true,                        // 是否能从 KB 找到答案
  "relevant_sources": [                    // 锚点：必中的代表性文档（source = 灌库文件名）
    { "source": "auto_rt_hypertrophy_umbrella.txt", "grade": 3 }
  ],
  "expected_keywords": ["sets", "per week", "volume"],  // 供 LLM-judge 用
  "topic": "training_volume",
  "difficulty": "medium"
}
```

- `relevant_sources` 现在是**锚点（anchors）**：该题「必中的代表性文档」（document/source 级，`source` = 灌库文件名），抗 re-chunk。
- `grade ∈ {1,2,3}`：3=直接命中，2=部分支撑。锚点指标按 `grade>=1` 计 recall/hit/mrr。
- `in_scope: false` 的题是 **abstention 负样本**：KB 不该答（动作进阶无授权来源、医疗诊断、类固醇用法、品牌推荐、实时天气等），用于评估「能否弃答 / 不误召回」。

> **为什么不再用 nDCG/precision 对 qrels？** KB 已扩到 1000+ 篇，无法对每题穷举标注所有相关文档；旧的精确-qrels 下，大量「未标注但其实相关」的文档会被当成不相关，使 nDCG/precision 系统性低估、失去意义。因此改为两套口径：
> 1. **锚点指标（确定性）**：只问「标注的必中文档是否仍在 top-k」——回归哨兵，与语料规模无关，进 CI 门禁。
> 2. **context 相关性（LLM 裁判，`--judge`）**：直接判每个检索到的 chunk 对该 query 是否相关 → context_precision@k / context_hit@k，衡量大语料下的绝对检索质量（RAGAS context precision 思路），按需手动/nightly 跑。

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
python eval/eval_retrieval.py --tag ensemble_baseline          # 仅锚点指标（快、无需 LLM）
python eval/eval_retrieval.py --judge --judge-k 5 --tag judged # 加 LLM 裁判 context 相关性
python eval/eval_retrieval.py --judge --limit 20               # 控成本：只评前 20 条 in-scope
```

输出：控制台对比表 +  `eval/retrieval_report_<tag>_<ts>.json`。

> **首次扩库后必做**：用 `--variant ensemble` 实测一次，把 `retrieval_baseline.json` 的
> `anchor_*` 地板按实测值回填（建议地板设在实测值下方约 0.1），否则门禁阈值只是占位。

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

基线（`retrieval_baseline.json`）用**锚点指标**做确定性门禁（context 相关性是 `--judge`
质量口径，不进门禁以省 API）。当前为**占位地板**，需用扩库灌库后第一次 `--variant ensemble`
实测值回填校准：

| 指标 | 占位地板 | 说明 |
|------|------|------|
| anchor_hit@10 | ≥ 0.80 | top-10 至少命中 1 个锚点文档的题比例 |
| anchor_recall@10 | ≥ 0.65 | 锚点文档被检索到的比例 |
| anchor_mrr@10 | ≥ 0.55 | 第一个锚点命中名次的倒数均值 |
| false_retrieval_rate | ≤ 0.34 | out-of-scope top-1 误高分召回率 |

### CI 接线（仓库根 `.github/workflows/`）

- `rag-ci.yml` — 每个 PR/push 跑 `ruff check` + `pytest`（含本目录指标单测）。不调外部 API。
- `rag-retrieval-eval.yml` — **检索回归门禁**：nightly + 手动 + 改到 `eval/` `data/` `services/retrieval/` 的 PR 触发。读**已灌好的 Supabase**（只 embed query，不在 CI 重灌，避免炸免费额度），跑上面的 `--gate`。
- `rag-nightly-eval.yml` — 答案层 LLM-as-Judge nightly 门禁（`evaluate.py`）。
- `rag-generation-eval.yml` — **生成层** faithfulness + abstention nightly 门禁（`eval_faithfulness.py` + `eval_abstention.py`）。
- `agent-eval.yml` — **Agent 工具选择** nightly + PR 门禁（`web/lib/ai/eval/eval-agent.ts`）。

> KB 变更后需先跑手动 workflow「RAG KB ingest (Supabase)」把新文档灌进库，检索门禁才看得到。

---

## abstention 说明

检索层无相似度阈值时永远返回 k 条，所以 `false_retrieval_rate` 只有在后端提供**可比分数**（纯向量 Chroma 相似度、或开启 reranker）时才有意义；base ensemble 下该项返回 -1（不适用）。

**生成层弃答**（Track A3）：设置 `RETRIEVAL_MIN_SCORE>0`（Supabase 下 `relevance_score = 1 - distance`）时，`RagService.chat()` 会在 top-1 分数低于阈值时清空 context 并设 `retrievalMeta.abstained=true`。用 `eval_abstention.py` 在 golden 全集上量 precision/recall。

---

## 单元测试

```bash
pytest tests/test_retrieval_metrics.py     # 指标库纯函数单测
```
