'use client'

import { useCallback, useState } from 'react'
import type { AgentSSEEvent } from '@/lib/ai/types'
import type { Message } from '../types'
import { nowHHMM } from '../utils'

interface UseChatStreamArgs {
  conversationId: string
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  /** Called once the stream completes successfully (used to refresh sidebar summaries). */
  onAssistantDone?: () => void
}

export interface UseChatStreamResult {
  isTyping: boolean
  sendMessage: (text: string) => Promise<void>
}

/**
 * One SSE block = `data: {json}\n\n`. Returns the parsed event, or `null`
 * if the block has no usable data line / fails to JSON-parse.
 */
function parseSSEBlock(block: string): AgentSSEEvent | null {
  const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
  if (!dataLine) return null
  const jsonStr = dataLine.slice(6).trim()
  if (!jsonStr) return null
  try {
    return JSON.parse(jsonStr) as AgentSSEEvent
  } catch {
    return null
  }
}

/**
 * Apply one SSE event to the message list. Token events append to the
 * current streaming bubble; done events finalise it; error events replace
 * the content and stop streaming.
 */
function applyEvent(
  event: AgentSSEEvent,
  aiMsgId: string,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  onAssistantDone?: () => void
) {
  if (event.type === 'token') {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === aiMsgId ? { ...m, content: m.content + event.content } : m
      )
    )
    return
  }

  if (event.type === 'done') {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === aiMsgId
          ? {
              ...m,
              isStreaming: false,
              mode: event.mode,
              citations: event.citations ?? [],
              toolsUsed: event.toolsUsed ?? [],
            }
          : m
      )
    )
    onAssistantDone?.()
    return
  }

  if (event.type === 'error') {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === aiMsgId
          ? { ...m, content: event.message || '抱歉，发生了错误', isStreaming: false }
          : m
      )
    )
  }
}

/**
 * Owns the request lifecycle to /api/ai/chat: optimistically appends the
 * user message, inserts an empty streaming assistant bubble, then reads
 * the SSE stream block-by-block and patches the bubble in place.
 *
 * Pure side-effect hook — relies on `setMessages` from `useConversations`
 * to mutate the shared message list, so the two stay in sync without
 * needing a context provider.
 */
export function useChatStream({
  conversationId,
  setMessages,
  onAssistantDone,
}: UseChatStreamArgs): UseChatStreamResult {
  const [isTyping, setIsTyping] = useState(false)

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isTyping) return

      // 1. Optimistically render the user bubble
      const userMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: trimmed,
        timestamp: nowHHMM(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsTyping(true)

      // 2. Insert an empty streaming assistant bubble so the user sees
      //    immediate feedback while we wait for the first token.
      const aiMsgId = `ai-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        {
          id: aiMsgId,
          role: 'assistant',
          content: '',
          timestamp: nowHHMM(),
          isStreaming: true,
        },
      ])

      try {
        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            conversationId: conversationId || undefined,
          }),
        })

        if (!response.ok || !response.body) {
          throw new Error(`请求失败 (${response.status})`)
        }

        // 3. Read the SSE stream. Each "block" is terminated with \n\n.
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const blocks = buffer.split('\n\n')
          // Last item may be a partial block — keep it for the next read.
          buffer = blocks.pop() ?? ''

          for (const block of blocks) {
            const event = parseSSEBlock(block)
            if (event) applyEvent(event, aiMsgId, setMessages, onAssistantDone)
          }
        }
      } catch (error) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  content:
                    error instanceof Error
                      ? error.message
                      : '抱歉，我暂时无法回答，请稍后再试。',
                  isStreaming: false,
                }
              : m
          )
        )
        console.error('[useChatStream] error:', error)
      } finally {
        setIsTyping(false)
      }
    },
    [conversationId, isTyping, setMessages, onAssistantDone]
  )

  return { isTyping, sendMessage }
}
