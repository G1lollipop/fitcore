'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'

interface MealPhotoContextValue {
  /** Trigger the meal-photo file picker (opened by the registered widget). */
  openPicker: () => void
  /** The MealPhotoUpload widget registers its picker opener here on mount. */
  registerOpener: (fn: (() => void) | null) => void
}

const MealPhotoContext = createContext<MealPhotoContextValue | null>(null)

/**
 * Decouples the meal-photo file picker from its FAB so the unified action
 * dock can trigger it. The `MealPhotoUpload` widget still owns the picker +
 * parsing pipeline; it just registers an opener here instead of rendering
 * its own floating button.
 */
export function MealPhotoProvider({ children }: { children: ReactNode }) {
  const opener = useRef<(() => void) | null>(null)

  const registerOpener = useCallback((fn: (() => void) | null) => {
    opener.current = fn
  }, [])

  const openPicker = useCallback(() => {
    opener.current?.()
  }, [])

  const value = useMemo(
    () => ({ openPicker, registerOpener }),
    [openPicker, registerOpener]
  )

  return <MealPhotoContext.Provider value={value}>{children}</MealPhotoContext.Provider>
}

export function useMealPhoto(): MealPhotoContextValue {
  const ctx = useContext(MealPhotoContext)
  if (!ctx) throw new Error('useMealPhoto must be used inside <MealPhotoProvider>')
  return ctx
}
