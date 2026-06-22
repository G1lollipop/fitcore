'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { CornerDownLeft, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useQuickLog } from '@/hooks/use-quick-log'
import { useT } from '@/lib/i18n/provider'
import { tError, type Dictionary } from '@/lib/i18n'
import { quickLog, type QuickLogResult } from '@/app/actions/quickLog'
import { useDashboardActions } from '@/lib/queries/dashboard'
import { cn } from '@/lib/utils'

/**
 * Floating "⌘K" command bar.
 *
 * Behavior: the modal closes the instant the user submits — parsing runs
 * in the background and feedback is delivered via the toast manager. This
 * keeps the UI fluid even when the LLM call takes 2-5s; the user can keep
 * working (or queue another entry) without waiting on the dialog.
 */
export function QuickLogBar() {
  const { open, setOpen, userId, onLogged } = useQuickLog()
  const { toast } = useToast()
  const t = useT()
  const { applyQuickLogItems } = useDashboardActions()
  const inputRef = useRef<HTMLInputElement>(null)

  const [text, setText] = useState('')
  const [recents, setRecents] = useState<string[]>([])

  // Reset input + restore focus whenever the dialog re-opens. Recents persist
  // for the lifetime of the page (intentionally local — not in DB).
  useEffect(() => {
    if (!open) return
    setText('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (!userId) {
      toast({ variant: 'destructive', title: t.logForm.quick.notLoggedIn, description: t.logForm.quick.loginFirst })
      return
    }

    // Optimistic UX: close the dialog and stash the input into recents
    // immediately. Parsing happens off the critical path via the toast.
    setOpen(false)
    setRecents((prev) => [trimmed, ...prev.filter((r) => r !== trimmed)].slice(0, 5))

    const loading = toast({ title: t.logForm.quick.parsing, description: t.logForm.quick.parsingDesc(trimmed) })

    void (async () => {
      try {
        const res = await quickLog(trimmed)
        loading.dismiss()
        if (!res.success) {
          toast({ variant: 'destructive', title: t.logForm.quick.logFailed, description: tError(t, res.error) })
          return
        }
        // Patch the dashboard cache with the parsed items so the rings/totals
        // update instantly; `onLogged` then runs a background reconcile.
        applyQuickLogItems(res.items)
        onLogged?.()
        toast({ title: t.logForm.quick.logged, description: summarizeResults(res.items, t) })
      } catch (err) {
        loading.dismiss()
        toast({
          variant: 'destructive',
          title: t.logForm.quick.logFailed,
          description: err instanceof Error ? err.message : t.logForm.quick.tryLater,
        })
      }
    })()
  }, [text, userId, toast, onLogged, setOpen, t, applyQuickLogItems])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-md"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.97 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  'fixed left-1/2 top-[18vh] z-50 w-[min(92vw,640px)] -translate-x-1/2',
                  'glass-strong glass-highlight overflow-hidden rounded-2xl shadow-2xl shadow-foreground/20'
                )}
              >
                <DialogPrimitive.Title className="sr-only">{t.logForm.quick.srTitle}</DialogPrimitive.Title>

                <Header onClose={() => setOpen(false)} t={t} />

                <InputRow
                  inputRef={inputRef}
                  value={text}
                  onChange={setText}
                  onSubmit={handleSubmit}
                  onKeyDown={onKeyDown}
                  disabled={!userId}
                  t={t}
                />

                <Body
                  recents={recents}
                  onPick={(s) => {
                    setText(s)
                    inputRef.current?.focus()
                  }}
                  t={t}
                />

                <Footer t={t} />
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function Header({ onClose, t }: { onClose: () => void; t: Dictionary }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Sparkles size={12} />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t.logForm.quick.srTitle}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t.logForm.quick.close}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <X size={14} />
      </button>
    </div>
  )
}

interface InputRowProps {
  inputRef: React.RefObject<HTMLInputElement | null>
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  disabled?: boolean
  t: Dictionary
}

function InputRow({ inputRef, value, onChange, onSubmit, onKeyDown, disabled, t }: InputRowProps) {
  return (
    <div className="relative px-4 pt-4 pb-3">
      <div
        className={cn(
          'relative flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 transition-shadow',
          'focus-within:border-primary/60 focus-within:shadow-[0_0_0_4px_rgba(0,0,0,0.04)]',
          disabled ? 'opacity-60' : ''
        )}
      >
        <Sparkles size={16} className="shrink-0 text-primary" />
        <input
          ref={inputRef}
          data-quicklog-input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={t.logForm.quick.placeholder}
          className="flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium transition-all',
            value.trim()
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-secondary text-muted-foreground'
          )}
        >
          {t.logForm.quick.submit}
          <CornerDownLeft size={12} />
        </button>
      </div>
    </div>
  )
}

interface BodyProps {
  recents: string[]
  onPick: (s: string) => void
  t: Dictionary
}

function Body({ recents, onPick, t }: BodyProps) {
  return (
    <div className="px-4 pb-4 min-h-[148px]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-3"
      >
        {recents.length > 0 ? (
          <Section title={t.logForm.quick.recentTitle}>
            <ChipRow items={recents} onPick={onPick} />
          </Section>
        ) : (
          <Section title={t.logForm.quick.suggestTitle}>
            <ChipRow items={t.logForm.quick.suggestions} onPick={onPick} />
          </Section>
        )}
        <p className="pt-1 text-[11px] text-muted-foreground">
          {t.logForm.quick.hint}
        </p>
      </motion.div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  )
}

function ChipRow({ items, onPick }: { items: readonly string[]; onPick: (s: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
        >
          {s}
        </button>
      ))}
    </div>
  )
}

function Footer({ t }: { t: Dictionary }) {
  return (
    <div className="flex items-center justify-between border-t border-border/60 bg-secondary/30 px-4 py-2.5 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1">
          <Kbd>↵</Kbd> {t.logForm.quick.footerSubmit}
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Esc</Kbd> {t.logForm.quick.footerClose}
        </span>
      </div>
      <span className="hidden items-center gap-1 sm:inline-flex">
        <Sparkles size={10} className="text-primary" /> {t.logForm.quick.footerAi}
      </span>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-[1.1rem] items-center justify-center rounded border border-border bg-background px-1 text-[10px] font-medium text-foreground">
      {children}
    </kbd>
  )
}

function summarizeResults(items: QuickLogResult[], t: Dictionary): string {
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
  return parts.join(' · ')
}
