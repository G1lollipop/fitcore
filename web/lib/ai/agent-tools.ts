/**
 * Agent tool definitions and system prompts — shared by runAgent and offline eval.
 */

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

const SYSTEM_PROMPT = `You are FitCore's AI fitness coach — professional, friendly, and insightful. You answer questions about fitness, nutrition, training, and health.

You have these tools:
- set_retrieval_params: declare the knowledge-base retrieval strategy (the k value), used together with query_knowledge_base
- query_knowledge_base: query the fitness knowledge base (training technique, nutrition principles, plan templates, etc.)
- get_user_stats: fetch the user's personal data for today (intake, expenditure, targets, etc.)

Tool-calling rules:
• User asks about exercises / nutrition knowledge / fitness principles → call set_retrieval_params + query_knowledge_base together
• User asks "how much did I eat today" / "my data" / "is it enough" → call get_user_stats
• Simple small talk or greeting → answer directly, no tools

Answer requirements:
- Reply in the same language the user writes in (e.g. answer in Chinese when the user asks in Chinese, in English when they ask in English), with a professional and friendly tone, using emoji where appropriate
- Base answers strictly on the data returned by tools; never fabricate numbers
- If the knowledge base has no relevant content, say so honestly`

export function buildAgentSystemPrompt(): string {
  return SYSTEM_PROMPT
}

export function buildAgentPlanMessages(params: {
  message: string
  conversationHistory?: CoachChatMessage[]
}): Parameters<
  typeof import("@/lib/openaiClient").openai.chat.completions.create
>[0]["messages"] {
  const { message, conversationHistory = [] } = params
  return [
    { role: "system", content: buildAgentSystemPrompt() },
    ...conversationHistory.slice(-10),
    { role: "user", content: message },
  ]
}
