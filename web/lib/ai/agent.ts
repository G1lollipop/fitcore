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
}

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
  let retrievalK = parsed.retrievalK
  let retrievalKReason = parsed.retrievalKReason

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
  const hasPersonal = toolsUsed.includes("get_user_stats")
  const mode: AgentMode =
    hasKnowledge && hasPersonal ? "hybrid" : hasKnowledge ? "knowledge" : hasPersonal ? "personal" : "direct"

  return { answer: fullAnswer, citations, mode, toolsUsed, retrievalK, retrievalKReason }
}
