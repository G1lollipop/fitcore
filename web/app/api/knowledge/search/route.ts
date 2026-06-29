import { z } from "zod"

import { getUserIdOrNull } from "@/lib/auth/require-user"
import { streamKnowledgeSearch } from "@/lib/ai/knowledge-client"

const requestSchema = z.object({
  query: z.string().trim().min(1, "query is required").max(500),
})

/**
 * SSE proxy for the Knowledge Exploration Center.
 *
 * Authenticates the caller, then forwards the backend `/v1/chat/stream` event
 * stream (`sources` → `token`… → `done`) straight through to the browser. The
 * shared `X-API-Key` is attached server-side and never reaches the client.
 */
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

  const sessionId = `knowledge-${userId}-${Date.now()}`

  let upstream: Response
  try {
    upstream = await streamKnowledgeSearch({
      query: parsed.data.query,
      sessionId,
      signal: request.signal,
    })
  } catch (error) {
    console.error("[/api/knowledge/search] upstream error:", error)
    return new Response(JSON.stringify({ error: "Knowledge service unavailable" }), {
      status: 502,
    })
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "")
    console.error(`[/api/knowledge/search] upstream ${upstream.status}: ${detail}`)
    return new Response(JSON.stringify({ error: "Knowledge service error" }), {
      status: 502,
    })
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
