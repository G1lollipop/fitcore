/**
 * FitCore AI Agent — Tool Calling 架构
 *
 * ## 为什么要用 Agent，而不是原来的关键词分类？
 *
 * 旧方案：在 intent.ts 里写死大量关键词权重表，用词语匹配来猜意图。
 *   问题：覆盖不全、容易误判、每次新增场景都要手动加词。
 *
 * 新方案（Agent + Tool Calling）：
 *   1. 你给 LLM 定义一组"工具"（functions），告诉它每个工具是干什么的。
 *   2. LLM 读懂用户问题后，自主决定要不要调用工具、调哪个、传什么参数。
 *   3. 你执行工具、把结果返回给 LLM，LLM 最终基于真实数据生成回答。
 *
 * ## 三个工具
 *
 * Tool 1: set_retrieval_params（检索策略声明）
 *   → LLM 在决定查询知识库时，同时声明本次应召回多少文档（k）
 *   → k 由 LLM 根据问题复杂度判断，而不是写死的规则
 *   → k=3：简单事实  k=5：一般问题  k=8：复杂对比/综合方案
 *   → 与 query_knowledge_base 同时输出，零额外 API 调用
 *
 * Tool 2: query_knowledge_base
 *   → 调用 RAG 后端的 /v1/retrieve（纯检索，不调 LLM）
 *   → 拿回相关文档片段，使用 set_retrieval_params 指定的 k
 *
 * Tool 3: get_user_stats
 *   → 读取当前用户的个人数据（体重、今日摄入、运动记录等）
 *
 * ## 执行流程（三步，只有两次 LLM 调用）
 *
 * Step 1 — 规划（非流式，低温度）：
 *   LLM 看到用户消息 + 工具列表，一次性输出所有工具调用：
 *   e.g. [set_retrieval_params(k=8), query_knowledge_base("深蹲和硬拉区别"), get_user_stats()]
 *
 * Step 2 — 工具执行（并行）：
 *   - set_retrieval_params → 提取 k，不发网络请求
 *   - query_knowledge_base → fetch /v1/retrieve?topK=k
 *   - get_user_stats       → 直接使用已有的 userContext
 *
 * Step 3 — 流式生成（高温度）：
 *   把工具结果拼进消息历史，让 LLM 生成最终回答（stream: true）
 *   每个 token 通过 onToken 回调实时推给前端
 */

import { openai } from "@/lib/openaiClient"
import { AI_CHAT_MODEL } from "@/lib/ai/model"
import type { Citation, AgentMode, UserContextPayload } from "@/lib/ai/types"
import { chatWithRagRetrieve } from "@/lib/ai/rag-client"
import type { CoachChatMessage } from "@/lib/ai/personal-coach"

// ─── Tool 定义 ─────────────────────────────────────────────────────────────

const TOOLS: Parameters<typeof openai.chat.completions.create>[0]["tools"] = [
  {
    type: "function",
    function: {
      name: "set_retrieval_params",
      description:
        "声明本次知识库检索策略。当你打算调用 query_knowledge_base 时，必须同时调用此工具来指定召回文档数量 k。" +
        "k 根据问题复杂度选择：简单事实问题选 3，一般问题选 5，需要多角度覆盖的复杂问题选 8。",
      parameters: {
        type: "object",
        properties: {
          k: {
            type: "integer",
            enum: [3, 5, 8],
            description:
              "最终使用的文档数量。" +
              "3=简单事实（'X是什么'/'多少克'）；" +
              "5=一般问题（默认）；" +
              "8=复杂多概念（含'区别'/'对比'/'计划'/'如何搭配'等）",
          },
          reason: {
            type: "string",
            description: "选择此 k 值的简短理由，用于调试和追踪",
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
        "查询健身知识库，获取关于训练动作要领、营养原理、训练计划方案等专业健身知识。" +
        "调用此工具时必须同时调用 set_retrieval_params 来指定召回数量。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "要查询的问题或关键词，用中文描述，尽量具体",
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
        "获取当前用户的个人信息和今日运动/饮食数据，包括体重、身高、目标热量、" +
        "今日摄入的热量/蛋白质/碳水/脂肪、饮水量、运动记录等。" +
        "当需要根据用户的具体数据给出个性化建议时调用此工具。",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
]

// ─── System Prompt ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是 FitCore 的 AI 健身教练，专业、友善、富有洞察力。

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

// ─── 工具执行 ───────────────────────────────────────────────────────────────

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
    logs.dietLogs.slice(-5).forEach((log: any) => {
      lines.push(`- ${log.name || log.food_name || "食物"}: ${log.calories || 0}kcal`)
    })
  }

  if (logs.workoutLogs.length > 0) {
    lines.push(`\n【今日运动记录（最近5条）】`)
    logs.workoutLogs.slice(-5).forEach((log: any) => {
      lines.push(`- ${log.name || log.exercise_name || "运动"}: ${log.duration || 0}分钟`)
    })
  }

  return lines.join("\n")
}

// ─── Agent 结果 ─────────────────────────────────────────────────────────────

export interface AgentResult {
  answer: string
  citations: Citation[]
  mode: AgentMode
  toolsUsed: string[]
  retrievalK?: number       // LLM 选择的 k 值（供调试 / 评估使用）
  retrievalKReason?: string // LLM 给出的理由
}

// ─── 主入口：runAgent ────────────────────────────────────────────────────────

export async function runAgent(params: {
  message: string
  sessionId: string
  userContext: UserContextPayload
  conversationHistory: CoachChatMessage[]
  onToken: (token: string) => void
}): Promise<AgentResult> {
  const { message, sessionId, userContext, conversationHistory, onToken } = params

  // 构建消息历史（取最近 10 条，避免 context 过长）
  const messages: Parameters<typeof openai.chat.completions.create>[0]["messages"] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversationHistory.slice(-10),
    { role: "user", content: message },
  ]

  const toolsUsed: string[] = []
  let citations: Citation[] = []
  let retrievalK: number | undefined
  let retrievalKReason: string | undefined

  // ── Step 1: 规划 ─────────────────────────────────────────────────────────
  // LLM 一次性输出所有工具调用（可并行）：
  //   e.g. [set_retrieval_params(k=8, reason="..."), query_knowledge_base("深蹲和硬拉区别")]
  const planResponse = await openai.chat.completions.create({
    model: AI_CHAT_MODEL,
    messages,
    tools: TOOLS,
    tool_choice: "auto",
    temperature: 0.2,   // 规划阶段低温度，保持决策稳定
    max_tokens: 300,
  })

  const planChoice = planResponse.choices[0]

  // ── Step 2: 并行执行工具 ─────────────────────────────────────────────────
  if (planChoice.finish_reason === "tool_calls" && planChoice.message.tool_calls?.length) {
    messages.push(planChoice.message)

    // 先扫描一遍 tool_calls，提取 set_retrieval_params 的 k 值
    // （query_knowledge_base 执行时需要用到 k，所以要先拿到）
    for (const toolCall of planChoice.message.tool_calls) {
      if (!("function" in toolCall)) continue
      if (toolCall.function.name === "set_retrieval_params") {
        try {
          const args = JSON.parse(toolCall.function.arguments || "{}")
          retrievalK = args.k as number
          retrievalKReason = args.reason as string
        } catch {
          // 解析失败则 k 保持 undefined，后端自动判断
        }
        break
      }
    }

    // 并行执行所有工具
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
          // 忽略
        }

        toolsUsed.push(toolName)
        let content = ""

        if (toolName === "set_retrieval_params") {
          // 这个工具只是声明参数，不需要发网络请求，直接确认即可
          content = `检索参数已设定：k=${args.k}，理由：${args.reason ?? "未说明"}`

        } else if (toolName === "query_knowledge_base") {
          try {
            const result = await chatWithRagRetrieve({
              query: (args.query as string) || message,
              sessionId,
              userContext,
              topK: retrievalK,   // 把 LLM 决定的 k 传给检索后端
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

  // ── Step 3: 流式生成最终回答 ─────────────────────────────────────────────
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
