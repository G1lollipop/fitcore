import type { ChatMode } from "@/lib/ai/types"

function normalize(text: string): string {
  return text.trim().toLowerCase()
}

/**
 * 加权短语：不单独匹配单字「我」，避免「我想了解深蹲」整句被判成纯 personal。
 * 短语越长越具体，权重越高。
 */
const PERSONAL_WEIGHTED: readonly { phrase: string; w: number }[] = [
  // 强：明确绑定「我的数据 / 记录 / 目标」
  { phrase: "根据我的", w: 4 },
  { phrase: "结合我的", w: 4 },
  { phrase: "以我现在的", w: 4 },
  { phrase: "我的记录", w: 4 },
  { phrase: "我的数据", w: 4 },
  { phrase: "我的今日", w: 4 },
  { phrase: "我今天吃了", w: 4 },
  { phrase: "我今天练了", w: 4 },
  { phrase: "我今天摄入", w: 4 },
  { phrase: "我今天喝", w: 3 },
  { phrase: "我这周训练", w: 4 },
  { phrase: "我这周吃", w: 4 },
  { phrase: "我还差", w: 3 },
  { phrase: "有没有吃够", w: 3 },
  { phrase: "蛋白质够不够", w: 4 },
  { phrase: "碳水够不够", w: 3 },
  { phrase: "热量够不够", w: 3 },
  { phrase: "饮水够不够", w: 3 },
  { phrase: "达标了吗", w: 3 },
  { phrase: "适合我吗", w: 3 },
  { phrase: "我的体重", w: 3 },
  { phrase: "我的体脂", w: 3 },
  { phrase: "我最近体重", w: 3 },
  { phrase: "训练记录里", w: 3 },
  { phrase: "饮食记录里", w: 3 },
  // 中：时间锚点 + 自我，但可能掺知识问法
  { phrase: "我今天", w: 2 },
  { phrase: "今晚", w: 2 },
  { phrase: "昨晚", w: 2 },
  { phrase: "刚才", w: 2 },
  { phrase: "本周", w: 2 },
  { phrase: "这周", w: 2 },
  { phrase: "最近", w: 2 },
  { phrase: "我的", w: 2 },
  { phrase: "帮我看看", w: 2 },
  { phrase: "摄入", w: 2 },
  { phrase: "饮水", w: 2 },
  { phrase: "喝水", w: 2 },
  { phrase: "训练记录", w: 2 },
  { phrase: "饮食记录", w: 2 },
  // 弱
  { phrase: "记录", w: 1 },
  { phrase: "够不够", w: 2 },
]

const PERSONAL_WEIGHTED_EN: readonly { phrase: string; w: number }[] = [
  { phrase: "my intake", w: 3 },
  { phrase: "my macros", w: 3 },
  { phrase: "my log", w: 3 },
  { phrase: "my weight", w: 3 },
  { phrase: "my workout", w: 3 },
  { phrase: "today i", w: 2 },
  { phrase: "this week i", w: 2 },
  { phrase: "based on my", w: 4 },
]

const KNOWLEDGE_WEIGHTED: readonly { phrase: string; w: number }[] = [
  { phrase: "常见错误", w: 3 },
  { phrase: "动作要领", w: 3 },
  { phrase: "计划模板", w: 3 },
  { phrase: "建议范围", w: 3 },
  { phrase: "渐进超负荷", w: 3 },
  // 「是什么」同时覆盖「什么是 X」与「X 是什么」，避免与「什么是」重复计分
  { phrase: "是什么", w: 3 },
  { phrase: "有什么区别", w: 3 },
  { phrase: "原理", w: 2 },
  { phrase: "机制", w: 2 },
  { phrase: "为什么", w: 2 },
  { phrase: "区别", w: 2 },
  { phrase: "对比", w: 2 },
  { phrase: "标准", w: 2 },
  { phrase: "一般", w: 1 },
  { phrase: "通常", w: 1 },
  { phrase: "深蹲", w: 2 },
  { phrase: "硬拉", w: 2 },
  { phrase: "卧推", w: 2 },
  { phrase: "受伤", w: 2 },
  { phrase: "疼痛", w: 2 },
  { phrase: "拉伸", w: 2 },
  { phrase: "热身", w: 2 },
  { phrase: "有氧", w: 2 },
  { phrase: "分化", w: 2 },
  { phrase: "营养素", w: 2 },
  { phrase: "宏量", w: 2 },
  { phrase: "蛋白质摄入", w: 2 },
  { phrase: "碳水", w: 1 },
  { phrase: "脂肪", w: 1 },
  { phrase: "补剂", w: 2 },
  { phrase: "肌酸", w: 2 },
  { phrase: "咖啡因", w: 2 },
  { phrase: "怎么练", w: 2 },
  { phrase: "怎么做", w: 2 },
]

const KNOWLEDGE_WEIGHTED_EN: readonly { phrase: string; w: number }[] = [
  { phrase: "what is", w: 3 },
  { phrase: "why does", w: 2 },
  { phrase: "how does", w: 2 },
  { phrase: "difference between", w: 3 },
  { phrase: "form check", w: 3 },
]

const CLEAR_SIGNAL = 3
const WEAK_SIGNAL = 2

function sumWeightedMatches(
  message: string,
  text: string,
  zh: readonly { phrase: string; w: number }[],
  en: readonly { phrase: string; w: number }[]
): number {
  let s = 0
  for (const { phrase, w } of zh) {
    if (message.includes(phrase)) s += w
  }
  const lower = text
  for (const { phrase, w } of en) {
    if (lower.includes(phrase)) s += w
  }
  return Math.min(s, 12)
}

export interface ClassifiedIntent {
  mode: ChatMode
  /** 规则名，便于 UI tooltip / 日志 */
  reason: string
  /** 内部调试用：两路得分 */
  scores?: { personal: number; knowledge: number }
}

export function classifyChatIntent(message: string): ClassifiedIntent {
  const raw = message.trim()
  const text = normalize(raw)
  if (!text) return { mode: "rag", reason: "empty" }

  const personalScore = sumWeightedMatches(raw, text, PERSONAL_WEIGHTED, PERSONAL_WEIGHTED_EN)
  const knowledgeScore = sumWeightedMatches(raw, text, KNOWLEDGE_WEIGHTED, KNOWLEDGE_WEIGHTED_EN)

  const strongPersonal = personalScore >= CLEAR_SIGNAL
  const strongKnowledge = knowledgeScore >= CLEAR_SIGNAL
  const weakPersonal = personalScore >= WEAK_SIGNAL && personalScore < CLEAR_SIGNAL
  const weakKnowledge = knowledgeScore >= WEAK_SIGNAL && knowledgeScore < CLEAR_SIGNAL

  if (strongPersonal && strongKnowledge) {
    return {
      mode: "hybrid",
      reason: "personal+knowledge-strong",
      scores: { personal: personalScore, knowledge: knowledgeScore },
    }
  }

  if (strongPersonal && !strongKnowledge) {
    return {
      mode: "personal",
      reason: "personal-strong",
      scores: { personal: personalScore, knowledge: knowledgeScore },
    }
  }

  if (strongKnowledge && !strongPersonal) {
    return {
      mode: "rag",
      reason: "knowledge-strong",
      scores: { personal: personalScore, knowledge: knowledgeScore },
    }
  }

  if (weakPersonal && knowledgeScore < WEAK_SIGNAL) {
    return {
      mode: "personal",
      reason: "personal-weak",
      scores: { personal: personalScore, knowledge: knowledgeScore },
    }
  }
  if (weakKnowledge && personalScore < WEAK_SIGNAL) {
    return {
      mode: "rag",
      reason: "knowledge-weak",
      scores: { personal: personalScore, knowledge: knowledgeScore },
    }
  }

  if (personalScore > 0 && knowledgeScore > 0) {
    return {
      mode: "hybrid",
      reason: "personal+knowledge-weak",
      scores: { personal: personalScore, knowledge: knowledgeScore },
    }
  }

  // 低置信度兜底：无明显关键词时走 hybrid（RAG + 个人上下文合并）
  if (personalScore === 0 && knowledgeScore === 0) {
    return {
      mode: "hybrid",
      reason: "low-confidence-fallback",
      scores: { personal: personalScore, knowledge: knowledgeScore },
    }
  }

  if (personalScore > knowledgeScore) {
    return {
      mode: "personal",
      reason: "personal-score-higher",
      scores: { personal: personalScore, knowledge: knowledgeScore },
    }
  }
  if (knowledgeScore > personalScore) {
    return {
      mode: "rag",
      reason: "knowledge-score-higher",
      scores: { personal: personalScore, knowledge: knowledgeScore },
    }
  }

  return {
    mode: "hybrid",
    reason: "low-confidence-fallback",
    scores: { personal: personalScore, knowledge: knowledgeScore },
  }
}
