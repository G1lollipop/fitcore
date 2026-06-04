import type { Citation, RagChatRequest, RagChatResponse } from "@/lib/ai/types"

const DEFAULT_RAG_SERVICE_URL = "http://127.0.0.1:8000"
const DEFAULT_REQUEST_TIMEOUT_MS = 120000

function getRagServiceUrl(): string {
  return process.env.RAG_SERVICE_URL || DEFAULT_RAG_SERVICE_URL
}

function getRequestTimeoutMs(): number {
  const raw = process.env.RAG_CLIENT_TIMEOUT_MS
  if (!raw) return DEFAULT_REQUEST_TIMEOUT_MS

  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REQUEST_TIMEOUT_MS
}

function isTransientNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.name === "AbortError") return true
  const m = err.message.toLowerCase()
  return (
    m.includes("fetch failed") ||
    m.includes("econnreset") ||
    m.includes("etimedout") ||
    m.includes("socket") ||
    m.includes("network")
  )
}

export interface RagRetrieveChunk {
  id?: string | null
  title: string
  source: string
  snippet: string
  score?: number | null
}

export interface RagRetrieveResponse {
  chunks: RagRetrieveChunk[]
  citations: Citation[]
}

/** 纯检索：只做向量召回 + 重排序，不调用 LLM，供 Agent 工具使用 */
export async function chatWithRagRetrieve(payload: {
  query: string
  sessionId: string
  userContext: RagChatRequest["userContext"]
  topK?: number   // 由 Agent set_retrieval_params 工具决定；不传则后端自动判断
}): Promise<RagRetrieveResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)
  try {
    const { topK, ...rest } = payload
    const response = await fetch(`${getRagServiceUrl()}/v1/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rest, topK: topK ?? 0 }),
      signal: controller.signal,
      cache: "no-store",
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`RAG retrieve error (${response.status}): ${errorText}`)
    }
    const data = (await response.json()) as { chunks: RagRetrieveChunk[] }
    const citations: Citation[] = (data.chunks ?? []).map((c) => ({
      id: c.id ?? null,
      title: c.title,
      source: c.source,
      snippet: c.snippet,
      score: c.score ?? null,
    }))
    return { chunks: data.chunks ?? [], citations }
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function chatWithRag(payload: RagChatRequest): Promise<RagChatResponse> {
  const maxAttempts = 3
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), getRequestTimeoutMs())
    try {
      const response = await fetch(`${getRagServiceUrl()}/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: "no-store",
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`RAG service error (${response.status}): ${errorText}`)
      }

      const data = (await response.json()) as RagChatResponse
      return {
        answer: data.answer,
        citations: data.citations ?? [],
        retrievalMeta: data.retrievalMeta ?? { retrievedCount: 0 },
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      const retry = attempt < maxAttempts - 1 && isTransientNetworkError(lastError)
      if (!retry) throw lastError
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    } finally {
      clearTimeout(timeoutId)
    }
  }

  throw lastError ?? new Error("RAG request failed")
}
