'use client'

import { useCallback, useState } from 'react'
import type { AgentSSEEvent } from '@/lib/ai/types'
import { useLanguage } from '@/lib/i18n/provider'
import type { Dictionary } from '@/lib/i18n'
import type { Message } from '../types'
import { nowHHMM } from '../utils'

interface UseChatStreamArgs {
  conversationId: string
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  onAssistantDone?: () => void
}

export interface UseChatStreamResult {
  isTyping: boolean
  sendMessage: (text: string) => Promise<void>
}

/** The server answered with an HTTP error; its message is already localized. */
class RequestFailedError extends Error {}

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
  t: Dictionary,
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
              serverMessageId: event.meta?.assistantMessageId,
            }
          : m
      )
    )
    onAssistantDone?.()
    return
  }

  if (event.type === 'error') {
    const text =
      event.code === 'ai_unavailable' ? t.aiChat.busy : event.message || t.aiChat.streamError
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== aiMsgId) return m
        // Text already shown stays: an error after the answer started means it
        // was cut off, not that the visible part is wrong.
        const content = m.content.trim() ? `${m.content}\n\n${t.aiChat.interrupted}` : text
        return { ...m, content, isStreaming: false }
      })
    )
  }
}

/**
 * The stream closed without a `done` or `error` event (server crash, proxy
 * timeout, dropped connection). Stop the cursor and say the answer was cut
 * off, keeping any text that did arrive — otherwise the bubble blinks forever,
 * blank or half-written, with nothing telling the user to ask again.
 */
function finishInterrupted(
  aiMsgId: string,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  t: Dictionary
) {
  setMessages((prev) =>
    prev.map((m) =>
      m.id === aiMsgId && m.isStreaming
        ? {
            ...m,
            content: m.content.trim()
              ? `${m.content}\n\n${t.aiChat.interrupted}`
              : t.aiChat.interrupted,
            isStreaming: false,
          }
        : m
    )
  )
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
  const { t } = useLanguage()
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
          throw new RequestFailedError(t.aiChat.requestFailed(response.status))
        }

        // 3. Read the SSE stream. Each "block" is terminated with \n\n.
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let finished = false
        const handle = (event: AgentSSEEvent | null) => {
          if (!event) return
          if (event.type === 'done' || event.type === 'error') finished = true
          applyEvent(event, aiMsgId, setMessages, t, onAssistantDone)
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const blocks = buffer.split('\n\n')
          // Last item may be a partial block — keep it for the next read.
          buffer = blocks.pop() ?? ''

          for (const block of blocks) handle(parseSSEBlock(block))
        }

        // Flush any trailing block that wasn't terminated by "\n\n" (e.g. the
        // final `done`/`error` event on chunk boundaries) so we never drop it.
        const tail = buffer.trim()
        if (tail) handle(parseSSEBlock(tail))
        if (!finished) finishInterrupted(aiMsgId, setMessages, t)
      } catch (error) {
        if (error instanceof RequestFailedError) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId ? { ...m, content: error.message, isStreaming: false } : m
            )
          )
        } else {
          // The connection failed (offline, dropped mid-answer): keep what
          // arrived and say it was cut off, rather than showing the browser's
          // raw "network error" in place of the answer.
          finishInterrupted(aiMsgId, setMessages, t)
        }
        console.error('[useChatStream] error:', error)
      } finally {
        setIsTyping(false)
      }
    },
    [conversationId, isTyping, setMessages, onAssistantDone, t]
  )

  return { isTyping, sendMessage }
}
