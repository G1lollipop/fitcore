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
import type { Message } from '../types'
import { nowHHMM } from '../utils'

/** Initial assistant greeting shown for fresh conversations. */
function welcomeMessage(): Message {
  return {
    id: '0',
    role: 'assistant',
    content: '你好！有关饮食、训练或健身计划的问题，随时问我。',
    timestamp: nowHHMM(),
  }
}

/** Message shown right after the user clears their conversation. */
function clearedMessage(): Message {
  return {
    id: '0',
    role: 'assistant',
    content: '当前会话已清除。有什么新问题想问我吗？',
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
  const [conversationId, setConversationId] = useState('')
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)

  const refreshSummaries = useCallback(async () => {
    const r = await listChatConversations(userId)
    if (r.success && r.conversations) setConversations(r.conversations)
  }, [userId])

  const loadHistoryFor = useCallback(
    async (cid: string) => {
      if (!cid) return
      setIsLoadingHistory(true)
      const result = await getChatHistory(userId, cid, 80)
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
        setMessages([welcomeMessage()])
      }
      setIsLoadingHistory(false)
    },
    [userId]
  )

  // Initial mount: pull the persisted conversation id, load history,
  // and refresh the sibling list.
  useEffect(() => {
    if (!userId) return
    const cid = loadOrCreateConversationId(userId)
    setConversationId(cid)
    void refreshSummaries()
    void loadHistoryFor(cid)
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
        preview: '（当前新会话）',
      })
    }
    return base
  }, [conversations, conversationId])

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
    setMessages([welcomeMessage()])
    void refreshSummaries()
  }, [userId, refreshSummaries])

  const clearHistory = useCallback(async () => {
    if (!conversationId) return
    if (!confirm('确定清除当前会话的所有消息？')) return

    const result = await clearChatHistory(userId, conversationId)
    if (!result.success) return

    const next = createConversationId(userId)
    persistConversationId(userId, next)
    setConversationId(next)
    setMessages([clearedMessage()])
    void refreshSummaries()
  }, [userId, conversationId, refreshSummaries])

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
