import "server-only"

const DEFAULT_RAG_SERVICE_URL = "http://127.0.0.1:8000"

function getRagServiceUrl(): string {
  return process.env.RAG_SERVICE_URL || DEFAULT_RAG_SERVICE_URL
}

/**
 * Headers for the RAG service, attaching the shared `X-API-Key` when
 * `RAG_API_KEY` is configured. Server-only env var — never exposed to the
 * browser.
 */
function buildRagHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const apiKey = process.env.RAG_API_KEY
  if (apiKey) headers["X-API-Key"] = apiKey
  return headers
}

export interface KnowledgeStreamArgs {
  query: string
  /** Independent per-search session id; keeps knowledge searches out of the
   *  personal chat history and stops cross-search context bleed. */
  sessionId: string
  signal?: AbortSignal
}

/**
 * Opens the backend `/v1/chat/stream` SSE connection for the Knowledge
 * Exploration Center. Returns the raw streaming `Response` so the caller (the
 * Next route handler) can pipe the event stream straight to the browser.
 *
 * `userContext` is intentionally empty: the knowledge hub answers general
 * evidence-based questions, not personalized coaching.
 */
export async function streamKnowledgeSearch({
  query,
  sessionId,
  signal,
}: KnowledgeStreamArgs): Promise<Response> {
  return fetch(`${getRagServiceUrl()}/v1/chat/stream`, {
    method: "POST",
    headers: buildRagHeaders(),
    body: JSON.stringify({ query, sessionId, userContext: {} }),
    signal,
    cache: "no-store",
  })
}
