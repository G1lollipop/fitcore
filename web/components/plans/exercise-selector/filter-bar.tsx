'use client'

import { Search } from 'lucide-react'
import { difficultyLabels } from '@/lib/labels'
import type { ExerciseFilters } from './types'

interface FilterBarProps {
  /** Immediate (un-debounced) value bound to the search input. */
  searchInput: string
  onSearchInputChange: (value: string) => void
  filters: Pick<ExerciseFilters, 'muscleGroup' | 'equipment' | 'difficulty'>
  onFilterChange: (key: 'muscleGroup' | 'equipment' | 'difficulty', value: string) => void
  onClear: () => void
  hasActiveFilters: boolean
  muscleGroups: string[]
  equipmentList: string[]
  /** Optional total-count hint shown below the filter row. */
  totalCount?: number
}

/**
 * Search input + 3 dropdown filters + "clear all" affordance + total count.
 * Pure controlled component — owns no state; the orchestrator runs the
 * search value through `useDebounce` before flowing it into data fetching.
 */
export function FilterBar({
  searchInput,
  onSearchInputChange,
  filters,
  onFilterChange,
  onClear,
  hasActiveFilters,
  muscleGroups,
  equipmentList,
  totalCount,
}: FilterBarProps) {
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="搜索动作..."
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <FilterSelect
          label="肌肉群"
          value={filters.muscleGroup}
          onChange={(v) => onFilterChange('muscleGroup', v)}
          options={muscleGroups.map((mg) => ({ value: mg, label: mg }))}
        />
        <FilterSelect
          label="器械"
          value={filters.equipment}
          onChange={(v) => onFilterChange('equipment', v)}
          options={equipmentList.map((eq) => ({ value: eq, label: eq }))}
        />
        <FilterSelect
          label="难度"
          value={filters.difficulty}
          onChange={(v) => onFilterChange('difficulty', v)}
          options={[
            { value: 'beginner', label: difficultyLabels.beginner },
            { value: 'intermediate', label: difficultyLabels.intermediate },
            { value: 'advanced', label: difficultyLabels.advanced },
          ]}
        />
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClear}
          className="w-full py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          清除筛选
        </button>
      )}

      {typeof totalCount === 'number' && (
        <p className="text-xs text-muted-foreground">共 {totalCount} 个动作</p>
      )}
    </div>
  )
}

interface FilterSelectProps {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-2 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
      >
        <option value="">全部</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
