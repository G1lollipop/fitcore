'use client'

import { motion } from 'framer-motion'
import { CornerDownLeft } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/provider'
import { buildSlashCommands, filterSlashCommands, type SlashCommand } from './types'

interface SlashMenuProps {
  /** Current input value — used to filter the command list. */
  query: string
  /** Highlighted index in the *filtered* list. */
  highlight: number
  onHighlightChange: (next: number) => void
  onSelect: (cmd: SlashCommand) => void
  onClose: () => void
}

/**
 * Dropdown of available `/`-commands shown above the chat input. Filters
 * by the slash-prefixed token the user is typing and supports keyboard
 * navigation; the input keeps focus the whole time.
 *
 * Filtering is case-insensitive and matches both the literal `cmd` and
 * the human label, so `/计划` finds `/plan`.
 */
export function SlashMenu({
  query,
  highlight,
  onHighlightChange,
  onSelect,
  onClose,
}: SlashMenuProps) {
  const t = useT()
  const commands = useMemo(() => buildSlashCommands(t), [t])
  const filtered = useMemo(() => filterSlashCommands(query, commands), [query, commands])

  // Whenever the filter changes, clamp the highlight back into range so
  // the parent doesn't have to do it.
  useEffect(() => {
    if (filtered.length === 0) return
    if (highlight >= filtered.length) onHighlightChange(0)
  }, [filtered.length, highlight, onHighlightChange])

  if (filtered.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card/95 px-3 py-2 text-[11px] text-muted-foreground shadow-lg backdrop-blur">
        {t.aiChat.noMatchCommands}
      </div>
    )
  }

  return (
    <motion.div
      role="listbox"
      aria-label={t.aiChat.slashAria}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden rounded-2xl border border-border bg-card/95 shadow-lg backdrop-blur"
    >
      <div className="border-b border-border/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {t.aiChat.slashTitle}
      </div>
      <ul className="max-h-64 overflow-y-auto p-1">
        {filtered.map((cmd, idx) => {
          const isActive = idx === highlight
          return (
            <li key={cmd.cmd}>
              <button
                type="button"
                role="option"
                aria-selected={isActive}
                // Prevent the input from blurring when the user clicks here.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => onHighlightChange(idx)}
                onClick={() => {
                  onSelect(cmd)
                  onClose()
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors',
                  isActive ? 'bg-primary/10' : 'hover:bg-secondary/60'
                )}
              >
                <span
                  className={cn(
                    'font-display flex h-8 w-14 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold tabular-nums',
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'bg-secondary text-muted-foreground'
                  )}
                >
                  {cmd.cmd}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {cmd.label}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {cmd.description}
                  </p>
                </div>
                {isActive && (
                  <CornerDownLeft
                    size={12}
                    className="shrink-0 text-primary"
                    aria-hidden
                  />
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="border-t border-border/70 px-3 py-1.5 text-[10px] text-muted-foreground">
        {t.aiChat.slashHint}
      </div>
    </motion.div>
  )
}

