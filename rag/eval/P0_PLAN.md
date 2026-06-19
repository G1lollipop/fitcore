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

## 8b. 执行决策记录（2026-06-17）

实际执行时，针对"KB 太小/数据不匹配"做了如下决策并已落地：

- **先扩 KB 再标注**（用户拍板）：在 `data/sources.yaml` 新登记 4 个**纯 CC-BY** 训练编程类源——
  `rt_hypertrophy_umbrella`（训练量/频率/周期化）、`periodized_rt_minireview`（周期化/渐进超负荷）、
  `concurrent_training_review`（干扰效应）、`warmup_resistance_training`（热身）。加上原有 3 个待抓源，
  KB 从 5 篇 → 约 12 篇。
- **授权红线**：动作技术/姿势类只找到 CC BY-**NC** 源，**不收**；过度训练、引体进阶暂无干净源。
- **没源的题转 abstention 负样本**（`in_scope:false`），用于"无文档时是否误召回/弃答"评估。
- **数据集落地**：`golden_dataset.json` 重构为 **12 道 in-scope + 6 道 abstention**，每个 KB 文档（含此前无题的咖啡因 `kb_04`）≥1 题。
- **qrels 粒度**：document/source 级，`source` = 灌库文件名（与 `kb_service` 的 `metadata["source"]=filename` 对齐，已核实）。

**已交付（确定性、无需外部环境）**：
- `data/sources.yaml`：+4 CC-BY 源
- `eval/golden_dataset.json`：in_scope + relevant_sources(grade) + abstention
- `eval/retrieval_metrics.py`：Recall/Precision/MRR/nDCG/hit_rate/AP/false_retrieval_rate（纯函数）
- `tests/test_retrieval_metrics.py`：指标单测
- `eval/eval_retrieval.py`：进程内 / HTTP 两种取数的评估 runner + 报告
- `eval/README.md`：复现文档

**关键实验发现（2026-06-18，Supabase pgvector 后端）**：

| variant | recall@3 | recall@10 | nDCG@10 | MRR |
|---|---|---|---|---|
| bm25 | 0.292 | 0.375 | 0.279 | 0.257 |
| vector | 1.000 | 1.000 | **0.986** | **1.000** |
| ensemble (0.5/0.5, 旧默认) | 1.000 | 1.000 | 0.822 | 0.792 |

- query 多为中文、KB 为英文 → **BM25 词法匹配几乎失效**；等权重融合反而把 nDCG@10 从 0.99 拉低到 0.82。
- 据此把 ensemble 权重做成可配置（`RETRIEVAL_VECTOR_WEIGHT`，默认仍 0.5 不破坏现状），并加 `--sweep` 找最优。
- Recall 在 9 文档小 KB 下饱和（向量/ensemble 均 1.0）→ 头条指标用 **nDCG@10 / MRR**。

**双语 query 权重扫描（同一 KB，向量权重 vs nDCG@10）**：

| 向量权重 | 中文 query (cross-lingual) | 英文 query (same-language) |
|---|---|---|
| 0.0 (纯 BM25) | 0.279 | 0.750 |
| 0.2 | 0.327 | 0.886 |
| 0.5 | 0.822 | 0.978 |
| 0.8 | 0.903 | **0.986** |
| 1.0 (纯向量) | **0.986** | 0.955 |

结论（按 query 语言分场景）：
- **跨语言（中文问 / 英文库）→ 纯向量 w=1.0 最优**：BM25 词法跨语言失效。
- **同语言（英文问 / 英文库）→ 混合 w=0.8 最优**，且 hybrid(0.986) > 纯向量(0.955) > 纯BM25(0.750)：两路互补，融合胜出，正是 hybrid 检索的标准理由。
- 产品将转全英文 → 采用 **`RETRIEVAL_VECTOR_WEIGHT=0.8`**。
- 评测集：中文 `golden_dataset.json` / 英文 `golden_dataset_en.json`，runner `--dataset` 切换。

**待在你的 `.venv`（Python 3.11 + Gemini key）跑**：
1. `python scripts/fetch_sources.py`（抓 4 个新源 + 3 个旧源）
2. `python scripts/ingest_seed_kb.py --force`（灌库）
3. `python eval/eval_retrieval.py --tag ensemble`（出基线指标）
4. （可选）`RERANKER_ENABLED=true python eval/eval_retrieval.py --tag reranker_on`（对照）

---

## 8. P1 落地：扩 KB + CI 回归门禁（已完成）

**扩 KB（广度，CC-BY only）**：新增 3 个 ISSN 立场声明开放获取源 —— beta-alanine、sodium bicarbonate、HMB（补剂/缓冲剂主题），中英 golden set 各加 3 道 in-scope 题（`eval_013/014/015`）。in-scope 由 12 → **15**。

抓取/灌库管线为此加固（`scripts/fetch_sources.py` + `app/services/kb_service.py`）：
- **浏览器 UA 回退**：trafilatura 默认下载器对 Springer/BMC/PMC 抽到 0 字，回退到带 UA 的 requests 解锁。
- **参考文献尾部截断**：按引用信号密度检测并裁掉 bibliography（HMB 141k→96k、sodium 148k→99k），减 chunk 噪声与 embedding 调用。
- **免费额度节流灌入**：embedding 分批 + 撞 429 自动退避重试，长文档（>100 chunk）免手动分次。

**扩库后英文集复评（ensemble@0.8 / supabase，15 in-scope）**：

| 指标 | 值 |
|---|---|
| recall@3 / recall@10 | 1.000 / 1.000 |
| nDCG@10 | 0.964 |
| MRR@10 | 0.967 |
| false_retrieval_rate（abstention） | 0.000 |

3 道新补剂题全部 nDCG@10=1.0 / MRR=1.0，确认新文档已正确灌入且可召回。

**CI 回归门禁**（仓库根 `.github/workflows/`，GitHub 只读根目录）：
- `rag-ci.yml`：每 PR/push `ruff check` + `pytest`（含指标单测），不调外部 API。
- `rag-retrieval-eval.yml`：检索回归门禁。`eval_retrieval.py --gate` 对照 `retrieval_baseline.json` 阈值地板，回归即 fail。读已灌好的 Supabase（只 embed query，不在 CI 重灌 → 不炸额度）；nightly + 手动 + 改 eval/data/retrieval 的 PR 触发；nightly 回归自动开 issue。
- `rag-nightly-eval.yml`：答案层 LLM-as-Judge nightly 门禁（原 `nightly-rag-eval.yml`，从休眠的 `rag/.github/` 迁到根目录激活）。
- 配套修复：过时单测 `test_chat` 空 query 期望由 500 → 422（与生产校验一致）；清理 ruff lint（新增 `ruff.toml` 豁免有意晚导入的 E402）。

## 8.1 KB 再扩一批（广度，已完成）

在 P1 基础上再补 3 个 CC-BY 开放获取源，把覆盖从「营养 + 补剂」拓宽到**肠道/免疫、进餐频率、训练间歇恢复**：

| 主题 | 源 | 文件 | 片段 |
|---|---|---|---|
| 益生菌 / 肠道 / 免疫 / 恢复 | ISSN Position Stand: Probiotics（BMC） | `auto_issn_probiotics.txt` | 203 |
| 进餐频率与体成分 | ISSN Position Stand: Meal Frequency（BMC） | `auto_issn_meal_frequency.txt` | 57 |
| 组间休息 × 增肌 | Give It a Rest（Frontiers 2024） | `auto_rest_interval_hypertrophy.txt` | ~50 |

英文主集加 3 道 in-scope 题（`eval_016/017/018`），in-scope 由 15 → **18**。

- **试过但放弃**：`issn_review_2018`（大综述，与各专题库高度重叠会拉低 qrels nDCG，设 `fetch:false`）；MDPI sleep（Cloudflare 403）、T&F female athlete（反爬）—— 均在 `sources.yaml` 注释留痕，待找到机构库镜像再说。
- **管线再加固**：PDF 抓取也统一浏览器 UA；embedding 子批 80→**50** 减小 payload；除 429 退避外，**瞬时 TLS/网络错误（SSL EOF、连接重置）也短退避重试**（probiotics 灌入时实测触发并自愈）。
- **运维教训**：Gemini 免费层除每分钟限速外，还有**每日 1000 次** embedding 硬上限（太平洋午夜重置），客户端节流无法绕过，大批量灌库需分日。

**再扩库后英文集复评（ensemble@0.8 / supabase，18 in-scope）**：

| 指标 | 值 | 门禁地板 |
|---|---|---|
| recall@3 / recall@10 | 1.000 / 1.000 | 0.90 / 0.95 |
| nDCG@10 | 0.922 | 0.88 |
| MRR@10 | 0.907 | 0.86 |
| false_retrieval_rate | 0.000 | ≤0.34 |

3 道新题全部 nDCG@10=1.0 / MRR=1.0；nDCG 整体由 0.964 微降至 0.922（库变大后竞争 chunk 增多，属预期），仍稳过门禁。`retrieval_baseline.json` 观测值与地板已同步更新（中文集已冻结，仅作跨语种基准）。

## 9. 后续（P2 预告，非本次范围）

- **P2**：在线可观测性（请求级 latency / 检索命中 / token 成本结构化日志 + dashboard）。
- **P3**：chunking / 权重 / 维度对照实验、chunk 级 qrels。
