import type { DietLogItem, WorkoutLogItem } from "@/app/actions/types"

export type ChatMode = "personal" | "rag" | "hybrid"

/** A single chat message (user / assistant). */
export interface CoachChatMessage {
  role: "user" | "assistant"
  content: string
}

/** Agent mode: the LLM autonomously decides which tools to call. */
export type AgentMode = "knowledge" | "personal" | "hybrid" | "direct"

/** SSE streaming event. */
export type AgentSSEEvent =
  | { type: "token"; content: string }
  | { type: "done"; mode: AgentMode; citations: Citation[]; toolsUsed: string[]; meta: AIChatMeta }
  | { type: "error"; message: string }

export interface AIChatMeta {
  latencyMs?: number
  conversationId?: string
  retrievalBackend?: VectorRetrievalBackend
  retrievalK?: number        // number of chunks the LLM chose to retrieve
  retrievalKReason?: string  // the LLM's stated rationale
  persisted?: boolean        // whether the message was successfully written to the history store
  loggedActivity?: boolean   // whether this turn wrote diet/workout/water via a log_* tool
  assistantMessageId?: string // chat_messages.id of the persisted assistant reply (for feedback)
}

export interface Citation {
  id?: string | null
  title: string
  source: string
  snippet: string
  score?: number | null
}

export type VectorRetrievalBackend = "supabase" | "chroma" | "unknown"

export interface AIChatResponse {
  answer: string
  mode: ChatMode | AgentMode
  citations?: Citation[]
  meta?: AIChatMeta & {
    intent?: string
    retrievedCount?: number
    conversationId?: string
  }
}

export interface UserContextPayload {
  profile: {
    age?: number | null
    gender?: string | null
    height?: number | null
    weight?: number | null
    activityLevel?: string | null
  }
  targets: {
    calories?: number | null
    protein?: number | null
    carbs?: number | null
    fat?: number | null
  }
  today: {
    calories?: number | null
    protein?: number | null
    carbs?: number | null
    fat?: number | null
    water?: number | null
    caloriesBurned?: number | null
    workoutDuration?: number | null
  }
  plan: {
    currentWorkoutPlan?: string | null
    currentPlanId?: string | null
  }
  logs: {
    dietLogs: DietLogItem[]
    workoutLogs: WorkoutLogItem[]
  }
}

export interface RagChatRequest {
  query: string
  sessionId: string
  userContext: UserContextPayload
}

/**
 * Retrieval internals surfaced by the backend `/v1/chat/stream` `sources`
 * event. Drives the Knowledge Exploration Center's RAG transparency panel.
 */
export interface KnowledgeRetrievalMeta {
  retrievedCount?: number
  /** Final number of chunks fed to the LLM. */
  k?: number
  /** True when k was auto-chosen from query complexity (vs. an explicit topK). */
  kAuto?: boolean
  /** True when retrieval confidence fell below threshold and the model abstained. */
  abstained?: boolean
  /** Top-1 similarity score, when the backend exposes one (e.g. pgvector). */
  topScore?: number | null
  /** True when a CrossEncoder reranker was applied on top of vector + BM25. */
  reranked?: boolean
}

/**
 * SSE events streamed from `/api/knowledge/search` (which proxies the backend
 * `/v1/chat/stream`). `sources` arrives first so the UI can paint citations +
 * the transparency panel before the answer tokens flow in.
 */
export type KnowledgeSSEEvent =
  | {
      type: "sources"
      citations: Citation[]
      retrievalMeta: KnowledgeRetrievalMeta
      retrievalBackend: VectorRetrievalBackend
    }
  | { type: "token"; content: string }
  | { type: "done" }
  | { type: "error"; message: string }

export interface RagChatResponse {
  answer: string
  citations?: Citation[]
  retrievalMeta?: {
    retrievedCount?: number
  }
}
