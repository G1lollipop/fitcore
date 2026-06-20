/**
 * Agent Step 1 — planning-only LLM call (tool selection, no execution).
 * Used by runAgent and the offline agent eval harness.
 */

import { openai } from "@/lib/openaiClient"
import { AI_CHAT_MODEL } from "@/lib/ai/model"
import {
  AGENT_TOOLS,
  buildAgentPlanMessages,
} from "@/lib/ai/agent-tools"
import type { CoachChatMessage } from "@/lib/ai/types"
import type { Language } from "@/lib/i18n"

export interface ParsedToolCall {
  id: string
  name: string
  arguments: string
}

export interface AgentPlanResult {
  tools: string[]
  retrievalK?: number
  retrievalKReason?: string
  finishReason: string
  toolCalls: ParsedToolCall[]
}

function parsePlanChoice(planChoice: {
  finish_reason: string | null
  message: {
    tool_calls?: Array<
      | { type: "function"; id: string; function: { name: string; arguments: string } }
      | { type: string; id: string }
    >
  }
}): AgentPlanResult {
  const finishReason = planChoice.finish_reason ?? "unknown"
  const tools: string[] = []
  const toolCalls: ParsedToolCall[] = []
  let retrievalK: number | undefined
  let retrievalKReason: string | undefined

  if (finishReason === "tool_calls" && planChoice.message.tool_calls?.length) {
    for (const toolCall of planChoice.message.tool_calls) {
      if (!("function" in toolCall)) continue
      const name = toolCall.function.name
      tools.push(name)
      toolCalls.push({
        id: toolCall.id,
        name,
        arguments: toolCall.function.arguments || "{}",
      })

      if (name === "set_retrieval_params") {
        try {
          const args = JSON.parse(toolCall.function.arguments || "{}")
          if (typeof args.k === "number") retrievalK = args.k
          if (typeof args.reason === "string") retrievalKReason = args.reason
        } catch {
          // ignore malformed args
        }
      }
    }
  }

  return { tools, retrievalK, retrievalKReason, finishReason, toolCalls }
}

export async function planAgentStep(params: {
  message: string
  language?: Language
  conversationHistory?: CoachChatMessage[]
  model?: string
}): Promise<AgentPlanResult> {
  const language: Language = params.language === "en" ? "en" : "zh"
  const messages = buildAgentPlanMessages({
    message: params.message,
    language,
    conversationHistory: params.conversationHistory,
  })

  const planResponse = await openai.chat.completions.create({
    model: params.model ?? AI_CHAT_MODEL,
    messages,
    tools: AGENT_TOOLS,
    tool_choice: "auto",
    temperature: 0.2,
    max_tokens: 300,
  })

  return parsePlanChoice(planResponse.choices[0])
}

/** Full planner response — used by runAgent to avoid a second LLM call. */
export async function createAgentPlan(params: {
  message: string
  language?: Language
  conversationHistory?: CoachChatMessage[]
  model?: string
}) {
  const language: Language = params.language === "en" ? "en" : "zh"
  const messages = buildAgentPlanMessages({
    message: params.message,
    language,
    conversationHistory: params.conversationHistory,
  })

  const planResponse = await openai.chat.completions.create({
    model: params.model ?? AI_CHAT_MODEL,
    messages,
    tools: AGENT_TOOLS,
    tool_choice: "auto",
    temperature: 0.2,
    max_tokens: 300,
  })

  const planChoice = planResponse.choices[0]
  return {
    messages,
    planChoice,
    parsed: parsePlanChoice(planChoice),
  }
}
