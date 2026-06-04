'use client'

import { useEffect, useState } from 'react'
import { getEquipmentList, getMuscleGroups } from '@/app/actions/exercises'

interface UseFilterOptionsResult {
  muscleGroups: string[]
  equipmentList: string[]
}

/**
 * Loads the muscle-group and equipment dropdown options when the selector
 * first opens. Both fetches run in parallel; failures are logged and the
 * affected dropdown stays empty (graceful degradation).
 *
 * Cleans up via a `cancelled` flag so an unmount mid-flight doesn't fire
 * a state update on an unmounted component.
 */
export function useFilterOptions(enabled: boolean): UseFilterOptionsResult {
  const [muscleGroups, setMuscleGroups] = useState<string[]>([])
  const [equipmentList, setEquipmentList] = useState<string[]>([])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    void (async () => {
      try {
        const [mgRes, eqRes] = await Promise.all([getMuscleGroups(), getEquipmentList()])
        if (cancelled) return
        if (mgRes.success && mgRes.data) setMuscleGroups(mgRes.data as string[])
        if (eqRes.success && eqRes.data) setEquipmentList(eqRes.data as string[])
      } catch (err) {
        console.error('加载筛选选项失败:', err)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled])

  return { muscleGroups, equipmentList }
}
