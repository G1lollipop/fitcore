'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GlobalFetchingBar } from './global-fetching-bar'

/**
 * App-wide React Query provider.
 *
 * Holds one `QueryClient` per browser session (created lazily in state so it
 * survives re-renders but is never shared across requests on the server).
 * This is the backbone of the new optimistic data layer: mutations patch the
 * cache directly instead of triggering a full `getDashboardData()` refetch,
 * which is what made every log feel like a page reload.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // We seed most queries with server-fetched `initialData` and patch
            // them optimistically, so aggressive background refetching only
            // adds load. Refetch on an explicit invalidate or when stale.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={client}>
      <GlobalFetchingBar />
      {children}
    </QueryClientProvider>
  )
}
