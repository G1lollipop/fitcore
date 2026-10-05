// web/components/training/set-logger.tsx
'use client'

import { Check, Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { CompletedSet } from '@/lib/training/session-state'

interface SetLoggerProps {
  exerciseName: string
  targetSets: number
  targetWeight?: number | null
  targetRepsMin?: number | null
  targetRepsMax?: number | null
  completedSets: CompletedSet[]
  onLogSet: (setNumber: number, weightKg: number | null, reps: number | null) => void
  onRemoveSet?: (setNumber: number) => void
}

function SetRowInput({
  setNumber,
  isExtra,
  targetWeight,
  targetRepsMin,
  onRemove,
  onConfirm,
}: {
  setNumber: number
  isExtra: boolean
  targetWeight?: number | null
  targetRepsMin?: number | null
  onRemove?: () => void
  onConfirm: (weightKg: number | null, reps: number | null) => void
}) {
  const [weight, setWeight] = useState(targetWeight?.toString() ?? '')
  const [reps, setReps] = useState(targetRepsMin?.toString() ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const w = weight ? Number(weight) : null
    const r = reps ? Number(reps) : null
    if (w === null && r === null) return
    onConfirm(w, r)
  }

  const label = isExtra ? `Set ${setNumber} · extra` : `Set ${setNumber}`

  return (
    <form
      onSubmit={handleSubmit}
      data-set-number={setNumber}
      className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/40 px-3 py-2"
    >
      <span className="text-[11px] font-medium text-muted-foreground w-20 shrink-0">
        {label}
      </span>
      <input
        type="number"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        placeholder="kg"
        className="w-14 rounded-md border border-border/50 bg-background px-1.5 py-1 text-center text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="text-[11px] text-muted-foreground">×</span>
      <input
        type="number"
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        placeholder="reps"
        className="w-14 rounded-md border border-border/50 bg-background px-1.5 py-1 text-center text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="submit"
        className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <Check size={14} />
      </button>
      {onRemove && (
        <button
          type="button"
          aria-label="Remove set"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <X size={12} />
        </button>
      )}
    </form>
  )
}

function CompletedSetRow({
  set,
  onRemove,
}: {
  set: CompletedSet
  onRemove?: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 group">
      <Check size={14} className="text-primary shrink-0" />
      <span className="text-[11px] font-medium text-muted-foreground w-20 shrink-0">
        Set {set.setNumber}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums flex-1">
        {set.weightKg != null && `${set.weightKg}kg`}
        {set.weightKg != null && set.reps != null && ' × '}
        {set.reps != null && `${set.reps} reps`}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="shrink-0 flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

export function SetLogger({
  exerciseName: _exerciseName,
  targetSets,
  targetWeight,
  targetRepsMin,
  targetRepsMax: _targetRepsMax,
  completedSets,
  onLogSet,
  onRemoveSet,
}: SetLoggerProps) {
  const [extraSlotIds, setExtraSlotIds] = useState<string[]>([])

  const baseRows = Math.max(targetSets, completedSets.length + 1)

  const handleConfirm =
    (setNumber: number) => (weightKg: number | null, reps: number | null) => {
      onLogSet(setNumber, weightKg, reps)
    }

  const isSlotCompleted = (idx: number) => idx < completedSets.length
  const isExtraSlot = (idx: number) => idx >= targetSets

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Target: {targetSets} set{targetSets !== 1 ? 's' : ''}
      </p>

      {Array.from({ length: baseRows }, (_, i) => {
        if (isSlotCompleted(i)) {
          return (
            <CompletedSetRow
              key={i}
              set={completedSets[i]}
              onRemove={onRemoveSet ? () => onRemoveSet(completedSets[i].setNumber) : undefined}
            />
          )
        }
        return (
          <SetRowInput
            key={i}
            setNumber={i + 1}
            isExtra={isExtraSlot(i)}
            targetWeight={targetWeight}
            targetRepsMin={targetRepsMin}
            onConfirm={handleConfirm(i + 1)}
          />
        )
      })}

      {extraSlotIds.map((id, idx) => (
        <SetRowInput
          key={id}
          setNumber={baseRows + idx + 1}
          isExtra
          targetWeight={targetWeight}
          targetRepsMin={targetRepsMin}
          onRemove={() => setExtraSlotIds((ids) => ids.filter((x) => x !== id))}
          onConfirm={handleConfirm(baseRows + idx + 1)}
        />
      ))}

      <button
        type="button"
        onClick={() =>
          setExtraSlotIds((ids) => [...ids, 'extra-' + Date.now() + '-' + ids.length])
        }
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/50 py-2 text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
      >
        <Plus size={12} />
        Add Set
      </button>
    </div>
  )
}
