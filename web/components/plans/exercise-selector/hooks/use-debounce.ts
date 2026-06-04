'use client'

import { useEffect, useState } from 'react'

/**
 * Returns a value that lags `value` by `delay` ms. Use it to throttle
 * downstream effects (network requests, expensive recomputations) that
 * shouldn't fire on every keystroke.
 *
 * Usage:
 *   const debounced = useDebounce(searchInput, 300)
 *   useEffect(() => fetch(debounced), [debounced])
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])

  return debounced
}
