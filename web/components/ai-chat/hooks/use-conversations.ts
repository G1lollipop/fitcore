'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  clearChatHistory,
  getChatHistory,
  listChatConversations,
  type ChatConversationSummary,
} from '@/app/actions/chat'
import {
  createConversationId,
  loadOrCreateConversationId,
  persistConversationId,
} from '@/lib/ai/conversation-id'
import { useT } from '@/lib/i18n/provider'
import type { Dictionary } from '@/lib/i18n'
import type { Message } from '../types'
import { nowHHMM } from '../utils'

/** Initial assistant greeting shown for fresh conversations. */
function welcomeMessage(t: Dictionary): Message {
  return {
    id: '0',
    role: 'assistant',
    content: t.aiChat.welcome,
    timestamp: nowHHMM(),
  }
}

/** Message shown right after the user clears their conversation. */
function clearedMessage(t: Dictionary): Message {
  return {
    id: '0',
    role: 'assistant',
    content: t.aiChat.cleared,
    timestamp: nowHHMM(),
  }
}

export interface UseConversationsResult {
  conversationId: string
  sessionOptions: ChatConversationSummary[]
  messages: Message[]
  /** Exposed so the streaming hook can append assistant tokens into state. */
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  isLoadingHistory: boolean
  switchConversation: (cid: string) => void
  startNewChat: () => void
  clearHistory: () => Promise<void>
  refreshSummaries: () => Promise<void>
}

/**
 * Owns conversation-level state: the current conversation id (persisted in
 * localStorage), the list of sibling conversations for the dropdown, the
 * currently loaded message list, and history loading state.
 *
 * Extracted from the original `AIChatWidget` so the orchestrator doesn't
 * have to know how any of this works.
 */
export function useConversations(userId: string): UseConversationsResult {
  const t = useT()
  // Lazy-init from persisted storage (this hook only runs client-side — the
  // widget is dynamically imported with ssr:false), avoiding a setState in the
  // mount effect.
  const [conversationId, setConversationId] = useState(() =>
    userId ? loadOrCreateConversationId(userId) : ''
  )
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)

  const refreshSummaries = useCallback(async () => {
    const r = await listChatConversations()
    if (r.success && r.conversations) setConversations(r.conversations)
  }, [])

  const loadHistoryFor = useCallback(
    async (cid: string) => {
      if (!cid) return
      setIsLoadingHistory(true)
      const result = await getChatHistory(cid, 80)
      if (result.success && result.messages && result.messages.length > 0) {
        setMessages(
          result.messages.map((m, i) => ({
            id: `history-${i}`,
            role: m.role,
            content: m.content,
            timestamp: '',
          }))
        )
      } else {
        setMessages([welcomeMessage(t)])
      }
      setIsLoadingHistory(false)
    },
    [t]
  )

  // Initial mount: load history for the (lazy-initialised) conversation and
  // refresh the sibling list. `userId` is stable, so this runs once; switching
  // conversations handles its own loading.
  useEffect(() => {
    if (!userId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time load of conversation list + history; loading flags are set intentionally
    void refreshSummaries()
    void loadHistoryFor(loadOrCreateConversationId(userId))
  }, [userId, loadHistoryFor, refreshSummaries])

  /**
   * The dropdown options always include the active conversation, even when
   * it isn't yet in the persisted list (e.g. brand new chat). We unshift a
   * synthetic entry for that case.
   */
  const sessionOptions = useMemo(() => {
    const base = [...conversations]
    if (conversationId && !base.some((c) => c.conversationId === conversationId)) {
      base.unshift({
        conversationId,
        lastAt: new Date().toISOString(),
        preview: t.aiChat.newSessionPreview,
      })
    }
    return base
  }, [conversations, conversationId, t])

  const switchConversation = useCallback(
    (cid: string) => {
      if (!cid || cid === conversationId) return
      persistConversationId(userId, cid)
      setConversationId(cid)
      void loadHistoryFor(cid)
      void refreshSummaries()
    },
    [conversationId, userId, loadHistoryFor, refreshSummaries]
  )

  const startNewChat = useCallback(() => {
    const next = createConversationId(userId)
    persistConversationId(userId, next)
    setConversationId(next)
    setMessages([welcomeMessage(t)])
    void refreshSummaries()
  }, [userId, refreshSummaries, t])

  const clearHistory = useCallback(async () => {
    if (!conversationId) return
    if (!confirm(t.aiChat.confirmClear)) return

    const result = await clearChatHistory(conversationId)
    if (!result.success) return

    const next = createConversationId(userId)
    persistConversationId(userId, next)
    setConversationId(next)
    setMessages([clearedMessage(t)])
    void refreshSummaries()
  }, [userId, conversationId, refreshSummaries, t])

  return {
    conversationId,
    sessionOptions,
    messages,
    setMessages,
    isLoadingHistory,
    switchConversation,
    startNewChat,
    clearHistory,
    refreshSummaries,
  }
}
