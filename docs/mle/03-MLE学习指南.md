# MLE 学习指南（从零到能拿美国实习）

> 读者：对 MLE 了解不多，但有编程基础（能写出 FitCore 这种项目）、想申请美国 MLE 实习。
> 本指南的特色：**把每个 MLE 知识点都对应到 FitCore 里的真实代码**，边学边用，而不是空读理论。
> 配套：[`01-项目现状分析.md`](./01-项目现状分析.md)、[`02-后续开发计划.md`](./02-后续开发计划.md)、[`04-简历与面试.md`](./04-简历与面试.md)。

---

## 1. 先搞清楚：MLE 到底是什么？和相关岗位的区别

很多人混淆这几个岗位，但美国招聘里区别很明确：

| 岗位 | 核心工作 | 一句话区分 |
|------|----------|-----------|
| **MLE（ML Engineer）** | 把模型**做出来 + 上线 + 跑稳**：数据管线、训练、评估、服务、监控 | "让模型在生产里可靠地工作" — **工程为主，会建模** |
| **Research Scientist / RS** | 发明新模型/算法，发论文 | "提出新方法" — 偏研究，常需 PhD |
| **Data Scientist / DS** | 分析数据、做实验、出洞察、做业务模型 | "用数据回答业务问题" — 偏统计/分析 |
| **MLOps / ML Infra** | 训练/服务平台、CI/CD、特征平台 | "给 MLE 修路" — 偏 DevOps |
| **AI Engineer / LLM Engineer** | 用现成大模型搭应用（RAG、Agent、prompt） | "用 LLM API 造产品" — 偏应用，**FitCore 现状最接近这里** |

**关键认知**：
- 你现在的 FitCore 偏「**AI/LLM Engineer**」。要打动「**MLE**」岗位，需要补「**自己训练/评估模型 + MLOps**」（这正是 [开发计划](./02-后续开发计划.md) Track A/D/B 的目的）。
- 实习层面，MLE 和 AI Engineer 的界限其实模糊，**一个有扎实评估 + 至少一个自训模型 + MLOps 的 RAG 项目，足以同时投这两类岗位**。

---

## 2. 美国 MLE 实习的「能力坐标」

面试通常考 5 个维度，下面是**实习生（intern）档**的合理预期（不是资深档）：

| 维度 | 实习生需要达到 | FitCore 已覆盖? |
|------|----------------|----------------|
| ① **编程 / 数据结构算法** | 能过 LeetCode 中等题（重点：数组/哈希/双指针/树/图/DP 基础） | ⚠️ 项目不考这个，需单独刷题 |
| ② **ML 基础** | 理解过拟合/偏差方差、正则化、评估指标、常见模型 | 🟡 部分（评估指标很熟） |
| ③ **深度学习 / NLP / LLM** | 理解神经网络、transformer、embedding、RAG、微调 | ✅ RAG/embedding 很强；微调待补 |
| ④ **ML 系统设计** | 能设计一个推荐/搜索/RAG 系统的端到端方案 | ✅ FitCore 本身就是答案 |
| ⑤ **行为面 / 项目深挖** | 能用 STAR 讲清你做过的项目和决策 | ✅ FitCore 故事很足 |

> 好消息：FitCore 把 ③④⑤ 几乎包了。你的主要补强是 **①刷题** 和 **②ML 基础 + 一点训练经验（Track D）**。

---

## 3. 核心知识地图（边学边对应 FitCore）

下面按「从基础到前沿」分层。**每一层都标了「在 FitCore 哪里能看到 / 该动手改哪」**，这是最高效的学法。

### 第 0 层：数学基础（够用即可，别陷进去）

实习不会让你证明定理，但要**懂概念**：
- **线性代数**：向量、点积、余弦相似度、矩阵乘法。→ FitCore 的 embedding 检索就是「query 向量和文档向量算余弦相似度」（`supabase_store.py` 的 `<=>` 就是 cosine distance）。
- **概率统计**：分布、期望、条件概率、贝叶斯直觉。→ 理解评估指标、置信度（`parseFoodFromPhoto` 的 confidence）。
- **微积分**：梯度、链式法则（理解反向传播/梯度下降即可）。
- **资源**：3Blue1Brown《线性代数的本质》《微积分的本质》（YouTube，直观）；可汗学院概率统计。

### 第 1 层：经典机器学习（MLE 面试必问）

必懂概念清单（按重要性）：
1. **监督 vs 无监督 vs 强化学习**；**训练/验证/测试集划分**、**数据泄漏**。
2. **过拟合 / 欠拟合、偏差-方差权衡、正则化（L1/L2）、交叉验证**。← **面试高频**
3. **评估指标**：分类（accuracy/precision/recall/F1/AUC-ROC）、回归（MAE/MSE/R²）、**排序/检索（Recall@k、MRR、nDCG）**。
   - → **FitCore 直接用了排序指标！** 读 `rag/eval/retrieval_metrics.py`，你已经实现过 recall/precision/MRR/nDCG/AP。**这是你最大的优势：你不仅懂指标，还手写过。**
4. **常见模型**：线性/逻辑回归、决策树、**随机森林 / GBDT（XGBoost/LightGBM）**、KNN、K-means、SVM。
5. **特征工程**：归一化、独热编码、缺失值处理。
- **动手**：做 [开发计划 Track E1](./02-后续开发计划.md)（TDEE 校正回归模型）会用到 GBDT + MAE + 特征工程，正好练这一层。
- **资源**：吴恩达《Machine Learning Specialization》（Coursera，最经典入门）；《Hands-On Machine Learning with Scikit-Learn, Keras & TensorFlow》(Aurélien Géron，强烈推荐的实战书)；StatQuest（YouTube，把概念讲得极清楚）。

### 第 2 层：深度学习基础

必懂：
1. **神经网络、激活函数、损失函数、反向传播、梯度下降 / Adam、学习率、batch、epoch**。
2. **过拟合对策**：dropout、early stopping、数据增强。
3. **常见架构**：CNN（图像）、RNN/LSTM（序列，了解即可）、**Transformer（重中之重）**。
4. **框架**：**PyTorch**（MLE 事实标准，必学）。
- **动手**：[Track D](./02-后续开发计划.md)（微调模型）会用 PyTorch + HuggingFace。
- **资源**：吴恩达《Deep Learning Specialization》；《Dive into Deep Learning》(d2l.ai，免费，代码全)；Andrej Karpathy 的《Neural Networks: Zero to Hero》（YouTube，从零手写，神课）。

### 第 3 层：NLP 与 Transformer / LLM（FitCore 的主场）

必懂：
1. **文本表示**：tokenization、word embedding、**句向量 / 语义 embedding**。
   - → FitCore 用 `gemini-embedding-001` 把文本变向量；理解 **Matryoshka embedding**（一个向量截断到不同长度仍可用，FitCore 截到 768 维）。
2. **Transformer 架构**：self-attention、QKV、positional encoding、encoder/decoder。← **必须能讲清 attention**
3. **预训练 + 微调范式**；**指令微调（SFT）**、**RLHF/DPO**（了解）。
4. **LLM 推理参数**：temperature、top-p、max_tokens。
   - → FitCore 规划用 `temperature=0.2`、生成用 `0.7`（`agent.ts`），理解为什么。
5. **Prompt engineering**：few-shot、system prompt、结构化输出（JSON mode）。
   - → 全项目都在用；`quickLog.ts` 的 few-shot 热量表是好例子。
- **资源**：Jay Alammar《The Illustrated Transformer》（图解，必读）；HuggingFace NLP Course（免费，实战）；Karpathy《Let's build GPT》。

### 第 4 层：RAG 与 Agent（FitCore 已是范例，要能讲透）

必懂（**这一层你直接拿项目讲就行，但要能从原理讲起**）：
1. **RAG 是什么、为什么**：解决 LLM 知识过时/幻觉/无私有数据。
2. **检索**：稠密（向量）vs 稀疏（BM25）vs **hybrid 融合**；**RRF（Reciprocal Rank Fusion）**。
   - → FitCore 的 `EnsembleRetriever` 就是加权 RRF；你调过融合权重，能讲数据驱动决策。
3. **重排（reranking）**：CrossEncoder vs bi-encoder 的区别（精度 vs 速度）。
   - → FitCore 的 `CrossEncoderReranker`。
4. **chunking 策略**、**向量数据库**（Chroma/pgvector/FAISS）、**ANN 索引（HNSW）**。
   - → FitCore 用 Chroma + Supabase pgvector（HNSW 索引）。
5. **RAG 评估**：检索层（Recall@k/nDCG）+ 生成层（faithfulness/answer relevancy，**RAGAS**）。
   - → 检索层你已做；生成层是 [Track A](./02-后续开发计划.md) 要补的。
6. **Agent / 工具调用**：function calling、ReAct、多步规划。
   - → FitCore 的 2 步 tool-calling agent。
- **资源**：LangChain / LlamaIndex 文档的 concepts 部分；RAGAS 文档；各大公司工程博客的 RAG 文章。

### 第 5 层：MLOps（让你从"会训模型"到"会上线模型"）

必懂：
1. **实验追踪**（MLflow / W&B）、**数据/模型版本管理**。
2. **模型服务**：REST API、批/实时推理、**模型量化（int8/int4）**、`vllm`/`TGI`/ONNX。
3. **CI/CD for ML**：自动测试 + **评估门禁**（防止模型退化上线）。
   - → **FitCore 已经有评估门禁 CI！**（`rag-retrieval-eval.yml`）这是很多正式员工都没做好的事，是你的强项。
4. **监控**：延迟、吞吐、成本、**数据漂移 / 模型漂移**。
   - → [Track B](./02-后续开发计划.md) 要补的可观测性。
5. **容器化 / 部署**：Docker（FitCore 后端已用）、云平台。
- **资源**：《Designing Machine Learning Systems》(Chip Huyen，**MLE 必读神书**)；Made With ML（madewithml.com，免费 MLOps 实战）；Google《Machine Learning Engineering》(Andriy Burkov)。

---

## 4. 一套「项目驱动」的学习顺序建议

不要先把上面 6 层全读完再动手——**边做 [开发计划](./02-后续开发计划.md) 边补对应的层**，效率最高：

| 阶段 | 学什么（层） | 做什么（项目 Track） | 你会真正掌握 |
|------|------------|---------------------|-------------|
| 1 | 第 1 层（ML 基础）+ 第 4 层（RAG 评估）复习 | Track A（Agent/faithfulness 评估） | 评估指标、RAG 全链路评估 |
| 2 | 第 2 层（DL）+ 第 3 层（LLM 微调） | Track D1（蒸馏微调解析模型） | PyTorch、LoRA、SFT、蒸馏、模型服务 |
| 3 | 第 5 层（MLOps） | Track B（可观测性 + 优化） | 监控、降本提速、实验数据驱动 |
| 4 | 第 1 层（建模深化） | Track C/E（检索实验 / 推荐建模） | A/B 对照、GBDT、特征工程 |
| 并行 | ① 刷题 | — | 算法/数据结构 |

---

## 5. 面试准备（实习档）

### 5.1 编程 / 算法（绕不开）

- **平台**：LeetCode。**目标：能稳过中等题。**
- **重点题型**：数组/字符串/哈希表、双指针/滑动窗口、二分、栈/队列、链表、树/BST、图 BFS/DFS、回溯、基础 DP、堆/Top-K。
- **量**：刷 NeetCode 150 或 Grind 75 即可覆盖高频。
- **节奏**：每天 1–2 题，持续 2–3 个月比突击有效。

### 5.2 ML 概念面（breadth + depth）

高频问题（都能用 FitCore 举例）：
- "解释偏差-方差权衡 / 过拟合怎么办"
- "precision 和 recall 的区别？什么时候更看重哪个？"→ 用 FitCore abstention（弃答）举例。
- "什么是 embedding？怎么算相似度？"→ FitCore 检索。
- "讲讲 attention / transformer"
- "RAG 是什么？怎么评估一个 RAG 系统？"→ **这题你能讲爆**（检索层 + 生成层全链路）。
- "向量检索和关键词检索的区别？为什么要混合？"→ FitCore hybrid + 你的权重扫描发现。
- "怎么微调一个 LLM？LoRA 是什么？"→ Track D。

### 5.3 ML 系统设计（资深档常考，实习偶尔）

- 常见题："设计一个搜索/推荐/RAG/feed 排序系统"。
- **FitCore 本身就是一份现成答卷**：数据 → 检索（hybrid）→ 重排 → 生成 → 评估 → 监控 → CI 门禁。面试时把它当 case study 讲。
- 资源：《Machine Learning System Design Interview》(Ali Aminian)；《Designing Machine Learning Systems》(Chip Huyen)。

### 5.4 行为面 / 项目深挖（用 STAR）

- 准备 3–4 个 STAR 故事（Situation-Task-Action-Result），**每个都带数字**。
- 你的王牌故事：**「检索融合权重的数据驱动决策」**——
  - S：RAG 检索质量不稳定，不知道 hybrid 配比该怎么定。
  - T：要客观决定向量/BM25 的融合权重。
  - A：搭离线评估 harness（qrels + nDCG/MRR），做权重网格扫描，发现等权融合（0.82）反而劣于纯向量（0.99），同语言下 0.8 融合最优。
  - R：把生产权重定为 0.8，nDCG@10 达 0.92+，并上 CI 回归门禁防退化。
- 详细话术见 [`04-简历与面试.md`](./04-简历与面试.md)。

---

## 6. 给新手的 8 条避坑建议

1. **别陷在数学/理论里出不来**。够用就动手，缺啥补啥。
2. **别只会调 API**。一定要做 [Track D](./02-后续开发计划.md)，亲手训/微调一次模型——这是 MLE 的分水岭。
3. **任何结论都要带数字**。MLE 文化的核心是 metrics 驱动，FitCore 已经在贯彻，继续保持。
4. **诚实地讲 limitation**（如「KB 小导致 recall 饱和」）。面试官最烦「我的项目完美无缺」，最爱「我知道它哪里不够好、下一步怎么改」。
5. **刷题要趁早、要持续**。它和项目是两条独立赛道，缺一不可。
6. **读经典工程博客**（公司的 ML 博客），既学系统设计又积累面试谈资。
7. **GitHub 要干净**：好 README、清晰 commit、有 CI badge（FitCore 已经不错）。
8. **简历用动词 + 数字**："Built/Trained/Reduced/Improved … by X%"，别写"负责""参与"。

---

## 7. 资源速查表（都是公认优质、免费或经典）

| 类别 | 资源 |
|------|------|
| 数学直觉 | 3Blue1Brown（YouTube）、可汗学院 |
| ML 入门 | 吴恩达 ML Specialization（Coursera）、StatQuest（YouTube） |
| ML 实战书 | 《Hands-On ML with Scikit-Learn, Keras & TensorFlow》(Géron) |
| 深度学习 | 吴恩达 DL Specialization、d2l.ai、Karpathy《Zero to Hero》 |
| Transformer | Jay Alammar《Illustrated Transformer》、HuggingFace NLP Course |
| LLM/微调 | HuggingFace 文档、`peft`/`trl` 文档、Karpathy《Let's build GPT》 |
| RAG/评估 | LangChain/LlamaIndex concepts、RAGAS 文档 |
| MLOps | 《Designing ML Systems》(Chip Huyen)、Made With ML、《ML Engineering》(Burkov) |
| 系统设计 | 《ML System Design Interview》(Aminian) |
| 刷题 | LeetCode + NeetCode 150 / Grind 75 |

> 学完一层就回 [`02-后续开发计划.md`](./02-后续开发计划.md) 把对应 Track 做掉，再回 [`04-简历与面试.md`](./04-简历与面试.md) 更新简历。**学 → 做 → 写简历**，三件事咬合推进。
