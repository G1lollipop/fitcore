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

/** Pure retrieval: vector recall + reranking only, no LLM call — for use by Agent tools. */
export async function chatWithRagRetrieve(payload: {
  query: string
  sessionId: string
  userContext: RagChatRequest["userContext"]
  topK?: number   // selected by query_knowledge_base; omit to let the backend choose automatically
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
