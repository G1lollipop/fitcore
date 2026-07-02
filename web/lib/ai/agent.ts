/**
 * FitCore AI Agent — tool-calling architecture
 *
 * Step 1 — planning: plan-step.ts (single LLM call)
 * Step 2 — tool execution (parallel)
 * Step 3 — streaming generation (higher temperature)
 */

import { openai } from "@/lib/openaiClient"
import { AI_CHAT_MODEL } from "@/lib/ai/model"
import { createAgentPlan } from "@/lib/ai/plan-step"
import type { Citation, AgentMode, UserContextPayload, CoachChatMessage } from "@/lib/ai/types"
import { chatWithRagRetrieve } from "@/lib/ai/rag-client"
import { logFood } from "@/app/actions/logFood"
import { logWorkout } from "@/app/actions/logWorkout"
import { logWater } from "@/app/actions/dashboard"
import { previewWorkoutPlan } from "@/app/actions/generatePlan"
import type { PlanPreviewPayload } from "@/lib/plans/types"

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
  retrievalKReason?: string
  /** True if a log_* tool wrote to the DB — signals the client to refresh. */
  loggedActivity?: boolean
  /** Per-stage latency (ms), for the observability trace. */
  timings?: { planMs: number; toolsMs: number; generationMs: number }
  /** Coarse token accounting (≈ chars/4), for cost/latency dashboards. */
  usage?: {
    promptCharsApprox: number
    completionChars: number
    completionTokensApprox: number
  }
  /** Plan preview produced by the coach; the client opens it for confirmation. */
  planPreview?: PlanPreviewPayload
}

const LOG_TOOLS = new Set(["log_food", "log_workout", "log_water", "adjust_plan"])

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
  const retrievalKReason = parsed.retrievalKReason
  let loggedActivity = false
  let planPreview: PlanPreviewPayload | undefined
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

        if (toolName === "set_retrieval_params") {
          content = `Retrieval params set: k=${args.k}, reason: ${args.reason ?? "unspecified"}`

        } else if (toolName === "query_knowledge_base") {
          try {
            const result = await chatWithRagRetrieve({
              query: (args.query as string) || message,
              sessionId,
              userContext,
              topK: retrievalK,
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

        } else if (toolName === "log_food") {
          const description = String(args.description ?? "").trim()
          if (!description) {
            content = "No food description provided; cannot log."
          } else {
            const res = await logFood(description)
            if (res.success && res.data) {
              loggedActivity = true
              const d = res.data
              content = `Logged food: ${d.food_name} ≈ ${d.calories} kcal (protein ${d.protein}g / carbs ${d.carbs}g / fat ${d.fat}g).`
            } else {
              content = "Failed to log food; ask the user to try again or rephrase."
            }
          }

        } else if (toolName === "log_workout") {
          const description = String(args.description ?? "").trim()
          if (!description) {
            content = "No workout description provided; cannot log."
          } else {
            const res = await logWorkout(description)
            if (res.success && res.data) {
              loggedActivity = true
              const w = res.data
              const setsPart = w.sets ? `${w.sets} sets · ` : ""
              content = `Logged workout: ${w.workout_name} (${setsPart}${w.duration_minutes} min · ~${w.calories_burned} kcal burned).`
            } else {
              content = "Failed to log workout; ask the user to try again or rephrase."
            }
          }

        } else if (toolName === "log_water") {
          const amountMl = Math.round(Number(args.amount_ml) || 0)
          if (amountMl <= 0) {
            content = "Invalid water amount; cannot log."
          } else {
            const res = await logWater(amountMl)
            if (res.success) {
              loggedActivity = true
              content = `Logged water: +${amountMl} ml, today's total ${res.newAmount ?? amountMl} ml.`
            } else {
              content = "Failed to log water; ask the user to try again later."
            }
          }

        } else if (toolName === "adjust_plan") {
          const instruction = String(args.instruction ?? "").trim()
          if (!instruction) {
            content = "No plan request provided; cannot generate a preview."
          } else {
            const res = await previewWorkoutPlan({ instruction })
            if (res.success && 'data' in res && res.data) {
              const p = res.data as { name?: string; frequency_per_week?: number }
              const freq = p.frequency_per_week ? `, ${p.frequency_per_week} days/week` : ""
              content = `Generated a plan preview per "${instruction}": ${p.name ?? "new plan"}${freq}. Tell the user the preview is ready, ask them to review it in the sheet, and invite them to edit or request further changes before applying.`
              planPreview = res.data as PlanPreviewPayload
            } else {
              const err = (res as { error?: unknown }).error
              content =
                err === "PLAN_NOT_FOUND"
                  ? "The user has no active plan; suggest generating one before adjusting."
                  : "Failed to generate a plan preview; ask the user to try again or rephrase."
            }
          }

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
  const hasPersonal = toolsUsed.includes("get_user_stats") || toolsUsed.some((tn) => LOG_TOOLS.has(tn))
  const mode: AgentMode =
    hasKnowledge && hasPersonal ? "hybrid" : hasKnowledge ? "knowledge" : hasPersonal ? "personal" : "direct"

  return {
    answer: fullAnswer,
    citations,
    mode,
    toolsUsed,
    retrievalK,
    retrievalKReason,
    loggedActivity,
    planPreview,
    timings: { planMs, toolsMs, generationMs },
    usage: {
      promptCharsApprox,
      completionChars: fullAnswer.length,
      completionTokensApprox: Math.ceil(fullAnswer.length / 4),
    },
  }
}
