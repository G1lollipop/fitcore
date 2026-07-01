'use client'

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getUserSettings } from '@/app/actions/onboarding'

/**
 * Single cache key for the user's settings row (body profile + nutrition
 * targets + water goal). Both the Settings sheet and the Edit-targets dialog
 * read from this one entry so opening either is instant once it's warm.
 */
export const USER_SETTINGS_KEY = ['user-settings'] as const

/** Body profile / targets don't change often, so keep the cache warm. */
const USER_SETTINGS_STALE_TIME = 5 * 60 * 1000

/**
 * Shared React Query for the user's settings. Mount it (or prefetch the key)
 * early so the data is already cached before any settings dialog opens.
 */
export function useUserSettings() {
  return useQuery({
    queryKey: USER_SETTINGS_KEY,
    queryFn: getUserSettings,
    staleTime: USER_SETTINGS_STALE_TIME,
  })
}

/**
 * Warms the shared user-settings cache without subscribing to it. Call this on
 * mount in a long-lived shell (e.g. dashboard-client) so opening the Settings
 * sheet or targets dialog reads straight from cache with no fetch-on-open wait.
 */
export function usePrefetchUserSettings() {
  const qc = useQueryClient()
  return useCallback(() => {
    void qc.prefetchQuery({
      queryKey: USER_SETTINGS_KEY,
      queryFn: getUserSettings,
      staleTime: USER_SETTINGS_STALE_TIME,
    })
  }, [qc])
}

/** Drop the cached settings so the next read refetches (e.g. after a save). */
export function useInvalidateUserSettings() {
  const qc = useQueryClient()
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: USER_SETTINGS_KEY })
  }, [qc])
}
