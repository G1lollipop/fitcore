'use client'

import { Loader2, Send } from 'lucide-react'
import { type RefObject } from 'react'
import { useT } from '@/lib/i18n/provider'

interface ChatInputProps {
  input: string
  setInput: (v: string) => void
  onSend: (text: string) => void
  isTyping: boolean
  inputRef: RefObject<HTMLInputElement | null>
}

/**
 * Suggestion chips, text input, and send button.
 */
export function ChatInput({ input, setInput, onSend, isTyping, inputRef }: ChatInputProps) {
  const t = useT()

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend(input)
    }
  }

  return (
    <>
      <div className="flex gap-1.5 overflow-x-auto border-t border-border/60 bg-background px-3 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {t.aiChat.suggested.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSend(s)}
            disabled={isTyping}
            className="shrink-0 rounded-full border border-border/70 bg-secondary/70 px-3 py-1.5 text-[11px] text-muted-foreground transition-all hover:border-primary/30 hover:bg-secondary hover:text-foreground hover:shadow-sm disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-2 bg-background px-3 pb-3 pt-1">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.aiChat.inputPlaceholder}
            disabled={isTyping}
            className="h-10 w-full rounded-full border border-border bg-secondary pl-4 pr-11 text-sm text-foreground transition-all placeholder:text-muted-foreground focus:border-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => onSend(input)}
            disabled={!input.trim() || isTyping}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none"
            aria-label={t.aiChat.send}
          >
            {isTyping ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </>
  )
}
