import { cn } from '@/lib/utils'

/**
 * Loading placeholder block. Uses the `animate-shimmer` keyframe defined in
 * globals.css instead of a binary pulse so it reads as a calm horizontal
 * sweep aligned with the rest of the palette.
 *
 * Pass extra classes to override sizing / radius. `bg-muted` is set as a
 * fallback so the block is still visible if shimmer is disabled by
 * prefers-reduced-motion.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'animate-shimmer rounded-md bg-muted',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
