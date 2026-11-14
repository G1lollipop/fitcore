// web/components/training/training-mode.tsx
'use client'

import { ArrowLeft, Dumbbell, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useT } from '@/lib/i18n/provider'
import type { PlanDay } from '@/lib/plans/types'
import {
  createTrainingSession,
  logSet,
  removeSet,
  findResumableTrainingSession,
  saveTrainingSession,
  clearTrainingSession,
  clearTrainingSessionIfSaved,
  type TrainingSession,
} from '@/lib/training/session-state'
import { finishTrainingSession } from '@/app/actions/training'
import { ActionError } from '@/lib/errors'
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
  const t = useT()

  const [resumed] = useState(() =>
    findResumableTrainingSession({ userId, planId, dayId, date: today })
  )
  // The date this session is stored under. A draft started before the app's
  // time zone changed sits under the old zone's date; it keeps living there,
  // so resuming it never writes over whatever is stored for today.
  const storageDate = resumed?.legacy ? resumed.date : today
  const [session, setSession] = useState<TrainingSession>(
    () => resumed?.session ?? createTrainingSession(planId, day)
  )
  const [showingRest, setShowingRest] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<'failed' | 'conflict' | null>(null)
  const sessionRef = useRef(session)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Keep sessionRef in sync with latest session
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  // Persist session to localStorage on every change
  useEffect(() => {
    saveTrainingSession(session, { userId, planId, dayId, date: storageDate })
  }, [session, userId, planId, dayId, storageDate])

  // Elapsed timer — ticks every second
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - session.startedAt.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [session.startedAt])

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
    setSaveError(null)

    // The snapshot the server has confirmed it stores, once that is also
    // everything logged on this screen.
    let confirmed: TrainingSession | null = null
    let problem: 'failed' | 'conflict' = 'failed'
    try {
      // Sets can still be logged or removed while a save is in flight, so a
      // confirmed save is only the end if nothing changed since it was sent.
      // Otherwise save again with the newer snapshot.
      for (;;) {
        const snapshot = sessionRef.current
        const res = await finishTrainingSession({
          // The session's own id: a retry resends it, so the server rewrites the
          // same workout instead of adding a duplicate.
          requestId: snapshot.requestId,
          // Orders this snapshot against any other save of the session.
          revision: snapshot.revision,
          planId: snapshot.planId,
          workoutName: snapshot.dayName,
          startedAt: snapshot.startedAt.toISOString(),
          exercises: snapshot.exercises.map((ex) => ({
            name: ex.exercise.name,
            completedSets: ex.completedSets.map((s) => ({
              setNumber: s.setNumber,
              weightKg: s.weightKg,
              reps: s.reps,
            })),
          })),
        })
        if (!res.success) {
          // The server holds a different save of this session and kept it.
          if (res.error === ActionError.SAVE_CONFLICT) problem = 'conflict'
          break
        }
        // Only a confirmation of the snapshot that was sent counts. A reply
        // about any other revision — even the one now on screen — says
        // nothing about what was submitted here.
        if (res.revision !== snapshot.revision) break
        // Saved, and nothing has changed since it was sent: done.
        if (sessionRef.current.revision === snapshot.revision) {
          confirmed = snapshot
          break
        }
      }
    } catch (err) {
      console.error('[TrainingMode] finishTrainingSession threw:', err)
    }
    setSaving(false)

    if (!confirmed) {
      // Keep the locally persisted session until the server confirms the whole
      // save (summary + every set, one transaction). The logged sets are the
      // user's work, so anything short of that leaves them in place to retry.
      setSaveError(problem)
      return
    }

    // Clears only the exact snapshot that was confirmed. If the stored session
    // is anything else (this screen was closed and the session resumed while
    // the save was in flight, or another tab holds its own copy), it stays.
    const cleared = clearTrainingSessionIfSaved(
      { userId, planId, dayId, date: storageDate },
      confirmed
    )
    // A screen that was closed mid-save must not close the one that resumed
    // the session and is still showing sets this save did not cover.
    if (!cleared && !mountedRef.current) return
    onFinish()
  }, [userId, planId, dayId, storageDate, onFinish])

  const handleDiscard = useCallback(() => {
    if (!confirm(t.training.mode.discardConfirm)) return
    clearTrainingSession({ userId, planId, dayId, date: storageDate })
    onClose()
  }, [userId, planId, dayId, storageDate, onClose, t])

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
          {t.training.mode.back}
        </button>
        <div className="flex items-center gap-2">
          <Dumbbell size={16} className="text-primary" />
          <span className="text-sm font-medium text-foreground">{session.dayName}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums text-muted-foreground">
            {formatElapsed(elapsed)}
          </span>
          <button
            onClick={handleDiscard}
            className="text-sm font-medium text-destructive/80 hover:text-destructive"
          >
            {t.training.mode.exit}
          </button>
        </div>
      </div>

      {/* ── All exercises stacked vertically (scrollable) ── */}
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
      </div>

      {/* ── Rest timer — always visible (outside scroll, above finish) ── */}
      <AnimatePresence>
        {showingRest && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="shrink-0 px-4 pb-2"
          >
            <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2">
              <RestTimer onSkip={handleRestComplete} onComplete={handleRestComplete} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Finish footer ── */}
      <div className="shrink-0 px-4 pb-6 pt-2">
        {saveError && (
          <p role="alert" className="mb-2 text-center text-xs font-medium text-destructive">
            {saveError === 'conflict' ? t.training.mode.saveConflict : t.training.mode.saveFailed}
          </p>
        )}
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
