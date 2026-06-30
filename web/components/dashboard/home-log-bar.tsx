'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, CornerDownLeft, Loader2, PencilLine, RotateCcw } from 'lucide-react'
import { useT } from '@/lib/i18n/provider'
import { tError, type Dictionary } from '@/lib/i18n'
import { quickLog, type QuickLogResult } from '@/app/actions/quickLog'
import { useDashboardActions } from '@/lib/queries/dashboard'
import { cn } from '@/lib/utils'

interface HomeLogBarProps {
  userId?: string
  /** Background reconcile after a successful optimistic patch. */
  onLogged?: () => void
  className?: string
}

type Feedback =
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }

/**
 * Always-visible natural-language logging bar for the home tab — the product's
 * primary action ("logging is the protagonist").
 *
 * Unlike the ⌘K command modal and the AI coach (which opens a chat), this logs
 * inline: one `quickLog` call → optimistic dashboard patch → instant inline
 * confirmation, so meal/workout capture stays under a few seconds without
 * leaving the home screen. Recent entries become one-tap "log again" chips.
 */
export function HomeLogBar({ userId, onLogged, className }: HomeLogBarProps) {
  const t = useT()
  const { applyQuickLogItems } = useDashboardActions()
  const inputRef = useRef<HTMLInputElement>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recents, setRecents] = useState<string[]>([])
  const [feedback, setFeedback] = useState<Feedback | null>(null)

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
    async (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed || submitting) return
      if (!userId) {
        showFeedback({ kind: 'error', text: t.logForm.quick.loginFirst })
        return
      }

      setSubmitting(true)
      setText('')
      setRecents((prev) => [trimmed, ...prev.filter((r) => r !== trimmed)].slice(0, 4))

      try {
        const res = await quickLog(trimmed)
        if (!res.success) {
          showFeedback({ kind: 'error', text: tError(t, res.error) })
          // Restore the text so the user can fix and retry.
          setText(trimmed)
          return
        }
        // Patch the dashboard cache so rings/totals move immediately, then
        // reconcile against the server in the background.
        applyQuickLogItems(res.items)
        onLogged?.()
        showFeedback({ kind: 'success', text: summarize(res.items, t) })
      } catch (err) {
        showFeedback({
          kind: 'error',
          text: err instanceof Error ? err.message : t.logForm.quick.tryLater,
        })
        setText(trimmed)
      } finally {
        setSubmitting(false)
      }
    },
    [submitting, userId, applyQuickLogItems, onLogged, showFeedback, t]
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit(text)
    }
  }

  const chips = recents.length > 0 ? recents : t.logForm.quick.suggestions

  return (
    <section
      className={cn(
        'glass glass-highlight relative flex flex-col gap-2.5 overflow-hidden rounded-2xl border-primary/30 bg-primary/[0.05] p-4',
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/10 blur-2xl"
      />

      <header className="relative flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <PencilLine size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold leading-tight text-foreground">
            {t.logForm.quick.homeTitle}
          </h2>
          <p className="truncate text-[11px] text-muted-foreground">
            {feedback ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1 font-medium',
                  feedback.kind === 'success' ? 'text-primary' : 'text-destructive'
                )}
              >
                {feedback.kind === 'success' ? <Check size={11} /> : null}
                {feedback.text}
              </span>
            ) : (
              t.logForm.quick.homeSubtitle
            )}
          </p>
        </div>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit(text)
        }}
        className="relative flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 transition-shadow focus-within:border-primary/60"
      >
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={submitting}
          placeholder={t.logForm.quick.placeholder}
          aria-label={t.logForm.quick.homeTitle}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={submitting || !text.trim()}
          aria-label={t.logForm.quick.submit}
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition-colors',
            text.trim() && !submitting
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-secondary text-muted-foreground'
          )}
        >
          {submitting ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              {t.logForm.quick.homeSubmitting}
            </>
          ) : (
            <>
              {t.logForm.quick.submit}
              <CornerDownLeft size={12} />
            </>
          )}
        </button>
      </form>

      <div className="relative flex flex-wrap gap-1.5">
        {chips.slice(0, 3).map((chip) => {
          const isRecent = recents.length > 0
          return (
            <button
              key={chip}
              type="button"
              disabled={submitting}
              onClick={() => {
                if (isRecent) {
                  void submit(chip)
                } else {
                  setText(chip)
                  inputRef.current?.focus()
                }
              }}
              title={isRecent ? t.logForm.quick.homeReuse : undefined}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
            >
              {isRecent ? <RotateCcw size={10} className="shrink-0" /> : null}
              <span className="truncate">{chip}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function summarize(items: QuickLogResult[], t: Dictionary): string {
  const parts: string[] = []
  const foods = items.filter((i): i is Extract<QuickLogResult, { kind: 'food' }> => i.kind === 'food')
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
