import type { AgentMode, Citation } from '@/lib/ai/types'

/** A single chat bubble — user or assistant. */
export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** HH:MM string. Empty for messages restored from history. */
  timestamp: string
  mode?: AgentMode
  citations?: Citation[]
  toolsUsed?: string[]
  /** True while the SSE stream is still appending tokens. */
  isStreaming?: boolean
  /** Persisted chat_messages.id of the assistant reply (enables feedback). */
  serverMessageId?: string
}
