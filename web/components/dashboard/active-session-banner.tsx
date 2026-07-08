'use client'

import { Dumbbell, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useT } from '@/lib/i18n/provider'

interface ActiveSessionBannerProps {
  startedAt: Date
  dayName: string
  onResume: () => void
}

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
}

export function ActiveSessionBanner({ startedAt, dayName, onResume }: ActiveSessionBannerProps) {
  const t = useT()
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const update = () => setElapsed(Math.round((Date.now() - startedAt.getTime()) / 1000))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      onClick={onResume}
      className="glass glass-highlight flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:border-primary/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <Dumbbell size={18} className="text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">{t.training.mode.inProgress}</p>
        <p className="truncate text-[11px] text-muted-foreground">{dayName}</p>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
        {formatElapsed(elapsed)}
      </span>
      <Play size={14} className="shrink-0 text-primary" />
    </motion.button>
  )
}
