'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

interface CoachContextValue {
  isOpen: boolean
  open: (prompt?: string) => void
  close: () => void
  consumePrompt: () => string | null
}

const CoachContext = createContext<CoachContextValue | null>(null)

export function CoachProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const pendingPrompt = useRef<string | null>(null)

  const open = useCallback((prompt?: string) => {
    if (prompt && prompt.trim()) pendingPrompt.current = prompt.trim()
    setIsOpen(true)
  }, [])

  const close = useCallback(() => setIsOpen(false), [])

  const consumePrompt = useCallback(() => {
    const p = pendingPrompt.current
    pendingPrompt.current = null
    return p
  }, [])

  const value = useMemo(
    () => ({ isOpen, open, close, consumePrompt }),
    [isOpen, open, close, consumePrompt]
  )

  return <CoachContext.Provider value={value}>{children}</CoachContext.Provider>
}

export function useCoach(): CoachContextValue {
  const ctx = useContext(CoachContext)
  if (!ctx) throw new Error('useCoach must be used inside <CoachProvider>')
  return ctx
}
