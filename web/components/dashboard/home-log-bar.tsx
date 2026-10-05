'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Check, CornerDownLeft, Loader2, Mic, PencilLine, RotateCcw } from 'lucide-react'
import { useT } from '@/lib/i18n/provider'
import { tError, type Dictionary } from '@/lib/i18n'
import { quickLog, type QuickLogResult } from '@/app/actions/quickLog'
import { useDashboardActions } from '@/lib/queries/dashboard'
import { useHistoryActions } from '@/lib/queries/history'
import { useMealPhoto } from '@/components/log-form/meal-photo-context'
import { DietLogEditDialog } from '@/components/log-form/diet-log-edit-dialog'
import { useSpeechInput } from '@/lib/hooks/use-speech-input'
import { getTodayDate } from '@/lib/utils/date'
import type { DietLogItem } from '@/app/actions/types'
import { cn } from '@/lib/utils'
import { elapsedLoggingMs, trackLoggingEvent } from '@/lib/analytics/logging-events'

interface HomeLogBarProps {
  userId?: string
  /** Background reconcile after a successful optimistic patch. */
  onLogged?: () => void
  className?: string
}

type Feedback =
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string; retry?: { text: string; requestId: string } }

/**
 * Always-visible natural-language logging bar for the home tab — the product's
 * primary action ("logging is the protagonist").
 *
 * Submitting is fully non-blocking: the input clears and stays usable while an
 * optimistic `pending: true` placeholder is dropped into today's History cache
 * (mirroring the meal-timeline pattern). `quickLog` runs in the background; on
 * success the placeholder is swapped for the parsed food/workout rows and the
 * dashboard rings are patched, on failure it's removed and a retry is offered.
 *
 * A camera button reuses the existing meal-photo picker, and a mic button
 * (auto-hidden when the Web Speech API is unavailable) dictates into the input.
 */
export function HomeLogBar({ userId, onLogged, className }: HomeLogBarProps) {
  const t = useT()
  const { applyQuickLogItems, applyDietLog } = useDashboardActions()
  const history = useHistoryActions()
  const { openPicker } = useMealPhoto()
  const inputRef = useRef<HTMLInputElement>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Text captured when voice input starts, so dictation appends to it.
  const speechBaseRef = useRef('')

  const [text, setText] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [manualOpen, setManualOpen] = useState(false)

  useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    },
    []
  )

  const showFeedback = useCallback((fb: Feedback) => {
    setFeedback(fb)
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    // Keep an actionable retry visible until the user retries or submits
    // something else; an ambiguous server response can arrive after 5 seconds.
    if (fb.kind === 'error' && fb.retry) {
      feedbackTimer.current = null
      return
    }
    feedbackTimer.current = setTimeout(() => setFeedback(null), 5000)
  }, [])

  const submit = useCallback(
    (raw: string, retryRequestId?: string) => {
      const trimmed = raw.trim()
      if (!trimmed) return
      const requestId = retryRequestId ?? crypto.randomUUID()
      const startedAt = performance.now()
      trackLoggingEvent('FitCore Logging Attempt', {
        source: 'text',
        entry_point: 'home_log_bar',
      })
      if (!userId) {
        trackLoggingEvent('FitCore Logging Failed', {
          source: 'text',
          entry_point: 'home_log_bar',
          failure_reason: 'authentication_required',
          elapsed_ms: elapsedLoggingMs(startedAt),
        })
        showFeedback({ kind: 'error', text: t.logForm.quick.loginFirst })
        return
      }

      setFeedback(null)
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current)

      // Clear + keep the input usable immediately — the user can log again
      // without waiting for the model.
      setText('')

      const today = getTodayDate()
      const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const placeholder: DietLogItem = {
        id: tempId,
        food_name: trimmed,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        logged_at: new Date().toISOString(),
        pending: true,
      }
      history.addPendingFood(today, placeholder)
      setPendingCount((c) => c + 1)

      void (async () => {
        let outcomeTracked = false
        try {
          const res = await quickLog(trimmed, requestId)
          if (!res.success) {
            trackLoggingEvent('FitCore Logging Failed', {
              source: 'text',
              entry_point: 'home_log_bar',
              failure_reason: 'request_failed',
              elapsed_ms: elapsedLoggingMs(startedAt),
            })
            outcomeTracked = true
            history.removeFood(today, tempId)
            showFeedback({
              kind: 'error',
              text: tError(t, res.error),
              retry: { text: trimmed, requestId },
            })
            return
          }
          trackLoggingEvent('FitCore Logging Completed', {
            source: 'text',
            entry_point: 'home_log_bar',
            elapsed_ms: elapsedLoggingMs(startedAt),
            item_count: res.items.length,
          })
          outcomeTracked = true
          // Patch the dashboard rings/totals + splice the resolved rows into
          // today's History caches, then reconcile against the server.
          applyQuickLogItems(res.items)
          history.applyResolvedQuickLog(today, tempId, res.items)
          onLogged?.()
          showFeedback({ kind: 'success', text: summarize(res.items, t) })
        } catch (err) {
          if (!outcomeTracked) {
            trackLoggingEvent('FitCore Logging Failed', {
              source: 'text',
              entry_point: 'home_log_bar',
              failure_reason: 'request_failed',
              elapsed_ms: elapsedLoggingMs(startedAt),
            })
          }
          history.removeFood(today, tempId)
          showFeedback({
            kind: 'error',
            text: err instanceof Error ? err.message : t.logForm.quick.tryLater,
            retry: { text: trimmed, requestId },
          })
        } finally {
          setPendingCount((c) => Math.max(0, c - 1))
        }
      })()
    },
    [userId, applyQuickLogItems, history, onLogged, showFeedback, t]
  )

  const speech = useSpeechInput({
    lang: t.common.locale,
    onTranscript: (transcript) => {
      const base = speechBaseRef.current
      setText(base ? `${base} ${transcript}`.trim() : transcript)
    },
    onError: (error) => {
      if (error === 'no-speech' || error === 'aborted') return
      showFeedback({
        kind: 'error',
        text:
          error === 'not-allowed' || error === 'service-not-allowed'
            ? t.logForm.quick.micDenied
            : t.logForm.quick.micError,
      })
    },
  })

  const toggleMic = useCallback(() => {
    if (speech.listening) {
      speech.stop()
      return
    }
    speechBaseRef.current = text.trim()
    speech.start()
    inputRef.current?.focus()
  }, [speech, text])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(text)
    }
  }

  // Manual structured food entry (secondary to the AI path). The dialog inserts
  // the row server-side for today; here we patch the dashboard rings + today's
  // History cache so it shows instantly, then reconcile.
  const handleManualCreated = useCallback(
    (created?: DietLogItem) => {
      if (!created) return
      applyDietLog(created)
      history.addPendingFood(getTodayDate(), created)
      onLogged?.()
      showFeedback({ kind: 'success', text: t.logForm.create.foodAdded })
    },
    [applyDietLog, history, onLogged, showFeedback, t]
  )

  const busy = pendingCount > 0

  return (
    <section
      className={cn(
        'glass glass-highlight relative flex flex-col gap-1.5 overflow-hidden rounded-2xl border-primary/30 bg-primary/[0.05] p-2.5',
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/10 blur-2xl"
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(text)
        }}
        className="relative flex items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 py-2 transition-shadow focus-within:border-primary/60"
      >
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            speech.listening ? t.logForm.quick.micListening : t.logForm.quick.homeSubtitle
          }
          aria-label={t.logForm.quick.homeTitle}
          className="min-w-0 flex-1 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
        />

        {speech.supported && (
          <button
            type="button"
            onClick={toggleMic}
            aria-label={speech.listening ? t.logForm.quick.micStop : t.logForm.quick.micStart}
            aria-pressed={speech.listening}
            className={cn(
              'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
              speech.listening
                ? 'bg-destructive/15 text-destructive'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            <Mic size={15} className={speech.listening ? 'animate-pulse' : undefined} />
          </button>
        )}

        <button
          type="button"
          onClick={() => setManualOpen(true)}
          aria-label={t.logForm.manual.foodAria}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <PencilLine size={15} />
        </button>

        <button
          type="button"
          onClick={openPicker}
          aria-label={t.logForm.quick.photoAria}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Camera size={15} />
        </button>

        <button
          type="submit"
          disabled={!text.trim()}
          aria-label={t.logForm.quick.submit}
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition-colors',
            text.trim()
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-secondary text-muted-foreground'
          )}
        >
          {t.logForm.quick.submit}
          <CornerDownLeft size={12} />
        </button>
      </form>

      {feedback ? (
        <p className="relative truncate px-1 text-[11px]">
          <span
            className={cn(
              'inline-flex items-center gap-1 font-medium',
              feedback.kind === 'success' ? 'text-primary' : 'text-destructive'
            )}
          >
            {feedback.kind === 'success' ? <Check size={11} /> : null}
            {feedback.text}
            {feedback.kind === 'error' && feedback.retry ? (
              <button
                type="button"
                onClick={() => submit(feedback.retry!.text, feedback.retry!.requestId)}
                className="ml-1 inline-flex items-center gap-0.5 font-semibold text-primary hover:underline"
              >
                <RotateCcw size={10} />
                {t.logForm.quick.retry}
              </button>
            ) : null}
          </span>
        </p>
      ) : busy ? (
        <p className="relative truncate px-1 text-[11px]">
          <span className="inline-flex items-center gap-1 font-medium text-primary">
            <Loader2 size={11} className="animate-spin" />
            {t.logForm.quick.homeSubmitting}
          </span>
        </p>
      ) : null}

      <DietLogEditDialog
        mode="create"
        open={manualOpen}
        dateStr={getTodayDate()}
        onClose={() => setManualOpen(false)}
        onSuccess={handleManualCreated}
      />
    </section>
  )
}

function summarize(items: QuickLogResult[], t: Dictionary): string {
  const parts: string[] = []
  const foods = items.filter(
    (i): i is Extract<QuickLogResult, { kind: 'food' }> => i.kind === 'food'
  )
  const workouts = items.filter(
    (i): i is Extract<QuickLogResult, { kind: 'workout' }> => i.kind === 'workout'
  )
  if (foods.length) {
    const total = foods.reduce((acc, f) => acc + f.calories, 0)
    parts.push(t.logForm.quick.summaryFood(foods.length, total))
  }
  if (workouts.length) {
    const total = workouts.reduce((acc, w) => acc + w.caloriesBurned, 0)
    parts.push(t.logForm.quick.summaryWorkout(workouts.length, total))
  }
  return `${t.logForm.quick.logged} · ${parts.join(' · ')}`
}
