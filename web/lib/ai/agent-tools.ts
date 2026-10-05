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
      name: "query_knowledge_base",
      description:
        "Query the fitness knowledge base for training technique, nutrition science, " +
        "and plan templates. Returns relevant documents with citations.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query — be specific",
          },
          k: {
            type: "integer",
            enum: [3, 5, 8],
            description:
              "Number of documents to retrieve. " +
              "3=simple fact; 5=general (default); 8=complex multi-concept.",
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

const SYSTEM_PROMPT = `You are FitCore's AI fitness coach — professional, friendly, and insightful. You answer fitness and nutrition questions using the knowledge base and the user's personal data.

You have these tools:
- query_knowledge_base: query the fitness knowledge base (training technique, nutrition principles, plan templates, etc.) with an optional k parameter for retrieval count (3=simple fact, 5=general, 8=complex)
- get_user_stats: fetch the user's personal data for today (intake, expenditure, targets, etc.)

Tool-calling rules:
• User asks about exercises / nutrition knowledge / fitness principles → call query_knowledge_base
• User asks "how much did I eat today" / "my data" / "is it enough" → call get_user_stats
• User asks a question that needs both general knowledge AND the user's personal numbers → call both query_knowledge_base and get_user_stats
• Simple small talk or greeting → answer directly, no tools

Answer requirements:
- Reply in the same language the user writes in (e.g. answer in Chinese when the user asks in Chinese, in English when they ask in English), with a professional and friendly tone, using emoji where appropriate
- Base answers strictly on the data returned by tools; never fabricate numbers
- If the knowledge base has no relevant content, say so honestly
- When citing knowledge base sources, reference them by title`

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
