'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'fitcore.knowledge.history'
const MAX_ITEMS = 8

/**
 * Lightweight recent-search store backed by localStorage. Intentionally
 * client-only and per-device — knowledge searches are ephemeral and don't
 * warrant a Supabase table / migration.
 */
export function useKnowledgeHistory() {
  const [history, setHistory] = useState<string[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          setHistory(parsed.filter((q): q is string => typeof q === 'string'))
        }
      }
    } catch {
      // Corrupt / unavailable storage — start empty.
    }
  }, [])

  const persist = useCallback((next: string[]) => {
    setHistory(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Ignore quota / privacy-mode failures.
    }
  }, [])

  const add = useCallback(
    (query: string) => {
      const trimmed = query.trim()
      if (!trimmed) return
      // Dedupe (case-insensitive), newest first, capped.
      const next = [
        trimmed,
        ...history.filter((q) => q.toLowerCase() !== trimmed.toLowerCase()),
      ].slice(0, MAX_ITEMS)
      persist(next)
    },
    [history, persist]
  )

  const clear = useCallback(() => persist([]), [persist])

  return { history, add, clear }
}
