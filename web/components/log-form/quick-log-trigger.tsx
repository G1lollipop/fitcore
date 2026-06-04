'use client'

import { motion } from 'framer-motion'
import { Plus, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useQuickLog } from '@/hooks/use-quick-log'
import { cn } from '@/lib/utils'

function useIsMac() {
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform))
  }, [])
  return isMac
}

/**
 * Desktop "⌘K" pill that lives in the TopBar. Looks like a search-style
 * shortcut hint until clicked, then opens the floating command bar.
 */
export function QuickLogTriggerPill({ className }: { className?: string }) {
  const { setOpen } = useQuickLog()
  const isMac = useIsMac()

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="打开快捷记录"
      className={cn(
        'group hidden md:inline-flex items-center gap-2 h-9 pl-2 pr-1.5 rounded-lg',
        'border border-border bg-card text-muted-foreground',
        'transition-all hover:text-foreground hover:border-primary/40 hover:bg-secondary/60',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        className
      )}
    >
      <Sparkles size={14} className="text-primary" />
      <span className="text-xs">快捷记录</span>
      <kbd className="ml-1 inline-flex h-5 items-center gap-0.5 rounded border border-border bg-background px-1.5 font-sans text-[10px] font-medium text-muted-foreground group-hover:text-foreground">
        <span className="text-[11px] leading-none">{isMac ? '⌘' : 'Ctrl'}</span>
        <span>K</span>
      </kbd>
    </button>
  )
}

/**
 * Mobile floating action button. Anchored bottom-right above the floating
 * tab pill. Springs in once mounted and pulses subtly to draw attention.
 */
export function QuickLogFab({ className }: { className?: string }) {
  const { setOpen, open } = useQuickLog()

  return (
    <motion.button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="快捷记录"
      initial={{ opacity: 0, scale: 0.6, y: 16 }}
      animate={{ opacity: open ? 0 : 1, scale: open ? 0.6 : 1, y: 0 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      className={cn(
        'fixed right-5 bottom-24 z-40 md:hidden',
        'flex h-14 w-14 items-center justify-center rounded-full',
        'bg-primary text-primary-foreground shadow-lg shadow-primary/30',
        'before:absolute before:inset-0 before:rounded-full before:bg-primary/40 before:animate-ping before:opacity-30',
        className
      )}
    >
      <Plus size={22} className="relative" />
    </motion.button>
  )
}
