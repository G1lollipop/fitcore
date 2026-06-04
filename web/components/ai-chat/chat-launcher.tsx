'use client'

import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

interface ChatLauncherProps {
  onClick: () => void
}

/**
 * Floating bot button shown when the chat panel is closed. Sits in the
 * bottom-right corner with a soft glow so it reads as an "ambient
 * companion" rather than a primary CTA — matching the Calm Athletic
 * palette's restraint.
 */
export function ChatLauncher({ onClick }: ChatLauncherProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className="group fixed bottom-20 right-4 z-50 flex h-12 items-center gap-2 rounded-2xl border border-border bg-card pl-3 pr-4 shadow-md transition-shadow hover:border-primary/40 hover:shadow-lg md:bottom-6 md:right-6"
      aria-label="打开 AI 教练"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-primary/10 opacity-0 blur-md transition-opacity group-hover:opacity-100"
      />
      <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <Sparkles size={14} />
      </span>
      <span className="font-display text-[13px] font-medium text-foreground">
        AI 教练
      </span>
    </motion.button>
  )
}
