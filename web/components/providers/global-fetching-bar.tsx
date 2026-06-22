'use client'

import { useIsFetching, useIsMutating } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * Thin top-edge progress bar that appears while any React Query request or
 * mutation is in flight. Gives ambient "syncing" feedback for background
 * reconciles without blocking the UI or flashing a full-page skeleton.
 */
export function GlobalFetchingBar() {
  const fetching = useIsFetching()
  const mutating = useIsMutating()
  const busy = fetching + mutating > 0

  return (
    <AnimatePresence>
      {busy && (
        <motion.div
          key="global-fetching"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden"
          aria-hidden
        >
          <motion.div
            className="h-full w-1/3 rounded-full bg-primary"
            animate={{ x: ['-100%', '400%'] }}
            transition={{ duration: 1, ease: 'easeInOut', repeat: Infinity }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
