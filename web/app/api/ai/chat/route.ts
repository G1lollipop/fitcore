import { auth } from "@clerk/nextjs/server"
import { supabase } from "@/lib/supabaseClient"
import { z } from "zod"

import type { AgentSSEEvent } from "@/lib/ai/types"
import { runAgent } from "@/lib/ai/agent"
import { buildUserContext } from "@/lib/ai/user-context"
import type { CoachChatMessage } from "@/lib/ai/personal-coach"

const requestSchema = z.object({
  message: z.string().trim().min(1, "message is required"),
  conversationId: z.string().trim().optional(),
})

async function saveMessage(
  userId: string,
  role: "user" | "assistant",
  content: string,
  conversationId: string
) {
  const { error } = await supabase.from("chat_messages").insert({
    user_id: userId,
    role,
    content,
    conversation_id: conversationId,
  })
  if (error) {
    console.error("[/api/ai/chat] saveMessage error:", error)
  }
}

async function loadRecentMessages(
  userId: string,
  conversationId: string,
  limit: number
): Promise<CoachChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role,content")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit)

  if (error) {
    console.error("[/api/ai/chat] loadRecentMessages error:", error)
    return []
  }

  return (data ?? [])
    .map(
      (row): CoachChatMessage => ({
        role: row.role === "assistant" ? "assistant" : "user",
        content: row.content ?? "",
      })
    )
    .filter((m) => m.content.trim().length > 0)
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Invalid request" }),
      { status: 400 }
    )
  }

  const { message, conversationId: bodyConversationId } = parsed.data
  const startedAt = Date.now()
  const effectiveConversationId =
    bodyConversationId?.trim() || `fitcore-${userId}-${startedAt}`

  const encoder = new TextEncoder()

  // 将 SSE 事件序列化并编码
  const encodeEvent = (event: AgentSSEEvent): Uint8Array =>
    encoder.encode(`data: ${JSON.stringify(event)}\n\n`)

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 并行加载用户上下文和历史记录，减少首 token 延迟
        const [userContext, conversationHistory] = await Promise.all([
          buildUserContext(userId),
          loadRecentMessages(userId, effectiveConversationId, 20),
        ])

        // 运行 Agent：规划 → 工具调用 → 流式生成
        // onToken 在每个 token 生成时立即推送到客户端
        const result = await runAgent({
          message,
          sessionId: effectiveConversationId,
          userContext,
          conversationHistory,
          onToken: (token) => {
            controller.enqueue(encodeEvent({ type: "token", content: token }))
          },
        })

        // 持久化（不阻塞响应流）
        void Promise.all([
          saveMessage(userId, "user", message, effectiveConversationId),
          saveMessage(userId, "assistant", result.answer, effectiveConversationId),
        ])

        // done 事件：引用来源、模式、工具列表、k 值（供调试）
        controller.enqueue(
          encodeEvent({
            type: "done",
            mode: result.mode,
            citations: result.citations,
            toolsUsed: result.toolsUsed,
            meta: {
              latencyMs: Date.now() - startedAt,
              conversationId: effectiveConversationId,
              retrievalK: result.retrievalK,
              retrievalKReason: result.retrievalKReason,
            },
          })
        )
        controller.close()
      } catch (error) {
        console.error("[/api/ai/chat] agent error:", error)
        controller.enqueue(
          encodeEvent({
            type: "error",
            message:
              error instanceof Error ? error.message : "AI 服务暂时不可用，请稍后再试",
          })
        )
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
