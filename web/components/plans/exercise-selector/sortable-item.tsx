'use client'

import { GripVertical, Minus } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SelectedExercise, SortableField } from './types'

interface SortableItemProps {
  exercise: SelectedExercise
  index: number
  onRemove: () => void
  onUpdate: (field: SortableField, value: number) => void
}

/**
 * One row in the right-hand "已选动作" panel. Provides a drag handle, a
 * remove button, and inline +/- controls for sets and a reps range.
 * Sortable via dnd-kit; visually dims while being dragged.
 */
export function SortableItem({ exercise, index, onRemove, onUpdate }: SortableItemProps) {
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
            aria-label="拖动排序"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs shrink-0">
            {index + 1}
          </span>
          <span className="font-medium text-foreground text-sm truncate">{exercise.name}</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded hover:bg-destructive/10"
          aria-label="移除"
        >
          <Minus className="w-4 h-4 text-muted-foreground group-hover:text-destructive shrink-0" />
        </button>
      </div>

      <div className="flex items-center gap-3 mt-2 ml-10">
        <SetsCounter
          value={exercise.target_sets}
          onChange={(v) => onUpdate('target_sets', v)}
        />
        <RepsRange
          min={exercise.target_reps_min}
          max={exercise.target_reps_max}
          onChangeMin={(v) => onUpdate('target_reps_min', v)}
          onChangeMax={(v) => onUpdate('target_reps_max', v)}
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
}

function SetsCounter({ value, onChange }: SetsCounterProps) {
  return (
    <div className="flex items-center gap-1">
      <StepButton sign="-" onClick={() => onChange(Math.max(1, value - 1))} />
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(1, parseInt(e.target.value) || 1))}
        className="w-8 h-5 text-center text-xs bg-secondary rounded border-none focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
      <StepButton sign="+" onClick={() => onChange(value + 1)} />
      <span className="text-xs text-muted-foreground ml-0.5">组</span>
    </div>
  )
}

interface RepsRangeProps {
  min: number
  max: number
  onChangeMin: (v: number) => void
  onChangeMax: (v: number) => void
}

function RepsRange({ min, max, onChangeMin, onChangeMax }: RepsRangeProps) {
  return (
    <div className="flex items-center gap-1">
      <StepButton sign="-" onClick={() => onChangeMin(Math.max(1, min - 1))} />
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
      <StepButton sign="+" onClick={() => onChangeMax(max + 1)} />
      <span className="text-xs text-muted-foreground ml-0.5">次</span>
    </div>
  )
}

interface StepButtonProps {
  sign: '-' | '+'
  onClick: () => void
}

function StepButton({ sign, onClick }: StepButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-5 h-5 rounded bg-secondary flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary text-xs"
      aria-label={sign === '-' ? '减少' : '增加'}
    >
      {sign === '-' ? '−' : '+'}
    </button>
  )
}
