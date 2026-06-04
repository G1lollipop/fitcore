'use client'

import { Check, ChevronLeft, ChevronRight, SearchX } from 'lucide-react'
import { categoryLabels, difficultyLabels } from '@/lib/labels'
import type { Database } from '@/lib/database.types'
import type { PaginatedExercises } from '@/app/actions/exercises'
import { EmptyState } from '@/components/ui/empty-state'

type Exercise = Database['public']['Tables']['exercises']['Row']

interface ExerciseListProps {
  exercises: Exercise[]
  loading: boolean
  pagination: PaginatedExercises['pagination'] | null
  currentPage: number
  isSelected: (id: string) => boolean
  onToggle: (exercise: Exercise) => void
  onPageChange: (page: number) => void
  onClearFilters?: () => void
  hasActiveFilters?: boolean
}

/**
 * Paginated grid of selectable exercise cards. Renders one of three states:
 * loading (spinner), empty (with optional clear-filters CTA), or the grid
 * with pagination controls below it.
 */
export function ExerciseList({
  exercises,
  loading,
  pagination,
  currentPage,
  isSelected,
  onToggle,
  onPageChange,
  onClearFilters,
  hasActiveFilters,
}: ExerciseListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (exercises.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="没有找到匹配的动作"
        description={hasActiveFilters ? '试着放宽筛选条件，或清空后重新搜索' : '换个关键词再试试'}
        size="inset"
      >
        {hasActiveFilters && onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex items-center gap-1 rounded-xl border border-border bg-secondary/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            清除筛选条件
          </button>
        )}
      </EmptyState>
    )
  }

  // Bounds-checked page change. Lifted from the original `goToPage`.
  const handlePageChange = (page: number) => {
    if (!pagination) return
    if (page < 1 || page > pagination.totalPages) return
    onPageChange(page)
  }

  return (
    <>
      <div className="grid gap-2">
        {exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            selected={isSelected(exercise.id)}
            onToggle={() => onToggle(exercise)}
          />
        ))}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={pagination.totalPages}
          hasMore={pagination.hasMore}
          onPageChange={handlePageChange}
        />
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

interface ExerciseCardProps {
  exercise: Exercise
  selected: boolean
  onToggle: () => void
}

function ExerciseCard({ exercise, selected, onToggle }: ExerciseCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`w-full p-3 rounded-xl border cursor-pointer text-left transition-all ${
        selected
          ? 'bg-primary/10 border-primary'
          : 'bg-secondary border-border hover:border-primary/50'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-foreground text-sm truncate">{exercise.name}</h4>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">
              {categoryLabels[exercise.category] || exercise.category}
            </span>
          </div>
          {exercise.name_en && (
            <p className="text-xs text-muted-foreground mt-0.5">{exercise.name_en}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 rounded-lg bg-primary/10 text-primary">
              {difficultyLabels[exercise.difficulty] || exercise.difficulty}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-lg bg-secondary text-muted-foreground">
              {exercise.equipment}
            </span>
            {exercise.default_sets && (
              <span className="text-[10px] px-2 py-0.5 rounded-lg bg-secondary text-muted-foreground">
                {exercise.default_sets}组
              </span>
            )}
          </div>
        </div>
        <span
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ml-2 ${
            selected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
          }`}
          aria-hidden
        >
          {selected && <Check className="w-3 h-3 text-primary-foreground" />}
        </span>
      </div>
    </button>
  )
}

interface PaginationProps {
  currentPage: number
  totalPages: number
  hasMore: boolean
  onPageChange: (page: number) => void
}

function Pagination({ currentPage, totalPages, hasMore, onPageChange }: PaginationProps) {
  // Up to 5 visible page numbers, centered on the current page when possible.
  const visiblePages: number[] = (() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (currentPage <= 3) return [1, 2, 3, 4, 5]
    if (currentPage >= totalPages - 2) {
      return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    }
    return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2]
  })()

  return (
    <div className="flex items-center justify-center gap-2 pt-4">
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="p-2 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="上一页"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-1">
        {visiblePages.map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            className={`w-8 h-8 rounded-lg text-sm ${
              page === currentPage ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
            }`}
          >
            {page}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!hasMore}
        className="p-2 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="下一页"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
