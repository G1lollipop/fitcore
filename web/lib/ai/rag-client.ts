import type { Citation, RagChatRequest } from "@/lib/ai/types"

const DEFAULT_RAG_SERVICE_URL = "http://127.0.0.1:8000"

function getRagServiceUrl(): string {
  return process.env.RAG_SERVICE_URL || DEFAULT_RAG_SERVICE_URL
}

/**
 * Builds request headers for the RAG service, attaching the shared
 * `X-API-Key` when `RAG_API_KEY` is configured. Server-only env var — never
 * exposed to the browser.
 */
function buildRagHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const apiKey = process.env.RAG_API_KEY
  if (apiKey) headers["X-API-Key"] = apiKey
  return headers
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
      headers: buildRagHeaders(),
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
