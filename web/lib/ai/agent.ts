import { openai } from "@/lib/openaiClient"
import { AI_CHAT_MODEL } from "@/lib/ai/model"
import { createAgentPlan } from "@/lib/ai/plan-step"
import type { Citation, AgentMode, UserContextPayload, CoachChatMessage } from "@/lib/ai/types"
import { chatWithRagRetrieve } from "@/lib/ai/rag-client"

export { AGENT_TOOLS, buildAgentSystemPrompt } from "@/lib/ai/agent-tools"
export { planAgentStep } from "@/lib/ai/plan-step"

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
  lines.push(`Water: ${today.water ?? 0} ml`)
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

export async function runAgent(params: {
  message: string
  sessionId: string
  userContext: UserContextPayload
  conversationHistory: CoachChatMessage[]
  onToken: (token: string) => void
}): Promise<AgentResult> {
  const { message, sessionId, userContext, conversationHistory, onToken } = params

  const planStart = Date.now()
  const { messages, planChoice, parsed } = await createAgentPlan({
    message,
    conversationHistory,
  })
  const planMs = Date.now() - planStart

  const toolsUsed: string[] = []
  let citations: Citation[] = []
  const retrievalK = parsed.retrievalK
  let toolsMs = 0

  if (planChoice.finish_reason === "tool_calls" && planChoice.message.tool_calls?.length) {
    messages.push(planChoice.message)

    const toolsStart = Date.now()
    const toolResults = await Promise.all(
      planChoice.message.tool_calls.map(async (toolCall) => {
        if (!("function" in toolCall)) {
          return { role: "tool" as const, tool_call_id: toolCall.id, content: "unsupported tool type" }
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
            citations = result.citations
            if (result.chunks.length === 0) {
              content = "No relevant content found in the knowledge base for this question."
            } else {
              const snippets = result.chunks
                .map((c, i) => `[${i + 1}] "${c.title}"\n${c.snippet}`)
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

        return {
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content,
        }
      })
    )

    messages.push(...toolResults)
    toolsMs = Date.now() - toolsStart
  }

  const promptCharsApprox = messages.reduce(
    (n, m) => n + (typeof m.content === "string" ? m.content.length : 0),
    0
  )

  const genStart = Date.now()
  const streamResponse = await openai.chat.completions.create({
    model: AI_CHAT_MODEL,
    messages,
    stream: true,
    temperature: 0.7,
    max_tokens: 900,
  })

  let fullAnswer = ""
  for await (const chunk of streamResponse) {
    const token = chunk.choices[0]?.delta?.content ?? ""
    if (token) {
      fullAnswer += token
      onToken(token)
    }
  }
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
