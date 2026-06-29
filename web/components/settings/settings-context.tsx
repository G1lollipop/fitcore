'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { SettingsSheet } from './settings-sheet'

interface SettingsContextValue {
  open: () => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

/**
 * Owns the Settings panel's open state and renders the sheet once, so any
 * descendant (sidebar, top-bar) can trigger it via `useSettings().open()`.
 * `onSaved` lets the host refetch dashboard data after profile/goal edits.
 */
export function SettingsProvider({
  children,
  onSaved,
}: {
  children: React.ReactNode
  onSaved?: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const value = useMemo<SettingsContextValue>(() => ({ open }), [open])

  return (
    <SettingsContext.Provider value={value}>
      {children}
      <SettingsSheet open={isOpen} onOpenChange={setIsOpen} onSaved={onSaved} />
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return ctx
}
