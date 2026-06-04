'use client'

import { useEffect, useRef, useState } from 'react'
import { getExercises, type PaginatedExercises } from '@/app/actions/exercises'
import type { Database } from '@/lib/database.types'
import type { ExerciseFilters } from '../types'

type Exercise = Database['public']['Tables']['exercises']['Row']

interface UseExercisesArgs {
  /** Skip all fetching while the modal is closed. */
  enabled: boolean
  /** Active filter values. The hook reads `search` *already debounced*. */
  filters: ExerciseFilters
}

interface UseExercisesResult {
  exercises: Exercise[]
  pagination: PaginatedExercises['pagination'] | null
  loading: boolean
  page: number
  setPage: (p: number) => void
}

const PAGE_SIZE = 10

/**
 * Paginated, filtered exercise loader.
 *
 * Behaviour:
 *   • Fetches whenever `enabled`, `page`, or any filter field changes.
 *   • Resets `page` to 1 when filters change (skipped on first mount so
 *     the initial fetch isn't fired twice).
 *   • Cancels stale fetches via a per-effect `cancelled` flag, so a
 *     fast filter-change burst doesn't race the most recent request.
 *
 * Why filter-fields-as-deps (rather than the filters object): the
 * orchestrator passes a fresh object on every render, so depending on
 * the object reference would refetch on every render. Reading the four
 * fields directly gives us value-based equality.
 */
export function useExercises({ enabled, filters }: UseExercisesArgs): UseExercisesResult {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [pagination, setPagination] = useState<PaginatedExercises['pagination'] | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)

  // Reset to page 1 on filter changes, but not on the initial mount —
  // otherwise we'd kick off two fetches when the modal first opens.
  const initialMount = useRef(true)
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false
      return
    }
    setPage(1)
  }, [filters.search, filters.muscleGroup, filters.equipment, filters.difficulty])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)

    void (async () => {
      try {
        const result = await getExercises({
          page,
          pageSize: PAGE_SIZE,
          search: filters.search || undefined,
          muscleGroups: filters.muscleGroup ? [filters.muscleGroup] : undefined,
          equipment: filters.equipment || undefined,
          difficulty: filters.difficulty || undefined,
        })
        if (cancelled) return
        if (result.success && result.data) {
          setExercises(result.data.data)
          setPagination(result.data.pagination)
        }
      } catch (err) {
        console.error('加载动作数据失败:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, page, filters.search, filters.muscleGroup, filters.equipment, filters.difficulty])

  return { exercises, pagination, loading, page, setPage }
}
