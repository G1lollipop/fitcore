'use client'

import { ArrowUpRight, Bot, Sparkles } from 'lucide-react'
import type { RefObject } from 'react'
import { useT } from '@/lib/i18n/provider'
import { CoachAvatar } from './coach-avatar'
import { KNOWLEDGE_TOPICS } from '@/components/knowledge/starters'
import { ChatInput } from './chat-input'
import { ChatMessage } from './chat-message'
import { TypingIndicator } from './typing-indicator'
import type { Message } from './types'

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

export function ChatBody({
  messages,
  isTyping,
  input,
  setInput,
  onSend,
  bottomRef,
  inputRef,
}: ChatBodyProps) {
  const showWaiting = isTyping && !messages.some((m) => m.isStreaming)
  const showStarters = !isTyping && messages.filter((m) => m.role === 'user').length === 0

  return (
    <>
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4 scroll-smooth">
        {messages.length === 0 && !isTyping && (
          <WelcomeMessage />
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} msg={msg} />
        ))}

        {showStarters && <ChatStarters onPick={onSend} />}

        {showWaiting && (
          <div className="flex gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-accent/20 text-primary">
              <CoachAvatar size={20} />
            </div>
            <div className="rounded-2xl rounded-tl-md border border-border/40 bg-card/60 px-4 py-3 shadow-sm backdrop-blur-sm">
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

function WelcomeMessage() {
  const t = useT()
  return (
    <div className="flex flex-col items-center gap-3 pt-6 pb-2 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10 shadow-sm ring-1 ring-primary/10">
        <Bot size={24} className="text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t.aiChat.coach}</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-[260px] leading-relaxed">
          {t.aiChat.welcome}
        </p>
      </div>
    </div>
  )
}

function ChatStarters({ onPick }: { onPick: (q: string) => void }) {
  const t = useT()
  return (
    <div className="px-1 pt-2">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={12} className="text-primary" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t.aiChat.startersTitle}
        </p>
      </div>
      <div className="space-y-2">
        {COACH_STARTERS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="group flex w-full items-center gap-3 rounded-xl border border-border/50 bg-card/40 px-3.5 py-3 text-left text-[13px] text-foreground/85 shadow-sm backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-card/70 hover:shadow-md hover:text-foreground"
          >
            <span className="flex-1 leading-snug">{q}</span>
            <ArrowUpRight
              size={15}
              className="shrink-0 text-muted-foreground/60 transition-all group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              aria-hidden
            />
          </button>
        ))}
      </div>
    </div>
  )
}
