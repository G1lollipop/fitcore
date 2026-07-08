// web/components/training/training-mode.tsx
'use client'

import { ArrowLeft, Dumbbell, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { PlanDay } from '@/lib/plans/types'
import {
  createTrainingSession,
  logSet,
  removeSet,
  loadTrainingSession,
  saveTrainingSession,
  clearTrainingSession,
  type TrainingSession,
} from '@/lib/training/session-state'
import { finishTrainingSession } from '@/app/actions/training'
import { getTodayDate } from '@/lib/utils/date'
import { SetLogger } from './set-logger'
import { RestTimer } from './rest-timer'

interface TrainingModeProps {
  planId: string
  userId: string
  day: PlanDay
  onClose: () => void
  onFinish: () => void
}

export function TrainingMode({ planId, userId, day, onClose, onFinish }: TrainingModeProps) {
  const today = getTodayDate()
  const dayId = (day as { id?: string }).id ?? ''

  const [session, setSession] = useState<TrainingSession>(() => {
    const saved = loadTrainingSession({ userId, planId, dayId, date: today })
    return saved ?? createTrainingSession(planId, day)
  })
  const [showingRest, setShowingRest] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)
  const sessionRef = useRef(session)

  // Keep sessionRef in sync with latest session
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  // Persist session to localStorage on every change
  useEffect(() => {
    saveTrainingSession(session, { userId, planId, dayId, date: today })
  }, [session, userId, planId, dayId, today])

  // Elapsed timer — ticks every second
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - session.startedAt.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [session.startedAt])

  const totalSetsLogged = session.exercises.reduce(
    (sum, ex) => sum + ex.completedSets.length,
    0
  )

  const handleLogSet = useCallback(
    (exerciseIdx: number) => (setNumber: number, weightKg: number | null, reps: number | null) => {
      setSession((s) => logSet(s, exerciseIdx, setNumber, weightKg, reps))
      setShowingRest(true)
    },
    [],
  )

  const handleRemoveSet = useCallback(
    (exerciseIdx: number) => (setNumber: number) => {
      setSession((s) => removeSet(s, exerciseIdx, setNumber))
    },
    [],
  )

  const handleRestComplete = useCallback(() => {
    setShowingRest(false)
  }, [])

  const handleFinish = useCallback(async () => {
    setSaving(true)
    const current = sessionRef.current
    const exercises = current.exercises.map((ex) => ({
      name: ex.exercise.name,
      completedSets: ex.completedSets.map((s) => ({
        setNumber: s.setNumber,
        weightKg: s.weightKg,
        reps: s.reps,
      })),
    }))

    await finishTrainingSession({
      planId: current.planId,
      dayId: current.dayId,
      workoutName: current.dayName,
      startedAt: current.startedAt.toISOString(),
      exercises,
    })

    clearTrainingSession({ userId, planId, dayId, date: today })
    setSaving(false)
    onFinish()
  }, [userId, planId, dayId, today, onFinish])

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
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Exit
        </button>
        <div className="flex items-center gap-2">
          <Dumbbell size={16} className="text-primary" />
          <span className="text-sm font-medium text-foreground">{session.dayName}</span>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatElapsed(elapsed)}
        </span>
      </div>

      {/* ── All exercises stacked vertically ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-6">
          {session.exercises.map((ex, idx) => (
            <div key={idx}>
              <h2 className="font-display text-lg text-foreground">{ex.exercise.name}</h2>

              <div className="mt-2">
                <SetLogger
                  exerciseName={ex.exercise.name}
                  targetSets={ex.exercise.sets ?? 1}
                  targetWeight={ex.exercise.weight}
                  targetRepsMin={ex.exercise.reps_min}
                  targetRepsMax={ex.exercise.reps_max}
                  completedSets={ex.completedSets}
                  onLogSet={handleLogSet(idx)}
                  onRemoveSet={handleRemoveSet(idx)}
                />
              </div>
            </div>
          ))}
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
