'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface AdvancedLogDisclosureProps {
  children: ReactNode
  /** When true, the panel renders open on first paint. Defaults to false. */
  defaultOpen?: boolean
}

/**
 * Collapsible wrapper that demotes the legacy tabbed log form to an
 * "advanced" mode now that the floating Quick Log bar is the primary entry
 * point. Closed by default; remembers nothing across reloads (intentional —
 * the new UX is the default).
 */
export function AdvancedLogDisclosure({ children, defaultOpen = false }: AdvancedLogDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="rounded-2xl border border-border bg-card/60 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/30"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
            <SlidersHorizontal size={13} />
          </span>
          <span>
            <span className="block text-sm font-medium text-foreground">高级模式</span>
            <span className="block text-[11px] text-muted-foreground">
              逐项填写、复制昨日、导入今日计划
            </span>
          </span>
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="text-muted-foreground"
        >
          <ChevronDown size={16} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="adv-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className={cn('overflow-hidden')}
          >
            <div className="border-t border-border/60 p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
