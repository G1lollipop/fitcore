import { openai } from "@/lib/openaiClient"
import { AI_FAST_MODEL } from "@/lib/ai/model"

import type { Citation, UserContextPayload } from "@/lib/ai/types"

function formatUserContext(ctx: UserContextPayload): string {
  const lines: string[] = []

  const profile = ctx.profile
  if (profile.age) lines.push(`- 年龄: ${profile.age}`)
  if (profile.gender) lines.push(`- 性别: ${profile.gender}`)
  if (profile.height) lines.push(`- 身高: ${profile.height}cm`)
  if (profile.weight) lines.push(`- 体重: ${profile.weight}kg`)
  if (profile.activityLevel) lines.push(`- 活动水平: ${profile.activityLevel}`)

  const targets = ctx.targets
  if (targets.calories) lines.push(`- 目标热量: ${targets.calories}kcal`)
  if (targets.protein) lines.push(`- 目标蛋白质: ${targets.protein}g`)
  if (targets.carbs) lines.push(`- 目标碳水: ${targets.carbs}g`)
  if (targets.fat) lines.push(`- 目标脂肪: ${targets.fat}g`)

  const today = ctx.today
  lines.push(`- 今日热量: ${today.calories ?? 0}kcal`)
  lines.push(`- 今日蛋白质: ${today.protein ?? 0}g`)
  lines.push(`- 今日碳水: ${today.carbs ?? 0}g`)
  lines.push(`- 今日脂肪: ${today.fat ?? 0}g`)
  lines.push(`- 今日饮水: ${today.water ?? 0}ml`)
  lines.push(`- 今日运动消耗: ${today.caloriesBurned ?? 0}kcal`)
  lines.push(`- 今日运动时长: ${today.workoutDuration ?? 0}分钟`)

  if (ctx.plan.currentWorkoutPlan) lines.push(`- 当前计划名: ${ctx.plan.currentWorkoutPlan}`)
  if (ctx.plan.currentPlanId) lines.push(`- 当前计划ID: ${ctx.plan.currentPlanId}`)

  return lines.join("\n")
}

export async function mergeHybridAnswer(params: {
  userMessage: string
  userContext: UserContextPayload
  knowledgeAnswer: string
  citations: Citation[]
}): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("缺少 OPENAI_API_KEY，无法使用 hybrid 合并模式")
  }

  const citationsText =
    params.citations.length > 0
      ? params.citations
          .map((c, idx) => `${idx + 1}. ${c.title} (${c.source})`)
          .join("\n")
      : "（本次未返回结构化引用条目；仍以知识库回答文本为准）"

  const system = `你是 FitCore 的 AI 健身教练。你需要把“知识库回答”和“用户个人数据”融合成一份中文回答。

硬性规则：
1) 知识库回答里如果明确写了“资料不足”，你最终也要诚实说明资料不足，不要编造知识。
2) 不要编造用户没有提供的记录细节；用户数据只使用我给你的摘要字段。
3) 优先给出可执行建议（饮食/训练/恢复），语气专业友善。
4) 适当使用 emoji，但不要堆砌。
5) 如果知识库回答与用户问题明显不相关，请明确指出“本次检索资料不够贴题”，并基于用户数据给出保守、安全的通用建议（避免胡编具体训练动作细节）。

输出结构建议：
- 先给结论
- 再给可执行步骤（分点）
- 最后给风险提示（非医疗建议）`

  const user = `用户问题：
${params.userMessage}

用户个人上下文摘要：
${formatUserContext(params.userContext)}

知识库回答（来自 RAG）：
${params.knowledgeAnswer}

引用条目（可能为空）：
${citationsText}

请输出最终回答。`

  const response = await openai.chat.completions.create({
    model: AI_FAST_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.5,
    max_tokens: 900,
  })

  const reply = response.choices[0]?.message?.content
  if (!reply) {
    throw new Error("Hybrid 合并返回空内容")
  }

  return reply
}
