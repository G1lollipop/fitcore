/**
 * Agent tool definitions and system prompts — shared by runAgent and offline eval.
 */

import type { Language } from "@/lib/i18n"
import type { CoachChatMessage } from "@/lib/ai/types"

export const AGENT_TOOLS: Parameters<
  typeof import("@/lib/openaiClient").openai.chat.completions.create
>[0]["tools"] = [
  {
    type: "function",
    function: {
      name: "set_retrieval_params",
      description:
        "Declare knowledge-base retrieval strategy. When calling query_knowledge_base, " +
        "you must also call this tool to specify how many documents (k) to retrieve. " +
        "Choose k by question complexity: 3 for simple facts, 5 for general questions, " +
        "8 for multi-concept comparisons or plans.",
      parameters: {
        type: "object",
        properties: {
          k: {
            type: "integer",
            enum: [3, 5, 8],
            description:
              "Number of documents to retrieve. " +
              "3=simple fact; 5=general (default); 8=complex multi-concept.",
          },
          reason: {
            type: "string",
            description: "Brief reason for choosing this k (debug / eval tracing)",
          },
        },
        required: ["k", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_knowledge_base",
      description:
        "Query the fitness knowledge base for training technique, nutrition science, " +
        "and plan templates. Must be paired with set_retrieval_params.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query — be specific",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_stats",
      description:
        "Fetch the user's personal data for today (intake, expenditure, targets, logs). " +
        "Use when the answer must reference the user's actual numbers.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
]

const SYSTEM_PROMPT_ZH = `你是 FitCore 的 AI 健身教练，专业、友善、富有洞察力。

你有三个工具：
- set_retrieval_params：声明知识库检索策略（k 值），与 query_knowledge_base 配套使用
- query_knowledge_base：查询健身知识库（训练技术、营养原理、计划模板等）
- get_user_stats：获取用户今日的个人数据（摄入、消耗、目标等）

调用规则：
• 用户问训练动作/营养知识/健身原理 → 同时调用 set_retrieval_params + query_knowledge_base
• 用户问"我今天吃了多少"/"我的数据"/"够不够" → 调用 get_user_stats
• 需要结合知识和数据给建议 → 同时调用三个工具
• 简单闲聊或问候 → 直接回答，不调用工具

回答要求：
- 使用中文，语气专业友善，适当使用 emoji
- 严格基于工具返回的数据，不编造数字
- 如知识库没有相关内容，如实告知`

const SYSTEM_PROMPT_EN = `You are FitCore's AI fitness coach — professional, friendly, and insightful.

You have three tools:
- set_retrieval_params: declare the knowledge-base retrieval strategy (the k value), used together with query_knowledge_base
- query_knowledge_base: query the fitness knowledge base (training technique, nutrition principles, plan templates, etc.)
- get_user_stats: fetch the user's personal data for today (intake, expenditure, targets, etc.)

Tool-calling rules:
• User asks about exercises / nutrition knowledge / fitness principles → call set_retrieval_params + query_knowledge_base together
• User asks "how much did I eat today" / "my data" / "is it enough" → call get_user_stats
• Needs both knowledge and data to advise → call all three tools
• Simple small talk or greeting → answer directly, no tools

Answer requirements:
- Reply in English, with a professional and friendly tone, using emoji where appropriate
- Base answers strictly on the data returned by tools; never fabricate numbers
- If the knowledge base has no relevant content, say so honestly`

export function buildAgentSystemPrompt(language: Language): string {
  return language === "en" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ZH
}

export function buildAgentPlanMessages(params: {
  message: string
  language: Language
  conversationHistory?: CoachChatMessage[]
}): Parameters<
  typeof import("@/lib/openaiClient").openai.chat.completions.create
>[0]["messages"] {
  const { message, language, conversationHistory = [] } = params
  return [
    { role: "system", content: buildAgentSystemPrompt(language) },
    ...conversationHistory.slice(-10),
    { role: "user", content: message },
  ]
}
