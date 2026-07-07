'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Check, CornerDownLeft, Loader2, PencilLine, RotateCcw } from 'lucide-react'
import { useT } from '@/lib/i18n/provider'
import { tError, type Dictionary } from '@/lib/i18n'
import { quickLog, type QuickLogFoodResult } from '@/app/actions/quickLog'
import { useDashboardActions } from '@/lib/queries/dashboard'
import { useHistoryActions } from '@/lib/queries/history'
import { useMealPhoto } from '@/components/log-form/meal-photo-context'
import { DietLogEditDialog } from '@/components/log-form/diet-log-edit-dialog'
import { getTodayDate } from '@/lib/utils/date'
import type { DietLogItem } from '@/app/actions/types'
import { cn } from '@/lib/utils'

interface HomeLogBarProps {
  userId?: string
  /** Background reconcile after a successful optimistic patch. */
  onLogged?: () => void
  className?: string
}

type Feedback =
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string; retry?: string }

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
    feedbackTimer.current = setTimeout(() => setFeedback(null), 5000)
  }, [])

  const submit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed) return
      if (!userId) {
        showFeedback({ kind: 'error', text: t.logForm.quick.loginFirst })
        return
      }

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
        try {
          const res = await quickLog(trimmed)
          if (!res.success) {
            history.removeFood(today, tempId)
            showFeedback({ kind: 'error', text: tError(t, res.error), retry: trimmed })
            return
          }
          // Patch the dashboard rings/totals + splice the resolved rows into
          // today's History caches, then reconcile against the server.
          applyQuickLogItems(res.items)
          history.applyResolvedQuickLog(today, tempId, res.items)
          onLogged?.()
          showFeedback({ kind: 'success', text: summarize(res.items, t) })
        } catch (err) {
          history.removeFood(today, tempId)
          showFeedback({
            kind: 'error',
            text: err instanceof Error ? err.message : t.logForm.quick.tryLater,
            retry: trimmed,
          })
        } finally {
          setPendingCount((c) => Math.max(0, c - 1))
        }
      })()
    },
    [userId, applyQuickLogItems, history, onLogged, showFeedback, t]
  )

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
        className="relative flex flex-col gap-1.5"
      >
        {/* Line 1: Camera + Input + Send */}
        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 py-2 transition-shadow focus-within:border-primary/60">
          <button
            type="button"
            onClick={openPicker}
            aria-label="Take meal photo"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
          >
            <Camera size={15} />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t.logForm.quick.homeSubtitle}
            aria-label={t.logForm.quick.homeTitle}
            className="min-w-0 flex-1 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
          />

          {text.trim() && (
            <button
              type="submit"
              aria-label={t.logForm.quick.submit}
              className="inline-flex h-7 shrink-0 items-center justify-center rounded-lg bg-primary px-2 text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <CornerDownLeft size={14} />
            </button>
          )}
        </div>

        {/* Line 2: Manual + quick-add suggestions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
          >
            <PencilLine size={13} />
            Manual
          </button>
          <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {['2 eggs', 'chicken breast', 'protein shake', 'rice bowl'].map((food) => (
              <button
                key={food}
                type="button"
                onClick={() => submit(food)}
                className="shrink-0 rounded-full border border-border/50 bg-card/40 px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {food}
              </button>
            ))}
          </div>
        </div>
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
                onClick={() => submit(feedback.retry as string)}
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

function summarize(items: QuickLogFoodResult[], t: Dictionary): string {
  const total = items.reduce((acc, f) => acc + f.calories, 0)
  return `${t.logForm.quick.logged} · ${t.logForm.quick.summaryFood(items.length, total)}`
}
