import type { UserContextPayload } from "./types"

const GENDER_MAP: Record<string, string> = {
  male: "男",
  female: "女",
  other: "其他",
}

const ACTIVITY_MAP: Record<string, string> = {
  sedentary: "久坐不动",
  light: "轻度活动",
  moderate: "中度活动",
  active: "高度活动",
  very_active: "非常活跃",
}

function formatProgress(
  current: number | null | undefined,
  target: number | null | undefined,
  unit: string
): string {
  if (target && current !== null && current !== undefined) {
    const percentage = Math.round((current / target) * 100)
    return `${current}/${target}${unit} (${percentage}%)`
  }
  return `${current ?? 0}${unit}`
}

export function buildCoachSystemPrompt(context: UserContextPayload): string {
  const { profile, targets, today, logs } = context

  let userInfo = ""
  if (profile.age) userInfo += `- 年龄: ${profile.age}岁\n`
  if (profile.gender) userInfo += `- 性别: ${GENDER_MAP[profile.gender] || profile.gender}\n`
  if (profile.height) userInfo += `- 身高: ${profile.height}cm\n`
  if (profile.weight) userInfo += `- 体重: ${profile.weight}kg\n`
  if (profile.activityLevel) {
    userInfo += `- 活动水平: ${ACTIVITY_MAP[profile.activityLevel] || profile.activityLevel}\n`
  }

  let targetInfo = ""
  if (targets.calories) targetInfo += `- 目标热量: ${targets.calories}kcal\n`
  if (targets.protein) targetInfo += `- 目标蛋白质: ${targets.protein}g\n`
  if (targets.carbs) targetInfo += `- 目标碳水: ${targets.carbs}g\n`
  if (targets.fat) targetInfo += `- 目标脂肪: ${targets.fat}g\n`

  const todaySummary = [
    `- 热量摄入: ${formatProgress(today.calories, targets.calories, "kcal")}`,
    `- 蛋白质: ${formatProgress(today.protein, targets.protein, "g")}`,
    `- 碳水化合物: ${formatProgress(today.carbs, targets.carbs, "g")}`,
    `- 脂肪: ${formatProgress(today.fat, targets.fat, "g")}`,
    `- 饮水量: ${today.water ?? 0}ml`,
    `- 运动消耗: ${today.caloriesBurned ?? 0}kcal`,
    `- 运动时长: ${today.workoutDuration ?? 0}分钟`,
  ].join("\n")

  let dietInfo = ""
  if (logs.dietLogs.length > 0) {
    dietInfo = logs.dietLogs
      .slice(-5)
      .map((log: any) => `  - ${log.name || log.food_name || "食物"}: ${log.calories || 0}kcal`)
      .join("\n")
  }

  let workoutInfo = ""
  if (logs.workoutLogs.length > 0) {
    workoutInfo = logs.workoutLogs
      .slice(-5)
      .map((log: any) => `  - ${log.name || log.exercise_name || "运动"}: ${log.duration || 0}分钟`)
      .join("\n")
  }

  return `你是FitCore智能健身平台的AI健身教练，专业、友善且富有洞察力。

## 你的职责
1. 根据用户的饮食记录和训练数据，提供个性化的健身和营养建议
2. 回答关于增肌、减脂、营养搭配、训练计划等问题
3. 鼓励用户坚持健身目标，保持积极正面的态度
4. 用中文回复，语言简洁易懂，适当使用emoji增加亲和力

## 回复风格
- 专业但易懂，避免过于学术化的术语
- 积极鼓励，给予用户信心
- 实用性强，给出具体可执行的建议
- 适当使用emoji让对话更生动
- 根据用户今日数据给出针对性建议

## 当前用户信息
${userInfo || "- 暂无基本信息"}
${targetInfo ? `\n## 用户目标\n${targetInfo}` : ""}

## 用户今日数据
${todaySummary}
${dietInfo ? `\n### 今日饮食记录\n${dietInfo}` : "- 暂无饮食记录"}
${workoutInfo ? `\n### 今日运动记录\n${workoutInfo}` : "- 暂无运动记录"}

请基于以上信息，为用户提供个性化的健身和营养建议。`
}
