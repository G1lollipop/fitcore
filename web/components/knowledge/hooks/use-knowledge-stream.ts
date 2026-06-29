'use client'

import { useCallback, useRef, useState } from 'react'
import type {
  Citation,
  KnowledgeRetrievalMeta,
  KnowledgeSSEEvent,
  VectorRetrievalBackend,
} from '@/lib/ai/types'
import { useT } from '@/lib/i18n/provider'

export type KnowledgeStatus = 'idle' | 'streaming' | 'done' | 'error'

export interface KnowledgeState {
  status: KnowledgeStatus
  /** The query currently being answered (or last answered). */
  query: string
  answer: string
  sources: Citation[]
  meta: KnowledgeRetrievalMeta | null
  backend: VectorRetrievalBackend | null
  error: string | null
}

const INITIAL: KnowledgeState = {
  status: 'idle',
  query: '',
  answer: '',
  sources: [],
  meta: null,
  backend: null,
  error: null,
}

/** One SSE block = `data: {json}\n\n`. Returns the parsed event or null. */
function parseSSEBlock(block: string): KnowledgeSSEEvent | null {
  const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
  if (!dataLine) return null
  const jsonStr = dataLine.slice(6).trim()
  if (!jsonStr) return null
  try {
    return JSON.parse(jsonStr) as KnowledgeSSEEvent
  } catch {
    return null
  }
}

/**
 * Owns the request lifecycle to `/api/knowledge/search`: paints the `sources`
 * + transparency payload as soon as it arrives, then appends answer tokens as
 * they stream. Mirrors the chat SSE reader (block-by-block, flushing the tail).
 */
export function useKnowledgeStream() {
  const t = useT()
  const [state, setState] = useState<KnowledgeState>(INITIAL)
  const abortRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState(INITIAL)
  }, [])

  const search = useCallback(
    async (rawQuery: string) => {
      const query = rawQuery.trim()
      if (!query) return

      // Cancel any in-flight search before starting a new one.
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setState({ ...INITIAL, status: 'streaming', query })

      const applyEvent = (event: KnowledgeSSEEvent) => {
        if (event.type === 'sources') {
          setState((prev) => ({
            ...prev,
            sources: event.citations ?? [],
            meta: event.retrievalMeta ?? null,
            backend: event.retrievalBackend ?? null,
          }))
        } else if (event.type === 'token') {
          setState((prev) => ({ ...prev, answer: prev.answer + event.content }))
        } else if (event.type === 'done') {
          setState((prev) => ({ ...prev, status: 'done' }))
        } else if (event.type === 'error') {
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: event.message || t.knowledge.error,
          }))
        }
      }

      try {
        const response = await fetch('/api/knowledge/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
          signal: controller.signal,
        })

        if (!response.ok || !response.body) {
          throw new Error(t.knowledge.error)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const blocks = buffer.split('\n\n')
          buffer = blocks.pop() ?? ''

          for (const block of blocks) {
            const event = parseSSEBlock(block)
            if (event) applyEvent(event)
          }
        }

        const tail = buffer.trim()
        if (tail) {
          const event = parseSSEBlock(tail)
          if (event) applyEvent(event)
        }

        // If the stream ended without an explicit done/error, settle it.
        setState((prev) =>
          prev.status === 'streaming' ? { ...prev, status: 'done' } : prev
        )
      } catch (error) {
        if (controller.signal.aborted) return
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: error instanceof Error ? error.message : t.knowledge.error,
        }))
      } finally {
        if (abortRef.current === controller) abortRef.current = null
      }
    },
    [t]
  )

  return { state, search, reset }
}
