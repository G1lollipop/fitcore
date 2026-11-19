import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions"
import { streamChatCompletion } from "@/lib/ai/chat-completion"
import { AI_CHAT_MODELS, AI_USES_GOOGLE } from "@/lib/ai/model"
import { createAgentPlan } from "@/lib/ai/plan-step"
import type { Citation, AgentMode, UserContextPayload, CoachChatMessage } from "@/lib/ai/types"
import { chatWithRagRetrieve } from "@/lib/ai/rag-client"

function formatUserContext(ctx: UserContextPayload): string {
  const lines: string[] = ["[User profile]"]
  const { profile, targets, today, logs } = ctx

  if (profile.age) lines.push(`Age: ${profile.age}`)
  if (profile.gender) lines.push(`Gender: ${profile.gender === "male" ? "male" : "female"}`)
  if (profile.height) lines.push(`Height: ${profile.height} cm`)
  if (profile.weight) lines.push(`Weight: ${profile.weight} kg`)

  lines.push(`\n[Today's nutrition progress]`)
  lines.push(`Calories: ${today.calories ?? 0} / ${targets.calories ?? "not set"} kcal`)
  lines.push(`Protein: ${today.protein ?? 0} / ${targets.protein ?? "not set"} g`)
  lines.push(`Carbs: ${today.carbs ?? 0} / ${targets.carbs ?? "not set"} g`)
  lines.push(`Fat: ${today.fat ?? 0} / ${targets.fat ?? "not set"} g`)
  lines.push(`Calories burned: ${today.caloriesBurned ?? 0} kcal / Workout duration: ${today.workoutDuration ?? 0} min`)

  if (logs.dietLogs.length > 0) {
    lines.push(`\n[Today's food log (last 5)]`)
    logs.dietLogs.slice(-5).forEach((log) => {
      lines.push(`- ${log.food_name || "food"}: ${log.calories || 0} kcal`)
    })
  }

  if (logs.workoutLogs.length > 0) {
    lines.push(`\n[Today's workout log (last 5)]`)
    logs.workoutLogs.slice(-5).forEach((log) => {
      lines.push(`- ${log.workout_name || "workout"}: ${log.duration_minutes || 0} min`)
    })
  }

  return lines.join("\n")
}

export interface AgentResult {
  answer: string
  citations: Citation[]
  mode: AgentMode
  toolsUsed: string[]
  retrievalK?: number
  timings?: { planMs: number; toolsMs: number; generationMs: number }
  usage?: {
    promptCharsApprox: number
    completionChars: number
    completionTokensApprox: number
  }
}

/** Empty message lets the chat route use its localized generic stream error. */
class EmptyAgentResponseError extends Error {
  constructor() {
    super("")
    this.name = "EmptyAgentResponseError"
  }
}

/** Closes the answer prompt so the model writes text instead of asking for more tools. */
export const ANSWER_NOW_INSTRUCTION =
  "You now have every tool result you need. Write the final answer for the user as text. Do not call any tools."

/**
 * Extra tool rounds the answer step may run. After reading a knowledge-base
 * result Gemini often wants a second, narrower search and replies with only
 * that tool call (no text, finish_reason "stop"); `tool_choice: "none"` is
 * ignored by its OpenAI-compatible endpoint, and an instruction not to call
 * tools only sometimes works. So the request is honoured, once.
 */
const MAX_ANSWER_TOOL_ROUNDS = 1

/** An empty reply after this long is not retried: the user has waited enough. */
const EMPTY_REPLY_RETRY_WINDOW_MS = 45_000

/** Same passage of the same source: by id when the store gives one. */
function sameCitation(a: Citation, b: Citation): boolean {
  if (a.id && b.id) return a.id === b.id
  return a.source === b.source && a.snippet === b.snippet
}

/**
 * The 1-based number of `citation` in the list shown to the user, adding it at
 * the end when it is not there yet. A passage found again by a later search
 * keeps the number it was first given.
 */
export function citationNumber(citations: Citation[], citation: Citation): number {
  const at = citations.findIndex((seen) => sameCitation(seen, citation))
  if (at >= 0) return at + 1
  citations.push(citation)
  return citations.length
}

type ToolCall = ChatCompletionMessageToolCall
type ToolCallDelta = ChatCompletionChunk.Choice.Delta.ToolCall

/**
 * Builds whole tool calls from streamed pieces. Name and arguments may come in
 * fragments keyed by `index`; any other fields the provider adds (Gemini's
 * thought signature in `extra_content`) are kept, since it must be sent back
 * with the call.
 */
export function addToolCallDelta(calls: ToolCall[], delta: ToolCallDelta, fallbackId: string): void {
  const { index, function: fn, ...rest } = delta
  const at = typeof index === "number" ? index : calls.length
  const call = (calls[at] ??= {
    id: "",
    type: "function",
    function: { name: "", arguments: "" },
  } as ToolCall)
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined && value !== null && value !== "") (call as unknown as Record<string, unknown>)[key] = value
  }
  if (!call.id) call.id = `${fallbackId}-${at}`
  if ("function" in call) {
    if (fn?.name && !call.function.name) call.function.name = fn.name
    if (fn?.arguments) call.function.arguments += fn.arguments
  }
}

/**
 * The models after the one that gave an empty reply. The response's `model`
 * may carry a prefix (`models/…`) or a version suffix, so match loosely; an
 * unknown answerer counts as the first model.
 */
export function modelsAfter(models: readonly string[], answeredBy: string | undefined): readonly string[] {
  const index = answeredBy
    ? models.findIndex((m) => answeredBy === m || answeredBy.endsWith(`/${m}`) || answeredBy.startsWith(`${m}-`))
    : -1
  return models.slice(Math.max(index, 0) + 1)
}

export async function runAgent(params: {
  message: string
  sessionId: string
  userContext: UserContextPayload
  conversationHistory: CoachChatMessage[]
  onToken: (token: string) => void
  /** Aborted when the user goes away; stops the model calls without trying another model. */
  signal?: AbortSignal
}): Promise<AgentResult> {
  const { message, sessionId, userContext, conversationHistory, onToken, signal } = params

  const planStart = Date.now()
  const { messages, planChoice, parsed } = await createAgentPlan({
    message,
    conversationHistory,
    signal,
  })
  const planMs = Date.now() - planStart

  const toolsUsed: string[] = []
  const citations: Citation[] = []
  const retrievalK = parsed.retrievalK
  let toolsMs = 0

  /** Runs one round of tool calls and returns their results, in order. */
  const runTools = async (toolCalls: ToolCall[]): Promise<ChatCompletionToolMessageParam[]> => {
    const toolsStart = Date.now()
    const results = await Promise.all(
      toolCalls.map(async (toolCall): Promise<ChatCompletionToolMessageParam> => {
        if (!("function" in toolCall)) {
          return { role: "tool", tool_call_id: toolCall.id, content: "unsupported tool type" }
        }
        const toolName = toolCall.function.name
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(toolCall.function.arguments || "{}")
        } catch {
          // ignore
        }

        toolsUsed.push(toolName)
        let content = ""

        if (toolName === "query_knowledge_base") {
          try {
            const k = typeof args.k === "number" ? args.k : retrievalK
            const result = await chatWithRagRetrieve({
              query: (args.query as string) || message,
              sessionId,
              userContext,
              topK: k,
            })
            // Each snippet is labelled with its source's number in the
            // citation list the user sees, so "[n]" in the answer points at
            // item n.
            const numbers = result.citations.map((c) => citationNumber(citations, c))
            if (result.chunks.length === 0) {
              content = "No relevant content found in the knowledge base for this question."
            } else {
              const snippets = result.chunks
                .map((c, i) => `[${numbers[i]}] "${c.title}"\n${c.snippet}`)
                .join("\n\n")
              content = `Relevant content from the knowledge base for "${args.query}" (${result.chunks.length} item(s)):\n\n${snippets}`
            }
          } catch (err) {
            content = "The knowledge base is temporarily unavailable; answer based on general fitness knowledge."
            console.error("[Agent] query_knowledge_base failed:", err)
          }

        } else if (toolName === "get_user_stats") {
          content = formatUserContext(userContext)

        } else {
          content = `Unknown tool: ${toolName}`
        }

        return { role: "tool", tool_call_id: toolCall.id, content }
      })
    )
    toolsMs += Date.now() - toolsStart
    return results
  }

  if (planChoice.finish_reason === "tool_calls" && planChoice.message.tool_calls?.length) {
    messages.push(planChoice.message)
    messages.push(...(await runTools(planChoice.message.tool_calls)))
  }

  // Asks for a text answer; the answer step can still run one more round of
  // tools if the model insists (see MAX_ANSWER_TOOL_ROUNDS).
  const answerNow: ChatCompletionMessageParam = { role: "system", content: ANSWER_NOW_INSTRUCTION }

  const genStart = Date.now()
  let fullAnswer = ""
  let hasVisibleContent = false
  let toolRounds = 0
  // Moves to the next model only if the current one fails over (quota,
  // unavailable, too slow) or ends its reply with no text, before it has shown
  // any text; after that the reply is never switched.
  let models: readonly string[] = AI_CHAT_MODELS
  while (models.length > 0) {
    const prompt = [...messages, answerNow]
    const generationParams = AI_USES_GOOGLE
      ? { messages: prompt, max_tokens: 4096, reasoning_effort: "low" as const }
      : { messages: prompt, temperature: 0.7, max_tokens: 900 }
    let answeredBy: string | undefined
    const toolCalls: ToolCall[] = []
    fullAnswer = ""
    for await (const chunk of streamChatCompletion(models, generationParams, { signal })) {
      answeredBy ??= chunk.model
      const delta = chunk.choices[0]?.delta
      for (const call of delta?.tool_calls ?? []) addToolCallDelta(toolCalls, call, `answer-${toolRounds}`)
      const token = delta?.content ?? ""
      if (token) {
        fullAnswer += token
        if (!hasVisibleContent) {
          if (!/\S/.test(token)) continue
          hasVisibleContent = true
          onToken(fullAnswer)
        } else {
          onToken(token)
        }
      }
    }
    if (hasVisibleContent) break

    // No text, only tool calls: run them and ask the same model order again.
    const usable = toolCalls.filter((c) => "function" in c && c.function.name)
    if (usable.length > 0 && toolRounds < MAX_ANSWER_TOOL_ROUNDS) {
      toolRounds++
      messages.push({ role: "assistant", content: null, tool_calls: usable })
      messages.push(...(await runTools(usable)))
      continue
    }

    if (Date.now() - genStart > EMPTY_REPLY_RETRY_WINDOW_MS) break
    models = modelsAfter(models, answeredBy)
    if (models.length > 0) {
      console.warn(`[ai] ${answeredBy ?? models[0]} returned no text; trying ${models[0]}`)
    }
  }
  if (!hasVisibleContent) throw new EmptyAgentResponseError()

  const promptCharsApprox = messages.reduce(
    (n, m) => n + (typeof m.content === "string" ? m.content.length : 0),
    0
  )
  const generationMs = Date.now() - genStart

  const hasKnowledge = toolsUsed.includes("query_knowledge_base")
  const hasPersonal = toolsUsed.includes("get_user_stats")
  const mode: AgentMode =
    hasKnowledge && hasPersonal ? "hybrid" : hasKnowledge ? "knowledge" : hasPersonal ? "personal" : "direct"

  return {
    answer: fullAnswer,
    citations,
    mode,
    toolsUsed,
    retrievalK,
    timings: { planMs, toolsMs, generationMs },
    usage: {
      promptCharsApprox,
      completionChars: fullAnswer.length,
      completionTokensApprox: Math.ceil(fullAnswer.length / 4),
    },
  }
}
