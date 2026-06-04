import { openai } from "@/lib/openaiClient"
import { AI_CHAT_MODEL } from "@/lib/ai/model"

import { buildUserContext } from "@/lib/ai/user-context"
import { buildCoachSystemPrompt } from "@/lib/ai/system-prompt"

export interface CoachChatMessage {
  role: "user" | "assistant"
  content: string
}

export async function coachChatWithHistory(
  userId: string,
  messages: CoachChatMessage[]
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("缺少 OPENAI_API_KEY，无法使用个性化教练模式")
  }

  const context = await buildUserContext(userId)
  const systemPrompt = buildCoachSystemPrompt(context)

  const apiMessages = [{ role: "system" as const, content: systemPrompt }, ...messages]

  const response = await openai.chat.completions.create({
    model: AI_CHAT_MODEL,
    messages: apiMessages,
    temperature: 0.8,
    max_tokens: 800,
  })

  const reply = response.choices[0]?.message?.content
  if (!reply) {
    throw new Error("AI 返回空内容")
  }

  return reply
}
