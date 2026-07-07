// web/components/training/training-mode.tsx
'use client'

import { ArrowLeft, Dumbbell, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { PlanDay } from '@/lib/plans/types'
import {
  createTrainingSession,
  logSet,
  type TrainingSession,
} from '@/lib/training/session-state'
import { finishTrainingSession } from '@/app/actions/training'
import { SetLogger } from './set-logger'
import { RestTimer } from './rest-timer'

interface TrainingModeProps {
  planId: string
  day: PlanDay
  onClose: () => void
  onFinish: () => void
}

export function TrainingMode({ planId, day, onClose, onFinish }: TrainingModeProps) {
  const [session, setSession] = useState<TrainingSession>(() => createTrainingSession(planId, day))
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState(0)
  const [showingRest, setShowingRest] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)

  // Elapsed timer — ticks every second
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - session.startedAt.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [session.startedAt])

  const currentEx = session.exercises[currentExerciseIdx]
  const isLastExercise = currentExerciseIdx >= session.exercises.length - 1
  const isCurrentExerciseDone =
    currentEx.completedSets.length >= (currentEx.exercise.sets ?? 0)

  const handleLogSet = useCallback(
    (weightKg: number | null, reps: number | null) => {
      const nextSet = session.exercises[currentExerciseIdx].completedSets.length + 1
      setSession((s) => logSet(s, currentExerciseIdx, nextSet, weightKg, reps))
      setShowingRest(true)
    },
    [currentExerciseIdx, session.exercises],
  )

  const handleRestComplete = useCallback(() => {
    setShowingRest(false)
    // Auto-advance if current exercise is now complete
    const ex = session.exercises[currentExerciseIdx]
    if (ex.completedSets.length >= (ex.exercise.sets ?? 0) && !isLastExercise) {
      setCurrentExerciseIdx((i) => i + 1)
    }
  }, [currentExerciseIdx, isLastExercise, session.exercises])

  const handleFinish = useCallback(async () => {
    setSaving(true)
    const exercises = session.exercises.map((ex) => ({
      name: ex.exercise.name,
      completedSets: ex.completedSets.map((s) => ({
        setNumber: s.setNumber,
        weightKg: s.weightKg,
        reps: s.reps,
      })),
    }))

    await finishTrainingSession({
      planId: session.planId,
      dayId: session.dayId,
      workoutName: session.dayName,
      startedAt: session.startedAt.toISOString(),
      exercises,
    })

    setSaving(false)
    onFinish()
  }, [session, onFinish])

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <Dumbbell size={16} className="text-primary" />
          <span className="text-sm font-medium text-foreground">{session.dayName}</span>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatElapsed(elapsed)}
        </span>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-4">
        {/* Exercise tabs */}
        <div className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {session.exercises.map((ex, idx) => {
            const done = ex.completedSets.length >= (ex.exercise.sets ?? 0)
            return (
              <button
                key={idx}
                onClick={() => setCurrentExerciseIdx(idx)}
                className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                  idx === currentExerciseIdx
                    ? 'bg-primary text-primary-foreground'
                    : done
                      ? 'bg-primary/10 text-primary'
                      : 'bg-secondary text-muted-foreground'
                }`}
              >
                {done ? '✓ ' : ''}
                {ex.exercise.name}
              </button>
            )
          })}
        </div>

        {/* Current exercise detail */}
        <div className="mt-4">
          <h2 className="font-display text-lg text-foreground">{currentEx.exercise.name}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Target: {currentEx.exercise.sets} sets
            {currentEx.exercise.reps_min != null &&
              ` × ${currentEx.exercise.reps_min}${currentEx.exercise.reps_max != null ? `-${currentEx.exercise.reps_max}` : ''} reps`}
            {currentEx.exercise.weight != null && ` @ ${currentEx.exercise.weight}kg`}
          </p>

          <div className="mt-4">
            <SetLogger
              exerciseName={currentEx.exercise.name}
              targetSets={currentEx.exercise.sets ?? 1}
              targetWeight={currentEx.exercise.weight}
              targetRepsMin={currentEx.exercise.reps_min}
              targetRepsMax={currentEx.exercise.reps_max}
              completedSets={currentEx.completedSets}
              onLogSet={handleLogSet}
            />
          </div>
        </div>

        {/* Rest timer — animated in/out */}
        <AnimatePresence>
          {showingRest && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-4"
            >
              <RestTimer onSkip={handleRestComplete} onComplete={handleRestComplete} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Next exercise hint */}
        {isCurrentExerciseDone && !showingRest && !isLastExercise && (
          <button
            onClick={() => setCurrentExerciseIdx((i) => i + 1)}
            className="mt-4 w-full rounded-xl bg-primary/10 py-3 text-center text-sm font-medium text-primary hover:bg-primary/15 transition-colors"
          >
            Next: {session.exercises[currentExerciseIdx + 1].exercise.name} →
          </button>
        )}
      </div>

      {/* ── Finish footer ── */}
      <div className="shrink-0 px-4 pb-6 pt-2">
        <button
          onClick={handleFinish}
          disabled={saving}
          className="w-full rounded-xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {saving ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Saving...
            </span>
          ) : (
            'Finish Training'
          )}
        </button>
      </div>
    </motion.div>
  )
}
