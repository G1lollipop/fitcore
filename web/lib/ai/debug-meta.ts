import type { VectorRetrievalBackend } from "@/lib/ai/types"

/** 是否在 /api/ai/chat 响应 meta 中附带调试字段（与线上 RAG 的 VECTOR_BACKEND 对齐填写） */
export function aiChatDebugMetaEnabled(): boolean {
  const v = process.env.AI_CHAT_DEBUG_META?.trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes"
}

/** 与 Python RAG 环境变量一致时可填 supabase / chroma，否则 unknown */
export function resolveRetrievalBackendMeta(): VectorRetrievalBackend {
  const raw = (
    process.env.RAG_VECTOR_BACKEND ||
    process.env.NEXT_PUBLIC_RAG_VECTOR_BACKEND ||
    ""
  )
    .trim()
    .toLowerCase()
  if (raw === "supabase") return "supabase"
  if (raw === "chroma") return "chroma"
  return "unknown"
}
