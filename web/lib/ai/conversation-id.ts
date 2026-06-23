const STORAGE_PREFIX = "fitcore-ai-conv"

export function createConversationId(userId: string): string {
  return `fitcore-${userId}-${Date.now()}`
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`
}

/** Guards against cross-user leakage or junk data written into localStorage. */
function isValidStoredId(userId: string, value: string | null): value is string {
  if (!value || value.length < 12 || value.length > 512) return false
  return value.startsWith(`fitcore-${userId}-`)
}

/**
 * Reads the locally persisted RAG session id; creates and stores one if it is
 * missing or invalid. Client-only; under SSR it returns a fresh id (not
 * persisted — the first-paint effect runs this again).
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
    // private mode / quota exceeded, etc.
  }

  const fresh = createConversationId(userId)
  try {
    window.localStorage.setItem(storageKey(userId), fresh)
  } catch {
    // still return fresh — at least the RAG session stays continuous within this tab
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
