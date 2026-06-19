'use client'

import { Search } from 'lucide-react'
import { useT } from '@/lib/i18n/provider'
import { muscleGroupLabel, equipmentLabel, type Dictionary } from '@/lib/i18n'
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
  const t = useT()
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={t.plans.filter.searchPlaceholder}
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <FilterSelect
          label={t.plans.filter.muscleGroup}
          value={filters.muscleGroup}
          onChange={(v) => onFilterChange('muscleGroup', v)}
          options={muscleGroups.map((mg) => ({ value: mg, label: muscleGroupLabel(t, mg) }))}
          t={t}
        />
        <FilterSelect
          label={t.plans.filter.equipment}
          value={filters.equipment}
          onChange={(v) => onFilterChange('equipment', v)}
          options={equipmentList.map((eq) => ({ value: eq, label: equipmentLabel(t, eq) }))}
          t={t}
        />
        <FilterSelect
          label={t.plans.filter.difficulty}
          value={filters.difficulty}
          onChange={(v) => onFilterChange('difficulty', v)}
          options={[
            { value: 'beginner', label: t.labels.levels.beginner },
            { value: 'intermediate', label: t.labels.levels.intermediate },
            { value: 'advanced', label: t.labels.levels.advanced },
          ]}
          t={t}
        />
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClear}
          className="w-full py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          {t.plans.filter.clearFilters}
        </button>
      )}

      {typeof totalCount === 'number' && (
        <p className="text-xs text-muted-foreground">{t.plans.filter.totalCount(totalCount)}</p>
      )}
    </div>
  )
}

interface FilterSelectProps {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  t: Dictionary
}

function FilterSelect({ label, value, onChange, options, t }: FilterSelectProps) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-2 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
      >
        <option value="">{t.plans.filter.all}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
