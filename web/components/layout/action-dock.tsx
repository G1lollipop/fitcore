'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Camera, PencilLine, Plus, X } from 'lucide-react'
import { useState, type ComponentType } from 'react'
import { useCoach } from '@/components/ai-chat/coach-context'
import { useMealPhoto } from '@/components/log-form/meal-photo-context'
import { useQuickLog } from '@/hooks/use-quick-log'
import { useT } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'

interface DockAction {
  key: string
  label: string
  icon: ComponentType<{ size?: number; className?: string }>
  onClick: () => void
  /** Visually emphasised (the AI coach is the primary hub action). */
  primary?: boolean
}

/**
 * Unified floating action dock.
 *
 * Replaces the three competing bottom-right buttons (coach launcher, quick-log
 * FAB, meal-photo FAB) with one speed-dial. The AI coach is the primary,
 * always-visible action — reflecting its role as the product's hub — and a
 * tap expands the secondary capture actions (quick log, meal photo).
 */
export function ActionDock() {
  const t = useT()
  const coach = useCoach()
  const { setOpen: setQuickLogOpen } = useQuickLog()
  const { openPicker } = useMealPhoto()
  const [expanded, setExpanded] = useState(false)

  // Hide the dock entirely while the coach panel is open (it has its own chrome).
  if (coach.isOpen) return null

  const secondary: DockAction[] = [
    {
      key: 'quicklog',
      label: t.logForm.trigger.quickLog,
      icon: PencilLine,
      onClick: () => {
        setExpanded(false)
        setQuickLogOpen(true)
      },
    },
    {
      key: 'photo',
      label: t.logForm.photo.captureAria,
      icon: Camera,
      onClick: () => {
        setExpanded(false)
        openPicker()
      },
    },
  ]

  return (
    <div className="fixed bottom-24 right-5 z-50 flex flex-col items-end gap-3 md:bottom-6 md:right-6">
      <AnimatePresence>
        {expanded &&
          secondary.map((action, i) => (
            <motion.button
              key={action.key}
              type="button"
              onClick={action.onClick}
              initial={{ opacity: 0, y: 12, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.8 }}
              transition={{ duration: 0.18, delay: i * 0.04 }}
              className="glass group flex items-center gap-2 rounded-full py-2 pl-3 pr-2 shadow-md"
            >
              <span className="text-[13px] font-medium text-foreground">{action.label}</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground">
                <action.icon size={16} />
              </span>
            </motion.button>
          ))}
      </AnimatePresence>

      <div className="flex items-center gap-3">
        {/* Logging speed-dial: tap to reveal Quick Log + meal photo. */}
        <motion.button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={t.logForm.trigger.quickLog}
          whileTap={{ scale: 0.92 }}
          animate={{ rotate: expanded ? 45 : 0 }}
          className={cn(
            'flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg shadow-primary/30',
            'bg-primary text-primary-foreground transition-shadow hover:shadow-xl'
          )}
        >
          {expanded ? <X size={20} /> : <Plus size={20} />}
        </motion.button>
      </div>
    </div>
  )
}
