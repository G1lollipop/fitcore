/**
 * FitCore AI Agent — Tool Calling 架构
 *
 * Step 1 — 规划：plan-step.ts（单次 LLM 调用）
 * Step 2 — 工具执行（并行）
 * Step 3 — 流式生成（高温度）
 */

import { openai } from "@/lib/openaiClient"
import { AI_CHAT_MODEL } from "@/lib/ai/model"
import { createAgentPlan } from "@/lib/ai/plan-step"
import type { Citation, AgentMode, UserContextPayload, CoachChatMessage } from "@/lib/ai/types"
import { chatWithRagRetrieve } from "@/lib/ai/rag-client"
import { logFood } from "@/app/actions/logFood"
import { logWorkout } from "@/app/actions/logWorkout"
import { logWater } from "@/app/actions/dashboard"
import { adjustWorkoutPlan } from "@/app/actions/generatePlan"
import type { Language } from "@/lib/i18n"

export { AGENT_TOOLS, buildAgentSystemPrompt } from "@/lib/ai/agent-tools"
export { planAgentStep } from "@/lib/ai/plan-step"

function formatUserContext(ctx: UserContextPayload): string {
  const lines: string[] = ["【用户个人数据】"]
  const { profile, targets, today, logs } = ctx

  if (profile.age) lines.push(`年龄: ${profile.age}岁`)
  if (profile.gender) lines.push(`性别: ${profile.gender === "male" ? "男" : "女"}`)
  if (profile.height) lines.push(`身高: ${profile.height}cm`)
  if (profile.weight) lines.push(`体重: ${profile.weight}kg`)

  lines.push(`\n【今日营养进度】`)
  lines.push(`热量: ${today.calories ?? 0} / ${targets.calories ?? "未设置"} kcal`)
  lines.push(`蛋白质: ${today.protein ?? 0} / ${targets.protein ?? "未设置"} g`)
  lines.push(`碳水: ${today.carbs ?? 0} / ${targets.carbs ?? "未设置"} g`)
  lines.push(`脂肪: ${today.fat ?? 0} / ${targets.fat ?? "未设置"} g`)
  lines.push(`饮水: ${today.water ?? 0} ml`)
  lines.push(`运动消耗: ${today.caloriesBurned ?? 0} kcal / 运动时长: ${today.workoutDuration ?? 0} 分钟`)

  if (logs.dietLogs.length > 0) {
    lines.push(`\n【今日饮食记录（最近5条）】`)
    logs.dietLogs.slice(-5).forEach((log) => {
      lines.push(`- ${log.food_name || "食物"}: ${log.calories || 0}kcal`)
    })
  }

  if (logs.workoutLogs.length > 0) {
    lines.push(`\n【今日运动记录（最近5条）】`)
    logs.workoutLogs.slice(-5).forEach((log) => {
      lines.push(`- ${log.workout_name || "运动"}: ${log.duration_minutes || 0}分钟`)
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
}

const LOG_TOOLS = new Set(["log_food", "log_workout", "log_water", "adjust_plan"])

export async function runAgent(params: {
  message: string
  sessionId: string
  userContext: UserContextPayload
  conversationHistory: CoachChatMessage[]
  language?: Language
  onToken: (token: string) => void
}): Promise<AgentResult> {
  const { message, sessionId, userContext, conversationHistory, onToken } = params
  const language: Language = params.language === "en" ? "en" : "zh"

  const { messages, planChoice, parsed } = await createAgentPlan({
    message,
    language,
    conversationHistory,
  })

  const toolsUsed: string[] = []
  let citations: Citation[] = []
  const retrievalK = parsed.retrievalK
  const retrievalKReason = parsed.retrievalKReason
  let loggedActivity = false

  if (planChoice.finish_reason === "tool_calls" && planChoice.message.tool_calls?.length) {
    messages.push(planChoice.message)

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
          content = `检索参数已设定：k=${args.k}，理由：${args.reason ?? "未说明"}`

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
              content = "知识库中未找到与此问题相关的内容。"
            } else {
              const snippets = result.chunks
                .map((c, i) => `[${i + 1}] 《${c.title}》\n${c.snippet}`)
                .join("\n\n")
              content = `以下是知识库中关于"${args.query}"的相关内容（共 ${result.chunks.length} 条）：\n\n${snippets}`
            }
          } catch (err) {
            content = "知识库暂时无法访问，请基于通用健身知识回答。"
            console.error("[Agent] query_knowledge_base failed:", err)
          }

        } else if (toolName === "get_user_stats") {
          content = formatUserContext(userContext)

        } else if (toolName === "log_food") {
          const description = String(args.description ?? "").trim()
          if (!description) {
            content = "未提供食物描述，无法记录。"
          } else {
            const res = await logFood(description)
            if (res.success && res.data) {
              loggedActivity = true
              const d = res.data
              content = `已记录饮食：${d.food_name} ≈ ${d.calories}kcal（蛋白${d.protein}g/碳水${d.carbs}g/脂肪${d.fat}g）。`
            } else {
              content = "记录饮食失败，请让用户稍后再试或换个说法。"
            }
          }

        } else if (toolName === "log_workout") {
          const description = String(args.description ?? "").trim()
          if (!description) {
            content = "未提供运动描述，无法记录。"
          } else {
            const res = await logWorkout(description)
            if (res.success && res.data) {
              loggedActivity = true
              const w = res.data
              const setsPart = w.sets ? `${w.sets}组 · ` : ""
              content = `已记录训练：${w.workout_name}（${setsPart}${w.duration_minutes}分钟 · 消耗约${w.calories_burned}kcal）。`
            } else {
              content = "记录训练失败，请让用户稍后再试或换个说法。"
            }
          }

        } else if (toolName === "log_water") {
          const amountMl = Math.round(Number(args.amount_ml) || 0)
          if (amountMl <= 0) {
            content = "饮水量无效，无法记录。"
          } else {
            const res = await logWater(amountMl)
            if (res.success) {
              loggedActivity = true
              content = `已记录饮水：+${amountMl}ml，今日累计 ${res.newAmount ?? amountMl}ml。`
            } else {
              content = "记录饮水失败，请让用户稍后再试。"
            }
          }

        } else if (toolName === "adjust_plan") {
          const instruction = String(args.instruction ?? "").trim()
          if (!instruction) {
            content = "未提供调整要求，无法修改计划。"
          } else {
            const res = await adjustWorkoutPlan({ instruction })
            if (res.success && 'data' in res && res.data) {
              loggedActivity = true
              const p = res.data as { name?: string; frequency_per_week?: number }
              const freq = p.frequency_per_week ? `，每周 ${p.frequency_per_week} 天` : ""
              content = `已根据"${instruction}"调整计划：${p.name ?? "新计划"}${freq}，已设为当前计划。请向用户简述本次调整。`
            } else {
              const err = (res as { error?: unknown }).error
              content =
                err === "PLAN_NOT_FOUND"
                  ? "用户当前没有进行中的计划，建议先生成一份计划再调整。"
                  : "调整计划失败，请让用户稍后再试或换个说法。"
            }
          }

        } else {
          content = `未知工具: ${toolName}`
        }

        return {
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content,
        }
      })
    )

    messages.push(...toolResults)
  }

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

  const hasKnowledge = toolsUsed.includes("query_knowledge_base")
  const hasPersonal = toolsUsed.includes("get_user_stats") || toolsUsed.some((tn) => LOG_TOOLS.has(tn))
  const mode: AgentMode =
    hasKnowledge && hasPersonal ? "hybrid" : hasKnowledge ? "knowledge" : hasPersonal ? "personal" : "direct"

  return { answer: fullAnswer, citations, mode, toolsUsed, retrievalK, retrievalKReason, loggedActivity }
}
