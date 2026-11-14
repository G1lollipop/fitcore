/**
 * Agent Step 1 — planning-only LLM call (tool selection, no execution).
 * Used by runAgent and the offline agent eval harness.
 */

import { createChatCompletion } from "@/lib/ai/chat-completion"
import { AI_CHAT_MODELS } from "@/lib/ai/model"

/** An explicitly requested model is used on its own (evals compare models). */
const modelsFor = (model?: string) => (model ? [model] : AI_CHAT_MODELS)
import {
  AGENT_TOOLS,
  buildAgentPlanMessages,
} from "@/lib/ai/agent-tools"
import type { CoachChatMessage } from "@/lib/ai/types"

export interface ParsedToolCall {
  id: string
  name: string
  arguments: string
}

export interface AgentPlanResult {
  tools: string[]
  retrievalK?: number
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

      if (name === "query_knowledge_base") {
        try {
          const args = JSON.parse(toolCall.function.arguments || "{}")
          if (typeof args.k === "number") retrievalK = args.k
        } catch {
          // ignore malformed args
        }
      }
    }
  }

  return { tools, retrievalK, finishReason, toolCalls }
}

export async function planAgentStep(params: {
  message: string
  conversationHistory?: CoachChatMessage[]
  model?: string
  signal?: AbortSignal
}): Promise<AgentPlanResult> {
  const messages = buildAgentPlanMessages({
    message: params.message,
    conversationHistory: params.conversationHistory,
  })

  const planResponse = await createChatCompletion(modelsFor(params.model), {
    messages,
    tools: AGENT_TOOLS,
    tool_choice: "auto",
    temperature: 0.2,
    max_tokens: 300,
  }, { signal: params.signal })

  return parsePlanChoice(planResponse.choices[0])
}

/** Full planner response — used by runAgent to avoid a second LLM call. */
export async function createAgentPlan(params: {
  message: string
  conversationHistory?: CoachChatMessage[]
  model?: string
  /** Cancels the call (the user closed the chat); no other model is tried. */
  signal?: AbortSignal
}) {
  const messages = buildAgentPlanMessages({
    message: params.message,
    conversationHistory: params.conversationHistory,
  })

  const planResponse = await createChatCompletion(modelsFor(params.model), {
    messages,
    tools: AGENT_TOOLS,
    tool_choice: "auto",
    temperature: 0.2,
    max_tokens: 300,
  }, { signal: params.signal })

  const planChoice = planResponse.choices[0]
  return {
    messages,
    planChoice,
    parsed: parsePlanChoice(planChoice),
  }
}
