import { Skeleton } from '@/components/ui/skeleton'

/**
 * Loading skeleton for the dashboard view. Shape mirrors the new bento layout
 * (today hero + water tracker + weekly trend) so the layout doesn't shift on
 * data arrival.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Today hero */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm lg:col-span-8">
          <div className="flex items-start justify-between">
            <div>
              <Skeleton className="h-3 w-12" />
              <Skeleton className="mt-2 h-5 w-40" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="mt-6 grid items-center gap-6 sm:grid-cols-[auto_1fr]">
            <Skeleton className="mx-auto h-56 w-56 rounded-full sm:mx-0" />
            <div className="space-y-3">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          </div>
        </div>

        {/* Water tracker */}
        <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-7 w-7 rounded-lg" />
          </div>
          <Skeleton className="mx-auto mt-4 h-44 w-32 rounded-[1.5rem]" />
          <Skeleton className="mt-4 h-10 w-full rounded-xl" />
        </div>
      </div>

      {/* Weekly trend */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-4 w-24" />
          </div>
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-3 w-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
