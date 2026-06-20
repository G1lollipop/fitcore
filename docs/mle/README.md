# FitCore × MLE 求职资料包

> 目的：帮项目作者把 FitCore 写进简历，申请**美国 MLE（Machine Learning Engineer）实习**。
> 这是一套「**现状盘点 → 开发计划 → 学习指南 → 简历面试**」四件套，互相引用，咬合推进。

---

## 这套文档怎么用

```
先读 ① 看清家底 ──► 再读 ② 知道往哪打 ──► 用 ③ 边学边补 ──► 用 ④ 把成果变成 offer
```

| 文档 | 内容 | 什么时候读 |
|------|------|-----------|
| [`01-项目现状分析.md`](./01-项目现状分析.md) | 用招聘官视角客观盘点 FitCore 的 ML 含量：5 个 AI 能力面体检、成熟度打分卡、强项与硬缺口 | **现在就读**，建立全局认知 |
| [`02-后续开发计划.md`](./02-后续开发计划.md) | 7 个开发 Track（评估闭环 / 训模型 / 可观测性 / 检索进阶 / 推荐 / 安全 / 基建），每个都给「做什么 + 改哪 + 产出哪条简历 bullet」 | 决定下一步做什么时 |
| [`03-MLE学习指南.md`](./03-MLE学习指南.md) | 从零的 MLE 知识地图（6 层），每个概念对应到 FitCore 真实代码；面试准备；资源速查 | 不懂某个概念、或准备面试时 |
| [`04-简历与面试.md`](./04-简历与面试.md) | 可直接用的简历 bullet（标了哪些是真实数字、哪些需做完才填）、STAR 故事库、追问应答 | 写简历 / 面试前 |

---

## 30 秒速览结论

- **FitCore 现状**：是一个**强的 RAG/LLM 应用项目**，亮点是「**带 CI 回归门禁的检索评估体系**」——这正是区分「会调 API」和「会做 ML 决策」的关键，学生项目里很罕见。
- **真实可用的数字**（`rag/eval/`）：hybrid 检索 nDCG@10 ≈ 0.92、MRR ≈ 0.91；用权重扫描数据驱动地把融合权重定为 0.8。
- **唯一硬缺口**：**没有自己训练/微调的模型**（全是调 Gemini API）。这是从「AI 应用工程师」升级到「MLE」要补的一步。
- **最高性价比的三步**：
  1. [Track A](./02-后续开发计划.md)：给 Agent/生成层补评估闭环（延续你最强的主线）。
  2. [Track D1](./02-后续开发计划.md)：蒸馏微调一个小模型（补硬缺口，证明你会训模型）。
  3. [Track B](./02-后续开发计划.md)：加可观测性 + 降本提速（拿到招聘官最爱的 X% 数字）。

---

## 关键事实索引（写简历/面试时随手查）

| 维度 | 事实 |
|------|------|
| 架构 | monorepo：`web/`（Next.js 16 + Agent 编排）+ `rag/`（FastAPI 检索服务）；**检索与生成分离** |
| 检索 | Gemini `gemini-embedding-001`（768 维 Matryoshka）+ BM25，加权 RRF 融合，Chroma / Supabase pgvector(HNSW)，可选 CrossEncoder 重排（优雅降级） |
| 生成 | `gemini-2.5-flash`，2 步 tool-calling agent（规划 temp 0.2 / 生成 temp 0.7），SSE 流式 |
| 评估 | 离线检索 harness（文档级 qrels、nDCG/Recall/MRR/AP、abstention）+ LLM-as-judge 答案评估 |
| CI 门禁 | `rag-ci.yml`（lint+test）、`rag-retrieval-eval.yml`（检索回归）、`rag-nightly-eval.yml`（答案回归，自动开 issue） |
| 真实指标 | recall@3/10=1.0、nDCG@10=0.92、MRR@10=0.91、FRR=0.0（18 in-scope，ensemble@0.8/Supabase） |
| 数据 | ~16 文档（CC-BY/公共领域 only），`sources.yaml` 登记 + 抓取管线（去重/限流退避/降噪） |
| 其它 AI | 拍照识别饭菜（Gemini 视觉 + 置信度门控）、自然语言记录（多意图结构化抽取） |

---

## 维护建议

- **每做完一个开发 Track**：回 [`04-简历与面试.md`](./04-简历与面试.md) 把对应 bullet 的 `XX%` 换成真实数字，并加一个 STAR 故事。
- **数字诚实**：带 `XX%` 占位的 bullet 在做出真实数据前**不要**写进简历；recall=1.0 这类饱和指标面试要主动说明 limitation。
- 本目录只是「求职/规划」资料，不影响项目运行；产品/开发文档仍以根目录 [`README.md`](../../README.md) 和 [`DEVELOPMENT.md`](../../DEVELOPMENT.md) 为准。
