import { supabase } from "@/lib/supabaseClient"
import { getUserIdOrNull } from "@/lib/auth/require-user"
import { z } from "zod"

import type { AgentSSEEvent, CoachChatMessage } from "@/lib/ai/types"
import { runAgent, type AgentResult } from "@/lib/ai/agent"
import { buildUserContext } from "@/lib/ai/user-context"

/**
 * Persist a lightweight per-turn observability trace (stage latencies + token
 * estimate). Best-effort: failures are logged and swallowed so they never
 * affect the user's answer.
 */
async function saveTrace(
  userId: string,
  messageId: string | null,
  conversationId: string,
  result: AgentResult,
  latencyMs: number
): Promise<void> {
  try {
    const { error } = await supabase.from("chat_trace").insert({
      user_id: userId,
      message_id: messageId,
      conversation_id: conversationId,
      mode: result.mode,
      tools_used: result.toolsUsed,
      retrieval_k: result.retrievalK ?? null,
      latency_ms: latencyMs,
      plan_ms: result.timings?.planMs ?? null,
      tools_ms: result.timings?.toolsMs ?? null,
      generation_ms: result.timings?.generationMs ?? null,
      prompt_chars_approx: result.usage?.promptCharsApprox ?? null,
      completion_chars: result.usage?.completionChars ?? null,
      completion_tokens_approx: result.usage?.completionTokensApprox ?? null,
    })
    if (error) console.error("[/api/ai/chat] saveTrace error:", error)
  } catch (err) {
    console.error("[/api/ai/chat] saveTrace exception:", err)
  }
}

const requestSchema = z.object({
  message: z.string().trim().min(1, "message is required"),
  conversationId: z.string().trim().optional(),
})

async function saveMessage(
  userId: string,
  role: "user" | "assistant",
  content: string,
  conversationId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      user_id: userId,
      role,
      content,
      conversation_id: conversationId,
    })
    .select("id")
    .single()
  if (error) {
    console.error("[/api/ai/chat] saveMessage error:", error)
    return null
  }
  return data?.id ?? null
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
  const userId = await getUserIdOrNull()
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

  // Serialize and encode an SSE event.
  const encodeEvent = (event: AgentSSEEvent): Uint8Array =>
    encoder.encode(`data: ${JSON.stringify(event)}\n\n`)

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Load user context and history in parallel to cut first-token latency.
        const [userContext, conversationHistory] = await Promise.all([
          buildUserContext(userId),
          loadRecentMessages(userId, effectiveConversationId, 20),
        ])

        // Run the agent: plan → tool calls → streaming generation.
        // onToken pushes each token to the client as it is generated.
        const result = await runAgent({
          message,
          sessionId: effectiveConversationId,
          userContext,
          conversationHistory,
          onToken: (token) => {
            controller.enqueue(encodeEvent({ type: "token", content: token }))
          },
        })

        // Persist before sending `done` so the stream doesn't finish ahead of
        // the DB write and drop history; write failures don't affect this
        // answer and are surfaced honestly via meta.persisted.
        const [userMessageId, assistantMessageId] = await Promise.all([
          saveMessage(userId, "user", message, effectiveConversationId),
          saveMessage(userId, "assistant", result.answer, effectiveConversationId),
        ])
        const persisted = Boolean(userMessageId) && Boolean(assistantMessageId)

        // Best-effort observability trace (never blocks/affects the reply).
        void saveTrace(userId, assistantMessageId, effectiveConversationId, result, Date.now() - startedAt)

        // done event: citations, mode, tool list, k value (for debugging).
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
              persisted,
              assistantMessageId: assistantMessageId ?? undefined,
            },
          })
        )
        controller.close()
      } catch (error) {
        console.error("[/api/ai/chat] agent error:", error)
        controller.enqueue(
          encodeEvent({
            type: "error",
            // Empty for the generic case so the client renders its own
            // localized fallback (t.aiChat.streamError); real Error messages
            // (often technical) are still forwarded for debugging.
            message: error instanceof Error ? error.message : "",
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
