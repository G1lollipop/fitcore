// web/components/training/set-logger.tsx
'use client'

import { Check } from 'lucide-react'
import { useState } from 'react'
import type { CompletedSet } from '@/lib/training/session-state'

interface SetLoggerProps {
  exerciseName: string
  targetSets: number
  targetWeight?: number | null
  targetRepsMin?: number | null
  targetRepsMax?: number | null
  completedSets: CompletedSet[]
  onLogSet: (weightKg: number | null, reps: number | null) => void
}

export function SetLogger({
  exerciseName: _exerciseName,
  targetSets,
  targetWeight,
  targetRepsMin,
  targetRepsMax,
  completedSets,
  onLogSet,
}: SetLoggerProps) {
  const [weight, setWeight] = useState(targetWeight?.toString() ?? '')
  const [reps, setReps] = useState(targetRepsMin?.toString() ?? '')

  const nextSetNumber = completedSets.length + 1
  const isDone = nextSetNumber > targetSets

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const w = weight ? Number(weight) : null
    const r = reps ? Number(reps) : null
    if (w === null && r === null) return
    onLogSet(w, r)
    // Keep weight pre-filled for next set, clear reps
    setReps(targetRepsMin?.toString() ?? '')
  }

  return (
    <div className="space-y-2">
      {/* Completed sets */}
      {completedSets.map((set) => (
        <div key={set.setNumber} className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2">
          <Check size={14} className="text-primary" />
          <span className="text-xs text-foreground">
            Set {set.setNumber}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {set.weightKg != null && `${set.weightKg}kg`}
            {set.weightKg != null && set.reps != null && ' × '}
            {set.reps != null && `${set.reps} reps`}
          </span>
        </div>
      ))}

      {/* Current set input */}
      {!isDone && (
        <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/40 px-3 py-2">
          <span className="text-[11px] font-medium text-muted-foreground">Set {nextSetNumber}</span>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="kg"
            className="w-14 rounded-md border border-border/50 bg-background px-1.5 py-1 text-center text-xs tabular-nums"
          />
          <span className="text-[11px] text-muted-foreground">×</span>
          <input
            type="number"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            placeholder="reps"
            className="w-14 rounded-md border border-border/50 bg-background px-1.5 py-1 text-center text-xs tabular-nums"
          />
          <button
            type="submit"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Check size={14} />
          </button>
        </form>
      )}
    </div>
  )
}
