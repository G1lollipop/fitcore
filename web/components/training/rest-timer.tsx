// web/components/training/rest-timer.tsx
'use client'

import { useEffect, useState, useRef } from 'react'

interface RestTimerProps {
  duration?: number  // seconds, default 90
  onSkip: () => void
  onComplete: () => void
}

export function RestTimer({ duration = 90, onSkip, onComplete }: RestTimerProps) {
  const [remaining, setRemaining] = useState(duration)
  const completedRef = useRef(false)

  useEffect(() => {
    if (remaining <= 0) {
      if (!completedRef.current) {
        completedRef.current = true
        onComplete()
      }
      return
    }
    const id = setInterval(() => setRemaining((r) => r - 1), 1000)
    return () => clearInterval(id)
  }, [remaining, onComplete])

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60

  return (
    <div className="flex items-center justify-between rounded-lg bg-primary/5 px-3 py-2">
      <span className="text-xs text-muted-foreground">Rest</span>
      <span className="text-sm font-mono tabular-nums text-foreground">
        {minutes}:{seconds.toString().padStart(2, '0')}
      </span>
      <button
        type="button"
        onClick={onSkip}
        className="text-[11px] font-medium text-primary hover:underline"
      >
        Skip
      </button>
    </div>
  )
}
