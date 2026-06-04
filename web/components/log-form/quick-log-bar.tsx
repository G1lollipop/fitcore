'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { CornerDownLeft, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useQuickLog } from '@/hooks/use-quick-log'
import { quickLog, type QuickLogResult } from '@/app/actions/quickLog'
import { cn } from '@/lib/utils'

const SUGGESTIONS = [
  '鸡胸肉 200g',
  '糙米饭 150g + 蒸蛋 2个',
  '深蹲 4x10',
  '跑步 30 分钟',
  '吃了 30g 蛋白粉，做了俯卧撑 50 个',
] as const

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
      toast({ variant: 'destructive', title: '尚未登录', description: '请先登录后再记录' })
      return
    }

    // Optimistic UX: close the dialog and stash the input into recents
    // immediately. Parsing happens off the critical path via the toast.
    setOpen(false)
    setRecents((prev) => [trimmed, ...prev.filter((r) => r !== trimmed)].slice(0, 5))

    const loading = toast({ title: '正在解析', description: `「${trimmed}」` })

    void (async () => {
      try {
        const res = await quickLog(trimmed, userId)
        loading.dismiss()
        if (!res.success) {
          toast({ variant: 'destructive', title: '记录失败', description: res.error })
          return
        }
        onLogged?.()
        toast({ title: '已记录', description: summarizeResults(res.items) })
      } catch (err) {
        loading.dismiss()
        toast({
          variant: 'destructive',
          title: '记录失败',
          description: err instanceof Error ? err.message : '请稍后再试',
        })
      }
    })()
  }, [text, userId, toast, onLogged, setOpen])

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
                  'overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-foreground/20'
                )}
              >
                <DialogPrimitive.Title className="sr-only">快捷记录</DialogPrimitive.Title>

                <Header onClose={() => setOpen(false)} />

                <InputRow
                  inputRef={inputRef}
                  value={text}
                  onChange={setText}
                  onSubmit={handleSubmit}
                  onKeyDown={onKeyDown}
                  disabled={!userId}
                />

                <Body
                  recents={recents}
                  onPick={(s) => {
                    setText(s)
                    inputRef.current?.focus()
                  }}
                />

                <Footer />
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Sparkles size={12} />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Quick Log
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
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
}

function InputRow({ inputRef, value, onChange, onSubmit, onKeyDown, disabled }: InputRowProps) {
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
          placeholder="说说你刚吃了什么 / 练了什么…  比如「鸡胸肉200g + 跑步30分钟」"
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
          记录
          <CornerDownLeft size={12} />
        </button>
      </div>
    </div>
  )
}

interface BodyProps {
  recents: string[]
  onPick: (s: string) => void
}

function Body({ recents, onPick }: BodyProps) {
  return (
    <div className="px-4 pb-4 min-h-[148px]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-3"
      >
        {recents.length > 0 ? (
          <Section title="最近输入">
            <ChipRow items={recents} onPick={onPick} />
          </Section>
        ) : (
          <Section title="试试这些">
            <ChipRow items={SUGGESTIONS as readonly string[]} onPick={onPick} />
          </Section>
        )}
        <p className="pt-1 text-[11px] text-muted-foreground">
          支持一句话同时记录饮食和训练，AI 会自动拆分。提交后可继续操作，结果稍后通过通知告知你。
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

function Footer() {
  return (
    <div className="flex items-center justify-between border-t border-border/60 bg-secondary/30 px-4 py-2.5 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1">
          <Kbd>↵</Kbd> 提交
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Esc</Kbd> 关闭
        </span>
      </div>
      <span className="hidden items-center gap-1 sm:inline-flex">
        <Sparkles size={10} className="text-primary" /> AI 自动识别食物 / 训练
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

function summarizeResults(items: QuickLogResult[]): string {
  const parts: string[] = []
  const foods = items.filter((i): i is Extract<QuickLogResult, { kind: 'food' }> => i.kind === 'food')
  const workouts = items.filter(
    (i): i is Extract<QuickLogResult, { kind: 'workout' }> => i.kind === 'workout'
  )
  if (foods.length) {
    const total = foods.reduce((acc, f) => acc + f.calories, 0)
    parts.push(`${foods.length} 项饮食 (+${total} kcal)`)
  }
  if (workouts.length) {
    const total = workouts.reduce((acc, w) => acc + w.caloriesBurned, 0)
    parts.push(`${workouts.length} 项训练 (−${total} kcal)`)
  }
  return parts.join(' · ')
}
