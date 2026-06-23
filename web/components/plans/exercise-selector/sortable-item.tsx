'use client'

import { GripVertical, Minus } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useT } from '@/lib/i18n/provider'
import { localizedName, type Dictionary } from '@/lib/i18n'
import type { SelectedExercise, SortableField } from './types'

interface SortableItemProps {
  exercise: SelectedExercise
  index: number
  onRemove: () => void
  onUpdate: (field: SortableField, value: number) => void
}

/**
 * One row in the right-hand "Selected exercises" panel. Provides a drag handle, a
 * remove button, and inline +/- controls for sets and a reps range.
 * Sortable via dnd-kit; visually dims while being dragged.
 */
export function SortableItem({ exercise, index, onRemove, onUpdate }: SortableItemProps) {
  const t = useT()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: exercise.exercise_id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 rounded-xl bg-card border border-border transition-colors group ${
        isDragging ? 'shadow-lg z-10' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="touch-none p-1 rounded hover:bg-secondary cursor-grab active:cursor-grabbing"
            aria-label={t.plans.item.dragSort}
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs shrink-0">
            {index + 1}
          </span>
          <span className="font-medium text-foreground text-sm truncate">{localizedName(t, exercise.name, exercise.name_en)}</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded hover:bg-destructive/10"
          aria-label={t.plans.item.remove}
        >
          <Minus className="w-4 h-4 text-muted-foreground group-hover:text-destructive shrink-0" />
        </button>
      </div>

      <div className="flex items-center gap-3 mt-2 ml-10">
        <SetsCounter
          value={exercise.target_sets}
          onChange={(v) => onUpdate('target_sets', v)}
          t={t}
        />
        <RepsRange
          min={exercise.target_reps_min}
          max={exercise.target_reps_max}
          onChangeMin={(v) => onUpdate('target_reps_min', v)}
          onChangeMax={(v) => onUpdate('target_reps_max', v)}
          t={t}
        />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Inline numeric controls                                                   */
/* -------------------------------------------------------------------------- */

interface SetsCounterProps {
  value: number
  onChange: (v: number) => void
  t: Dictionary
}

function SetsCounter({ value, onChange, t }: SetsCounterProps) {
  return (
    <div className="flex items-center gap-1">
      <StepButton sign="-" onClick={() => onChange(Math.max(1, value - 1))} t={t} />
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(1, parseInt(e.target.value) || 1))}
        className="w-8 h-5 text-center text-xs bg-secondary rounded border-none focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
      <StepButton sign="+" onClick={() => onChange(value + 1)} t={t} />
      <span className="text-xs text-muted-foreground ml-0.5">{t.plans.item.setsUnit}</span>
    </div>
  )
}

interface RepsRangeProps {
  min: number
  max: number
  onChangeMin: (v: number) => void
  onChangeMax: (v: number) => void
  t: Dictionary
}

function RepsRange({ min, max, onChangeMin, onChangeMax, t }: RepsRangeProps) {
  return (
    <div className="flex items-center gap-1">
      <StepButton sign="-" onClick={() => onChangeMin(Math.max(1, min - 1))} t={t} />
      <input
        type="number"
        value={min}
        onChange={(e) => {
          const v = Math.max(1, parseInt(e.target.value) || 1)
          onChangeMin(v)
          // Keep max ≥ min so the range stays valid.
          if (v > max) onChangeMax(v)
        }}
        className="w-8 h-5 text-center text-xs bg-secondary rounded border-none focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
      <span className="text-xs text-muted-foreground">-</span>
      <input
        type="number"
        value={max}
        onChange={(e) => onChangeMax(Math.max(min, parseInt(e.target.value) || min))}
        className="w-8 h-5 text-center text-xs bg-secondary rounded border-none focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
      <StepButton sign="+" onClick={() => onChangeMax(max + 1)} t={t} />
      <span className="text-xs text-muted-foreground ml-0.5">{t.plans.item.repsUnit}</span>
    </div>
  )
}

interface StepButtonProps {
  sign: '-' | '+'
  onClick: () => void
  t: Dictionary
}

function StepButton({ sign, onClick, t }: StepButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-5 h-5 rounded bg-secondary flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary text-xs"
      aria-label={sign === '-' ? t.plans.item.decrease : t.plans.item.increase}
    >
      {sign === '-' ? '−' : '+'}
    </button>
  )
}
