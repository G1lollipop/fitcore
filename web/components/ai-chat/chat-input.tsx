'use client'

import { AnimatePresence } from 'framer-motion'
import { Loader2, Send, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { cn } from '@/lib/utils'
import { SlashMenu } from './slash-menu'
import { filterSlashCommands, SUGGESTED, type SlashCommand } from './types'

interface ChatInputProps {
  input: string
  setInput: (v: string) => void
  onSend: (text: string) => void
  isTyping: boolean
  inputRef: RefObject<HTMLInputElement | null>
}

/**
 * Suggestion chips, slash-command menu, text input, and send button.
 *
 * Slash menu UX:
 *   • Opens whenever the input value starts with `/`.
 *   • ↑/↓ navigates, Enter or Tab selects, Esc dismisses.
 *   • Selecting inserts the command's `template` into the input and parks
 *     the cursor at the end so the user can append details.
 *   • Send is disabled while the menu is open *unless* a non-slash query
 *     is already there (so a user can still send `/foo` literally if no
 *     match exists).
 */
export function ChatInput({ input, setInput, onSend, isTyping, inputRef }: ChatInputProps) {
  const [highlight, setHighlight] = useState(0)
  const wasOpenRef = useRef(false)

  const slashOpen = useMemo(() => input.trimStart().startsWith('/'), [input])
  const filtered = useMemo(() => filterSlashCommands(input), [input])
  const filteredCount = filtered.length

  // Reset the highlight back to the first item every time the menu
  // re-opens, so the user doesn't land on a stale index.
  useEffect(() => {
    if (slashOpen && !wasOpenRef.current) setHighlight(0)
    wasOpenRef.current = slashOpen
  }, [slashOpen])

  const closeMenu = useCallback(() => {
    // Strip the leading slash token so the menu condition (`startsWith('/')`)
    // becomes false. Keep any user-typed argument after the first space.
    const rest = input.replace(/^\s*\/\S*\s*/, '')
    setInput(rest)
  }, [input, setInput])

  const selectCommand = useCallback(
    (cmd: SlashCommand) => {
      setInput(cmd.template)
      // Defer focus so the new value is mounted before we move the caret.
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        const end = cmd.template.length
        el.setSelectionRange(end, end)
      })
    },
    [inputRef, setInput]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (slashOpen && filteredCount > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => (h + 1) % filteredCount)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => (h - 1 + filteredCount) % filteredCount)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const cmd = filtered[highlight]
        if (cmd) {
          e.preventDefault()
          selectCommand(cmd)
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMenu()
        return
      }
    }
    if (e.key === 'Enter' && !slashOpen) onSend(input)
  }

  return (
    <>
      <div className="relative shrink-0">
        <AnimatePresence>
          {slashOpen && (
            <div
              key="slash-menu-wrap"
              className="absolute bottom-full left-3 right-3 z-30 mb-2"
            >
              <SlashMenu
                query={input}
                highlight={highlight}
                onHighlightChange={setHighlight}
                onSelect={selectCommand}
                onClose={closeMenu}
              />
            </div>
          )}
        </AnimatePresence>

        <div className="flex gap-1.5 overflow-x-auto border-t border-border px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SlashChip onClick={() => setInput('/')} disabled={isTyping} />
          {SUGGESTED.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSend(s)}
              disabled={isTyping}
              className="shrink-0 rounded-full border border-border bg-secondary px-2.5 py-1.5 text-[11px] text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 px-3 pb-3 pt-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="问问 AI 教练，输入 / 触发命令…"
          disabled={isTyping}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={slashOpen}
          aria-haspopup="listbox"
          aria-controls={slashOpen ? 'slash-menu' : undefined}
          className={cn(
            'flex-1 rounded-xl border border-border bg-secondary px-3.5 py-2.5 text-sm text-foreground transition-all placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60',
            slashOpen && 'border-primary/40 ring-2 ring-primary/20'
          )}
        />
        <button
          type="button"
          onClick={() => onSend(input)}
          disabled={!input.trim() || isTyping}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all hover:bg-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="发送"
        >
          {isTyping ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>
    </>
  )
}

interface SlashChipProps {
  onClick: () => void
  disabled?: boolean
}

function SlashChip({ onClick, disabled }: SlashChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[11px] font-medium text-primary transition-all hover:bg-primary/15 disabled:opacity-50"
      aria-label="打开 Slash 命令菜单"
    >
      <Sparkles size={10} />/ 命令
    </button>
  )
}

