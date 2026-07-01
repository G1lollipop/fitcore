'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'fitcore.sidebar.collapsed'

/**
 * Persists the desktop sidebar's collapsed state across sessions.
 *
 * SSR-safe: starts as `false` on the server (sidebar expanded), then
 * hydrates from localStorage on the client. The first paint may flash
 * "expanded" for a single frame on collapsed-by-preference users; that's
 * an acceptable trade for not blocking the initial render on storage I/O.
 */
export function useSidebarCollapsed(initial = false): [boolean, () => void, (next: boolean) => void] {
  const [collapsed, setCollapsed] = useState(initial)

  // Hydrate from localStorage after mount. This intentionally sets state in an
  // effect: the value must be `initial` during SSR/first paint (localStorage is
  // client-only) and adopt the stored preference afterwards — a lazy initializer
  // would cause a hydration mismatch.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe hydration, see above
      if (stored === '1' || stored === '0') setCollapsed(stored === '1')
    } catch {
      // localStorage may be blocked (Safari private mode, etc.) — ignore.
    }
  }, [])

  const setAndPersist = useCallback((next: boolean) => {
    setCollapsed(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  return [collapsed, toggle, setAndPersist]
}
