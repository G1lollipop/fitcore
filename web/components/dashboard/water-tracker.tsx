'use client'

import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion'
import { Droplets, Plus } from 'lucide-react'
import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { logWater } from '@/app/actions/dashboardActions'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface WaterTrackerProps {
  userId?: string
  initialMl?: number
  goalMl?: number
  incrementMl?: number
  onLogged?: () => void
  className?: string
}

const DEFAULT_INCREMENT = 250

/**
 * Animated water tracker. Optimistically bumps the local fill on tap, then
 * persists via `logWater`. The "wave" is two animated SVG paths offset in
 * phase, riding on top of an inner fill <motion.div> whose height springs
 * to match the current %.
 */
export function WaterTracker({
  userId,
  initialMl = 0,
  goalMl = 2500,
  incrementMl = DEFAULT_INCREMENT,
  onLogged,
  className,
}: WaterTrackerProps) {
  const { toast } = useToast()
  const [ml, setMl] = useState(initialMl)
  const [isPending, startTransition] = useTransition()
  // Track the last `initialMl` we synced from. When the parent refetches
  // the dashboard and hands us a new server value, we adopt it — but only
  // when no optimistic mutation is in flight, so a tap doesn't snap back.
  const lastInitialRef = useRef(initialMl)

  useEffect(() => {
    if (initialMl !== lastInitialRef.current && !isPending) {
      setMl(initialMl)
      lastInitialRef.current = initialMl
    }
  }, [initialMl, isPending])

  const pct = Math.min(100, Math.round((ml / Math.max(1, goalMl)) * 100))
  const reachedGoal = ml >= goalMl

  const mv = useMotionValue(initialMl)
  const rounded = useTransform(mv, (v) => Math.round(v))
  const [displayMl, setDisplayMl] = useState(initialMl)

  useEffect(() => {
    const ctrl = animate(mv, ml, { duration: 0.6, ease: [0.16, 1, 0.3, 1] })
    const unsub = rounded.on('change', (v) => setDisplayMl(v))
    return () => {
      ctrl.stop()
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ml])

  const liters = (displayMl / 1000).toFixed(1)
  const goalLiters = (goalMl / 1000).toFixed(1)

  const handleAdd = () => {
    if (!userId || isPending) return
    const previous = ml
    const optimistic = previous + incrementMl
    setMl(optimistic)
    startTransition(async () => {
      const result = await logWater(userId, incrementMl)
      if (!result.success) {
        setMl(previous)
        toast({
          variant: 'destructive',
          title: '记录失败',
          description: result.error ?? '请稍后再试',
        })
        return
      }
      // Reconcile to the server's authoritative value if returned.
      if (typeof result.newAmount === 'number') {
        setMl(result.newAmount)
        lastInitialRef.current = result.newAmount
      }
      onLogged?.()
    })
  }

  const addDisabled = !userId || isPending

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm',
        className
      )}
    >
      <header className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Droplets size={14} />
          </span>
          <span className="text-sm font-medium text-foreground">饮水追踪</span>
        </div>
      </header>

      <div className="relative mt-4 flex flex-1 items-center justify-center">
        <WaterGlass pct={pct} reachedGoal={reachedGoal} />

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            今日饮水
          </span>
          <p className="font-display mt-0.5 text-3xl font-semibold tabular-nums leading-none text-foreground">
            {liters}
            <span className="ml-1 text-sm font-normal text-muted-foreground">L</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            目标 {goalLiters} L · {pct}%
          </p>
          <AnimatePresence>
            {reachedGoal && (
              <motion.p
                key="reached"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-1 rounded-full bg-accent/30 px-2 py-0.5 text-[10px] font-medium text-accent-foreground"
              >
                目标达成 ✦
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      <motion.button
        type="button"
        onClick={handleAdd}
        disabled={addDisabled}
        whileTap={addDisabled ? undefined : { scale: 0.95 }}
        whileHover={addDisabled ? undefined : { y: -1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        className="relative z-10 mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus size={14} className={cn(isPending && 'animate-pulse')} />
        {isPending ? '记录中…' : `添加 ${incrementMl} ml`}
      </motion.button>
    </motion.section>
  )
}

interface WaterGlassProps {
  pct: number
  reachedGoal: boolean
}

/**
 * The visual "glass". Outer rounded rect clips an inner motion fill, with
 * two SVG wave layers riding the top edge of the fill so the surface
 * appears to oscillate.
 */
function WaterGlass({ pct, reachedGoal }: WaterGlassProps) {
  const id = useId()
  const gradId = `${id}-grad`
  const wave1Id = `${id}-wave1`
  const wave2Id = `${id}-wave2`

  return (
    <div className="relative h-44 w-32 overflow-hidden rounded-[1.5rem] border border-border/60 bg-secondary/40">
      <motion.div
        className="absolute inset-x-0 bottom-0"
        initial={{ height: 0 }}
        animate={{ height: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 110, damping: 18, mass: 0.9 }}
      >
        <div className="relative h-full w-full">
          <svg
            viewBox="0 0 200 18"
            preserveAspectRatio="none"
            className="absolute -top-[16px] left-0 h-[18px] w-full"
            aria-hidden
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={reachedGoal ? 'var(--color-accent)' : 'var(--color-primary)'}
                  stopOpacity="0.95"
                />
                <stop
                  offset="100%"
                  stopColor={reachedGoal ? 'var(--color-accent)' : 'var(--color-primary)'}
                  stopOpacity="0.7"
                />
              </linearGradient>
            </defs>
            <motion.path
              id={wave1Id}
              fill={`url(#${gradId})`}
              animate={{
                d: [
                  'M0 9 Q 25 0 50 9 T 100 9 T 150 9 T 200 9 V18 H0 Z',
                  'M0 9 Q 25 18 50 9 T 100 9 T 150 9 T 200 9 V18 H0 Z',
                  'M0 9 Q 25 0 50 9 T 100 9 T 150 9 T 200 9 V18 H0 Z',
                ],
              }}
              transition={{ duration: 4, ease: 'easeInOut', repeat: Infinity }}
            />
            <motion.path
              id={wave2Id}
              fill={reachedGoal ? 'var(--color-accent)' : 'var(--color-primary)'}
              fillOpacity={0.35}
              animate={{
                d: [
                  'M0 11 Q 25 4 50 11 T 100 11 T 150 11 T 200 11 V18 H0 Z',
                  'M0 11 Q 25 18 50 11 T 100 11 T 150 11 T 200 11 V18 H0 Z',
                  'M0 11 Q 25 4 50 11 T 100 11 T 150 11 T 200 11 V18 H0 Z',
                ],
              }}
              transition={{ duration: 5.5, ease: 'easeInOut', repeat: Infinity, delay: 0.3 }}
            />
          </svg>

          <div
            className={cn(
              'absolute inset-0',
              reachedGoal ? 'bg-accent/70' : 'bg-primary/80'
            )}
          />
        </div>
      </motion.div>

      <div className="pointer-events-none absolute inset-y-0 left-3 flex flex-col justify-between py-3 text-[8px] text-muted-foreground/60">
        {[100, 75, 50, 25].map((tick) => (
          <span key={tick} className="tabular-nums">
            {tick}%
          </span>
        ))}
      </div>
    </div>
  )
}
