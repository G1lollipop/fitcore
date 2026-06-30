'use client'

import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useQuickLog } from '@/hooks/use-quick-log'
import { useT } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'

function useIsMac() {
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform))
  }, [])
  return isMac
}

/**
 * Desktop "⌘K" pill that lives in the TopBar. Looks like a search-style
 * shortcut hint until clicked, then opens the floating command bar.
 */
export function QuickLogTriggerPill({ className }: { className?: string }) {
  const { setOpen } = useQuickLog()
  const isMac = useIsMac()
  const t = useT()

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={t.logForm.trigger.openQuickLog}
      className={cn(
        'group hidden md:inline-flex items-center gap-2 h-9 pl-2 pr-1.5 rounded-lg',
        'border border-border bg-card text-muted-foreground',
        'transition-all hover:text-foreground hover:border-primary/40 hover:bg-secondary/60',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        className
      )}
    >
      <Sparkles size={14} className="text-primary" />
      <span className="text-xs">{t.logForm.trigger.quickLog}</span>
      <kbd className="ml-1 inline-flex h-5 items-center gap-0.5 rounded border border-border bg-background px-1.5 font-sans text-[10px] font-medium text-muted-foreground group-hover:text-foreground">
        <span className="text-[11px] leading-none">{isMac ? '⌘' : 'Ctrl'}</span>
        <span>K</span>
      </kbd>
    </button>
  )
}
