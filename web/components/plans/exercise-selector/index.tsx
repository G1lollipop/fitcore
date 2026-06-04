'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useCallback, useState } from 'react'
import { X } from 'lucide-react'
import type { Database } from '@/lib/database.types'
import { ExerciseList } from './exercise-list'
import { FilterBar } from './filter-bar'
import { SelectedList } from './selected-list'
import { useDebounce } from './hooks/use-debounce'
import { useExercises } from './hooks/use-exercises'
import { useFilterOptions } from './hooks/use-filter-options'
import type { SelectedExercise, SortableField } from './types'

// Re-export so the public import path stays `from './exercise-selector'`.
export type { SelectedExercise } from './types'

type Exercise = Database['public']['Tables']['exercises']['Row']

interface ExerciseSelectorProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (exercises: SelectedExercise[]) => void
  initialSelected?: SelectedExercise[]
}

const SEARCH_DEBOUNCE_MS = 300

/**
 * Modal exercise picker with search, filters, paginated grid, drag-to-reorder
 * selection, and per-item sets/reps tuning.
 *
 * Built on `@radix-ui/react-dialog` so when this picker opens *inside* another
 * Radix Dialog/Sheet (e.g. PlanWizard), it joins Radix's DismissableLayer
 * stack as the topmost layer:
 *
 *   • Outside-click only fires for THIS layer; the parent Sheet ignores it
 *   • Focus trap stacks correctly and returns to the parent on close
 *   • `pointer-events` are scoped per-layer, so clicks inside the picker
 *     are not swallowed by the parent's modal scroll-lock
 *
 * Earlier hand-rolled implementations of this component used `position: fixed`
 * siblings of the Sheet, which failed all three of those guarantees and
 * caused the wizard to auto-close on every interaction. Do not revert to
 * a non-Radix overlay without re-checking those interactions.
 *
 * State ownership:
 *   • Modal open/close      → parent (passed in via props)
 *   • Search input value    → here (the debounced version flows to data fetching)
 *   • Filter values         → here
 *   • Working selection     → here (mirrors `initialSelected` until confirmed)
 *   • Page + exercises data → `useExercises`
 *   • Filter dropdowns data → `useFilterOptions`
 *   • DnD context + sensors → `<SelectedList>`
 */
export function ExerciseSelector({
  isOpen,
  onClose,
  onConfirm,
  initialSelected = [],
}: ExerciseSelectorProps) {
  /* ── search (debounced) ───────────────────────────────────────────── */
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput, SEARCH_DEBOUNCE_MS)

  /* ── filter selects ───────────────────────────────────────────────── */
  const [filters, setFilters] = useState({
    muscleGroup: '',
    equipment: '',
    difficulty: '',
  })

  /* ── working selection ────────────────────────────────────────────── */
  const [selectedExercises, setSelectedExercises] = useState<SelectedExercise[]>(initialSelected)

  /* ── data ─────────────────────────────────────────────────────────── */
  const { muscleGroups, equipmentList } = useFilterOptions(isOpen)
  const { exercises, pagination, loading, page, setPage } = useExercises({
    enabled: isOpen,
    filters: { ...filters, search: debouncedSearch },
  })

  const hasActiveFilters = Boolean(
    searchInput || filters.muscleGroup || filters.equipment || filters.difficulty
  )

  /* ── filter handlers ──────────────────────────────────────────────── */
  const handleFilterChange = useCallback(
    (key: 'muscleGroup' | 'equipment' | 'difficulty', value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  const handleClear = useCallback(() => {
    setSearchInput('')
    setFilters({ muscleGroup: '', equipment: '', difficulty: '' })
  }, [])

  /* ── selection handlers ───────────────────────────────────────────── */
  const isSelected = useCallback(
    (id: string) => selectedExercises.some((e) => e.exercise_id === id),
    [selectedExercises]
  )

  const toggleExercise = useCallback((exercise: Exercise) => {
    setSelectedExercises((prev) => {
      if (prev.some((e) => e.exercise_id === exercise.id)) {
        return prev.filter((e) => e.exercise_id !== exercise.id)
      }
      return [
        ...prev,
        {
          exercise_id: exercise.id,
          name: exercise.name,
          name_en: exercise.name_en || undefined,
          target_sets: exercise.default_sets || 3,
          target_reps_min: exercise.default_reps_min || 8,
          target_reps_max: exercise.default_reps_max || 12,
          target_weight_kg: undefined,
          muscle_groups: exercise.muscle_groups,
        },
      ]
    })
  }, [])

  const handleRemove = useCallback((exerciseId: string) => {
    setSelectedExercises((prev) => prev.filter((e) => e.exercise_id !== exerciseId))
  }, [])

  const handleUpdate = useCallback(
    (exerciseId: string, field: SortableField, value: number) => {
      setSelectedExercises((prev) =>
        prev.map((e) => (e.exercise_id === exerciseId ? { ...e, [field]: value } : e))
      )
    },
    []
  )

  /* ── confirm / cancel ─────────────────────────────────────────────── */
  const handleConfirm = () => {
    onConfirm(selectedExercises)
    onClose()
  }

  const handleCancel = () => {
    setSelectedExercises(initialSelected)
    onClose()
  }

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(next) => {
        // Radix routes Esc / overlay-click / programmatic close through here.
        // Treat any "close" as a cancel so the working selection rolls back.
        if (!next) handleCancel()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[100] bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          // Centered modal. z-[101] sits above the parent Sheet (z-50) and
          // its overlay; Radix manages stacking automatically when this
          // dialog opens inside another Radix Dialog/Sheet.
          className="fixed left-1/2 top-1/2 z-[101] flex max-h-[90vh] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">选择动作</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            搜索并挑选动作，拖拽调整顺序，确认后回到训练计划。
          </DialogPrimitive.Description>

          <header className="flex shrink-0 items-center justify-between border-b border-border p-4">
            <div>
              <h3 className="text-lg font-bold text-foreground">选择动作</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                已选择 {selectedExercises.length} 个动作 · 拖拽可排序
              </p>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="rounded-lg p-2 hover:bg-secondary"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </DialogPrimitive.Close>
          </header>

          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 space-y-4 overflow-y-auto border-r border-border p-4">
              <FilterBar
                searchInput={searchInput}
                onSearchInputChange={setSearchInput}
                filters={filters}
                onFilterChange={handleFilterChange}
                onClear={handleClear}
                hasActiveFilters={hasActiveFilters}
                muscleGroups={muscleGroups}
                equipmentList={equipmentList}
                totalCount={pagination?.total}
              />
              <ExerciseList
                exercises={exercises}
                loading={loading}
                pagination={pagination}
                currentPage={page}
                isSelected={isSelected}
                onToggle={toggleExercise}
                onPageChange={setPage}
                onClearFilters={handleClear}
                hasActiveFilters={hasActiveFilters}
              />
            </div>

            <SelectedList
              exercises={selectedExercises}
              onReorder={setSelectedExercises}
              onRemove={handleRemove}
              onUpdate={handleUpdate}
            />
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-border p-4">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedExercises.length === 0}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              确认选择 ({selectedExercises.length})
            </button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
