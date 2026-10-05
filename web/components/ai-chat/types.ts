import type { AgentMode, Citation } from '@/lib/ai/types'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  mode?: AgentMode
  citations?: Citation[]
  toolsUsed?: string[]
  isStreaming?: boolean
  serverMessageId?: string
}
