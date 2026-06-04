export type ChatMode = "personal" | "rag" | "hybrid"

/** Agent 模式：由 LLM 自主决定调用哪些工具 */
export type AgentMode = "knowledge" | "personal" | "hybrid" | "direct"

/** SSE 流式事件 */
export type AgentSSEEvent =
  | { type: "token"; content: string }
  | { type: "done"; mode: AgentMode; citations: Citation[]; toolsUsed: string[]; meta: AIChatMeta }
  | { type: "error"; message: string }

export interface AIChatMeta {
  latencyMs?: number
  conversationId?: string
  retrievalBackend?: VectorRetrievalBackend
  retrievalK?: number        // LLM 选择的召回数量
  retrievalKReason?: string  // LLM 给出的理由
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
    dietLogs: any[]
    workoutLogs: any[]
  }
}

export interface RagChatRequest {
  query: string
  sessionId: string
  userContext: UserContextPayload
}

export interface RagChatResponse {
  answer: string
  citations?: Citation[]
  retrievalMeta?: {
    retrievedCount?: number
  }
}
