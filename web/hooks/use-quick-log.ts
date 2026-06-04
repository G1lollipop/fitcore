'use client'

import { createContext, useContext } from 'react'

export interface QuickLogContextValue {
  open: boolean
  setOpen: (next: boolean) => void
  toggle: () => void
  /** Auth'd user id passed down from the page; undefined while signing in. */
  userId?: string
  /** Optional callback fired after a successful submission (e.g. to refresh dashboard data). */
  onLogged?: () => void
}

export const QuickLogContext = createContext<QuickLogContextValue | null>(null)

export function useQuickLog(): QuickLogContextValue {
  const ctx = useContext(QuickLogContext)
  if (!ctx) {
    throw new Error('useQuickLog must be used inside <QuickLogProvider>')
  }
  return ctx
}
