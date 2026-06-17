# P0 计划书：离线检索评估闭环（Offline Retrieval Eval Harness）

> 目标读者：项目作者 / 后续 agent。
> 一句话目标：为 RAG 检索层建立**客观、可复现、可做对照实验**的离线评估，产出 Recall@k / MRR / nDCG@k 等硬指标，独立于现有的 LLM-as-Judge 主观打分。
> 简历价值：把"我做了个 RAG demo" 升级为 "我能用 metrics 驱动检索决策的 MLE"。

---

## 0. 背景与现状

现有评估：`rag/eval/evaluate.py`
- 走 `POST /v1/chat`，对**最终生成的答案**用 LLM-as-Judge 打 relevance / completeness / accuracy（主观）。
- 附带 latency、citation_count。
- **缺陷**：只评"端到端答案"，无法回答"检索这一层本身好不好"；没有 baseline 对比；无回归追踪；golden 没有标注相关文档，算不了检索指标。

检索链路（被评估对象）：`RagService.retrieve()` → `vector (k=10) + BM25 (k=10)` Ensemble 融合 → 可选 CrossEncoder rerank → 截断 topK。纯检索端点 `POST /v1/retrieve`。

---

## 1. 关键前置问题（必须先解决）：数据集 ↔ 知识库 不匹配

**现状**：知识库 `rag/data/` 只有 5 个文档，全是营养/补剂主题：

| 文件 | 主题 |
|------|------|
| `kb_01_protein_and_exercise.txt` | 蛋白质摄入 (ISSN) |
| `kb_02_creatine_supplementation.txt` | 肌酸 |
| `kb_03_nutrient_timing.txt` | 营养时机 |
| `kb_04_caffeine_and_performance.txt` | 咖啡因与表现 |
| `kb_05_diets_and_body_composition.txt` | 饮食与身体成分 |

但 `golden_dataset.json` 的 15 个问题大量涉及训练动作/计划（深蹲、硬拉、卧推、推拉分化、热身、引体、过度训练…），**KB 中无对应文档**。粗略只有 ~4–5 条（蛋白质、肌酸、减脂保肌、碳水/营养时机）能在 KB 找到出处。

**结论**：必须先让评估数据和 KB 对齐，否则检索指标无意义。采用如下组合策略：

- **方案 A（先做，快）**：重构 golden dataset，使每条 in-scope 问题都能对应到现有 5 个营养类文档；为其标注相关文档（qrels）。
- **方案 C（同时做）**：保留少量 out-of-scope 问题（如训练动作类），标记 `in_scope=false`，作为"应当弃答/检索应为空"的负样本，用于评估 **abstention / 误召回**。
- **方案 B（列入 P3，后续扩展）**：通过 `data/sources.yaml` + `scripts/fetch_sources.py` 扩充训练动作/计划类权威英文源，再把对应问题转为 in-scope。

---

## 2. 相关性标注（qrels）设计

**标注粒度：文档/source 级**（用 `source` 文件名作为 doc 标识）。
- 理由：chunk 的 `chunk_index` 会随 chunking 策略（语义切片是默认且可能变动）漂移，source 级标注**抗 re-chunk**、稳健，且是检索评估的标准做法。
- 可选 stretch：chunk 级（`source` + `chunk_index`），留作 P3。

**数据格式**：扩展 `golden_dataset.json`，每条新增字段：

```jsonc
{
  "id": "eval_003",
  "question": "增肌期每天蛋白质摄入应该是多少？",
  "in_scope": true,
  "relevant_sources": [
    { "source": "kb_01_protein_and_exercise.txt", "grade": 3 }
  ],
  "expected_keywords": ["体重", "克", "1.6", "2.2"],   // 保留，供 LLM-as-Judge 用
  "topic": "nutrition",
  "difficulty": "easy"
}
```

- `grade`：分级相关性 0–3（3=高度相关，1=弱相关，0=不相关），用于 nDCG。二元指标（Recall/MRR）按 `grade>=1` 视为相关。
- `in_scope=false` 的条目 `relevant_sources` 为空，用于 abstention 评估。

**标注流程（半自动，降低人工成本）**：
1. 对每条 query 调用 `RagService.retrieve(query, k=10)`，导出候选 `source` 列表 + snippet 到一个临时 CSV/JSON。
2. 人工快速确认每个候选是否相关并打 grade（5 文档体量，几十分钟可完成）。
3. 写回 `golden_dataset.json`。
4. （脚本辅助）提供 `eval/label_helper.py` 生成候选清单。

---

## 3. 指标实现

新增 `eval/retrieval_metrics.py`（纯函数，无外部依赖，便于单测）：

| 指标 | 说明 |
|------|------|
| `hit_rate@k` | 前 k 个里是否至少命中 1 个相关文档 |
| `recall@k` | 命中相关文档数 / 总相关文档数 |
| `precision@k` | 命中相关文档数 / k |
| `mrr@k` | 第一个相关文档排名的倒数 |
| `ndcg@k` | 用 `grade` 的归一化折损累积增益 |

对 `in_scope=false` 的 abstention 评估：
- `false_retrieval_rate`：本应无相关文档却仍召回（高分）文档的比例（越低越好）。
- 与 `/v1/chat` 结合时可评估是否正确弃答（P2 范畴，P0 先只在检索层看召回分布）。

配套单测 `tests/test_retrieval_metrics.py`：用手造的小 ranking + qrels 校验每个指标的边界与正确性。

---

## 4. 评估 Runner 与对照实验

新增 `eval/eval_retrieval.py`：
- **进程内直调** `RagService.retrieve()`（不必起 HTTP 服务，更快、更可控、可在 CI 跑）。
- 对 `golden_dataset.json` 中 `in_scope=true` 的每条 query 取 ranked `source` 列表，对照 qrels 算 §3 指标。
- 聚合：整体均值 + 按 `topic` / `difficulty` 分组。
- 输出：控制台对比表 + `eval/retrieval_report_<ts>.json`。

**对照实验（第一版，无需重灌库的配置）**：

| 配置 | 如何切换 | 预期 bullet |
|------|----------|------------|
| `bm25-only` | 直接构造 BM25 retriever | 各召回源贡献基线 |
| `vector-only` | 直接构造向量 retriever | 同上 |
| `ensemble`（现状） | 默认 | 融合是否优于单路 |
| `ensemble + reranker` | `RERANKER_ENABLED=true`（需本地 torch） | reranker 增益 |

需重灌库的配置（chunking 策略、embedding 维度、ensemble 权重）→ **列入 P3**，第一版不做。

实现注意：为支持 vector-only / bm25-only 对照，可能需要在评估脚本里**绕过 `RagService` 直接拿到底层 retriever**（`vector_service.get_retriever()` 内部已构造 ensemble）。第一版若实现成本高，可先只做 `ensemble` vs `ensemble+reranker` 两组，保证最快拿到一条有数字的 bullet。

---

## 5. 里程碑拆解

| # | 任务 | 产出 | 估时 |
|---|------|------|------|
| M1 | 数据对齐：重构 golden dataset（in_scope 分类 + abstention 负样本） | 更新后的 `golden_dataset.json` | 0.5 天 |
| M2 | qrels 标注（含 `label_helper.py` 候选导出 + 人工确认） | 带 `relevant_sources` 的数据集 | 0.5 天 |
| M3 | 指标库 `retrieval_metrics.py` + 单测 | 通过 pytest | 0.5 天 |
| M4 | 评估 runner `eval_retrieval.py`（进程内，单配置先跑通） | 控制台表 + JSON 报告 | 0.5 天 |
| M5 | 对照实验：reranker on/off（+ 力争 vector/bm25 单路） | 对比表 + 报告 | 0.5 天 |
| M6 | 文档：`eval/README.md` 复现步骤 + 指标解读 | README | 0.5 天 |

总计约 3 个工作日（不含扩 KB 的 P3）。

---

## 6. 风险与缓解

| 风险 | 缓解 |
|------|------|
| KB 仅 5 文档，检索指标区分度低、数字"太好看"不可信 | P0 先聚焦 in-scope 子集把流程跑通；P3 用 `fetch_sources.py` 扩 KB 提升区分度与可信度 |
| 语义 chunker 重灌后 chunk 漂移 | qrels 用 **source 级** 标注，天然抗漂移 |
| reranker 需要本地 `torch`（云端禁用） | 对照实验仅在本地跑；报告标注运行环境 |
| 标注主观性 | 用分级 grade + 记录标注理由；in-scope 判定双人/二次复核（个人项目可自检两轮） |
| 进程内直调与线上 `/v1/retrieve` 行为漂移 | runner 默认进程内；提供可选 `--http` 模式对照线上端点 |

---

## 7. 验收标准（Definition of Done）

- [ ] `golden_dataset.json` 每条都有 `in_scope` 与（in-scope 条目的）`relevant_sources`。
- [ ] `retrieval_metrics.py` 实现 Recall@k / Precision@k / MRR / nDCG@k / hit_rate@k，单测通过。
- [ ] `eval_retrieval.py` 可一键产出某配置的指标报告（JSON + 控制台表）。
- [ ] 至少跑出一组对照实验（如 reranker on vs off），得到可写进简历的具体数字。
- [ ] `eval/README.md` 写清如何复现。

---

## 8. 后续（P1 / P2 预告，非本次范围）

- **P1**：把 `eval_retrieval.py` 接进 GitHub Actions，设阈值做回归门禁。
- **P2**：在线可观测性（请求级 latency / 检索命中 / token 成本结构化日志 + dashboard）。
- **P3**：扩 KB（训练动作/计划类权威源）、chunking / 权重 / 维度对照实验、chunk 级 qrels。
