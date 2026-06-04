const STORAGE_PREFIX = "fitcore-ai-conv"

export function createConversationId(userId: string): string {
  return `fitcore-${userId}-${Date.now()}`
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`
}

/** 防止串用户或乱写入 localStorage 的脏数据 */
function isValidStoredId(userId: string, value: string | null): value is string {
  if (!value || value.length < 12 || value.length > 512) return false
  return value.startsWith(`fitcore-${userId}-`)
}

/**
 * 读取本机持久化的 RAG session id；若无或无效则创建并写入。
 * 仅客户端可用；SSR 下返回新 id（不落盘，首屏 effect 会再跑一遍）。
 */
export function loadOrCreateConversationId(userId: string): string {
  if (!userId) return createConversationId("anon")

  if (typeof window === "undefined") {
    return createConversationId(userId)
  }

  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (isValidStoredId(userId, raw)) {
      return raw
    }
  } catch {
    // 隐私模式 / 配额等
  }

  const fresh = createConversationId(userId)
  try {
    window.localStorage.setItem(storageKey(userId), fresh)
  } catch {
    // 仍返回 fresh，至少当前标签页内 RAG 会话连续
  }
  return fresh
}

export function persistConversationId(userId: string, id: string): void {
  if (!userId || typeof window === "undefined") return
  if (!isValidStoredId(userId, id)) return
  try {
    window.localStorage.setItem(storageKey(userId), id)
  } catch {
    // ignore
  }
}
