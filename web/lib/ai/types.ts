import type { DietLogItem, WorkoutLogItem } from "@/app/actions/types"

export type ChatMode = "personal" | "rag" | "hybrid"

/** 单条对话消息（用户 / 助手） */
export interface CoachChatMessage {
  role: "user" | "assistant"
  content: string
}

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
  persisted?: boolean        // 消息是否成功写入历史库
  loggedActivity?: boolean   // 本轮是否通过 log_* 工具写入了饮食/训练/饮水
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

export interface RagChatResponse {
  answer: string
  citations?: Citation[]
  retrievalMeta?: {
    retrievedCount?: number
  }
}
