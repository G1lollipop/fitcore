'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { QuickLogContext } from '@/hooks/use-quick-log'
import { QuickLogBar } from './quick-log-bar'
import { QuickLogFab } from './quick-log-trigger'

interface QuickLogProviderProps {
  userId?: string
  onLogged?: () => void
  children: ReactNode
}

/**
 * Owns the open/close state for the floating command bar and binds the
 * global ⌘K / Ctrl+K shortcut. Mounts the modal + the mobile FAB once at
 * the shell level so any descendant trigger can call open() via context.
 */
export function QuickLogProvider({ userId, onLogged, children }: QuickLogProviderProps) {
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen((v) => !v), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isModK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')
      if (!isModK) return
      // Ignore ⌘K when the user is typing inside an editable surface unless
      // it's our own input (which lives inside the dialog and is fine).
      const target = e.target as HTMLElement | null
      const inEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if (inEditable && !target?.closest('[data-quicklog-input]')) return
      e.preventDefault()
      setOpen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const value = useMemo(
    () => ({ open, setOpen, toggle, userId, onLogged }),
    [open, toggle, userId, onLogged]
  )

  return (
    <QuickLogContext.Provider value={value}>
      {children}
      <QuickLogBar />
      <QuickLogFab />
    </QuickLogContext.Provider>
  )
}
