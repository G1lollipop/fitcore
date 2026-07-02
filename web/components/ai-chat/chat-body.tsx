'use client'

import { ArrowUpRight, Bot } from 'lucide-react'
import type { RefObject } from 'react'
import { useT } from '@/lib/i18n/provider'
import { KNOWLEDGE_TOPICS } from '@/components/knowledge/starters'
import { ChatInput } from './chat-input'
import { ChatMessage } from './chat-message'
import { TypingIndicator } from './typing-indicator'
import type { Message } from './types'

/**
 * One seed question per topic, surfaced as one-tap starters in the coach's
 * empty state. This carries over the discoverability the standalone Knowledge
 * tab used to provide now that knowledge Q&A lives inside the coach.
 */
const COACH_STARTERS = KNOWLEDGE_TOPICS.slice(0, 4).map((topic) => topic.questions[0])

interface ChatBodyProps {
  messages: Message[]
  isTyping: boolean
  input: string
  setInput: (v: string) => void
  onSend: (text: string) => void
  bottomRef: RefObject<HTMLDivElement | null>
  inputRef: RefObject<HTMLInputElement | null>
}

/**
 * Composes the scrollable message list with the input area underneath.
 * Used by both the mobile and desktop window variants.
 */
export function ChatBody({
  messages,
  isTyping,
  input,
  setInput,
  onSend,
  bottomRef,
  inputRef,
}: ChatBodyProps) {
  // Show the bouncing dots only while waiting for the first SSE token —
  // once the streaming bubble appears, it carries its own indicator.
  const showWaiting = isTyping && !messages.some((m) => m.isStreaming)

  // Fresh conversation (only the seeded welcome bubble, nothing asked yet):
  // offer starter questions so the user discovers the coach can answer
  // knowledge questions, not just log activity.
  const showStarters = !isTyping && messages.filter((m) => m.role === 'user').length === 0

  return (
    <>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} msg={msg} />
        ))}
        {showStarters && <ChatStarters onPick={onSend} />}
        {showWaiting && (
          <div className="flex gap-2.5">
            <div className="shrink-0 w-7 h-7 rounded-xl bg-gradient-to-br from-primary/25 to-accent/20 flex items-center justify-center mt-0.5 shadow-sm">
              <Bot size={13} className="text-primary" />
            </div>
            <div className="glass-highlight bg-card/70 border border-border/50 rounded-2xl rounded-tl-md backdrop-blur-sm">
              <TypingIndicator />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <ChatInput
        input={input}
        setInput={setInput}
        onSend={onSend}
        isTyping={isTyping}
        inputRef={inputRef}
      />
    </>
  )
}

/** Tappable seed questions shown in a fresh conversation. */
function ChatStarters({ onPick }: { onPick: (q: string) => void }) {
  const t = useT()
  return (
    <div className="px-1 pt-1">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {t.aiChat.startersTitle}
      </p>
      <div className="space-y-1.5">
        {COACH_STARTERS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="group flex w-full items-center gap-2 rounded-xl border border-border/60 bg-card/50 px-3 py-2.5 text-left text-[13px] text-foreground/90 backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-card/80 hover:shadow-sm"
          >
            <span className="flex-1">{q}</span>
            <ArrowUpRight
              size={14}
              className="shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
              aria-hidden
            />
          </button>
        ))}
      </div>
    </div>
  )
}
