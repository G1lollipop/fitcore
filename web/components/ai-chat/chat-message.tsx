'use client'

import { useState } from 'react'
import { Bot, ThumbsDown, ThumbsUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/provider'
import { submitMessageFeedback } from '@/app/actions/chat'
import { CitationsList } from './citations-list'
import { type Message } from './types'

interface ChatMessageProps {
  msg: Message
}

/**
 * Single chat bubble — handles both user (right-aligned, primary color) and
 * assistant (left-aligned, secondary color, optional mode chip + citations)
 * variants.
 */
export function ChatMessage({ msg }: ChatMessageProps) {
  const isUser = msg.role === 'user'

  return (
    <div className={cn('flex gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-xl bg-gradient-to-br from-primary/25 to-accent/20 flex items-center justify-center mt-0.5 shadow-sm">
          <Bot size={13} className="text-primary" />
        </div>
      )}
      <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'px-3.5 py-2.5 text-[13px] leading-relaxed max-w-[320px] whitespace-pre-line shadow-sm',
            'rounded-2xl',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-md'
              : 'glass-highlight bg-card/70 text-foreground border border-border/50 rounded-tl-md backdrop-blur-sm'
          )}
          // Announce assistant replies (including streamed updates) to screen
          // readers; user messages don't need to be re-read.
          aria-live={!isUser ? 'polite' : undefined}
          role={!isUser ? 'status' : undefined}
        >
          {msg.content}
          {msg.isStreaming && (
            <span
              aria-hidden="true"
              className={cn(
                'inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse',
                isUser ? 'bg-primary-foreground/70' : 'bg-foreground/60'
              )}
            />
          )}
        </div>

        {isUser ? (
          <span className="text-[10px] text-muted-foreground px-1">{msg.timestamp}</span>
        ) : (
          <AssistantMeta msg={msg} />
        )}
      </div>
    </div>
  )
}

/** Mode chip + timestamp + citations for assistant messages. Renders nothing if empty. */
function AssistantMeta({ msg }: { msg: Message }) {
  const t = useT()
  const hasMeta = Boolean(msg.mode || msg.timestamp)
  return (
    <>
      {hasMeta && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 max-w-[320px]">
          {msg.mode && (
            <span
              className="text-[10px] rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-primary font-medium shrink-0"
              title={msg.toolsUsed?.length ? t.aiChat.tools(msg.toolsUsed.join(', ')) : undefined}
            >
              {t.aiChat.modeLabel[msg.mode]}
            </span>
          )}
          {msg.timestamp && (
            <span className="text-[10px] text-muted-foreground">{msg.timestamp}</span>
          )}
        </div>
      )}
      <CitationsList citations={msg.citations ?? []} />
      <FeedbackButtons msg={msg} />
    </>
  )
}

/**
 * Thumbs up / down on an assistant reply. Only shown once the reply has been
 * persisted (a `serverMessageId` exists) and streaming has finished. Records
 * the rating via the `submitMessageFeedback` server action, which feeds the
 * reranker training flywheel.
 */
function FeedbackButtons({ msg }: { msg: Message }) {
  const t = useT()
  const [rating, setRating] = useState<1 | -1 | null>(null)
  const [pending, setPending] = useState(false)

  if (!msg.serverMessageId || msg.isStreaming) return null

  const send = async (value: 1 | -1) => {
    if (pending || rating === value) return
    setPending(true)
    const previous = rating
    setRating(value) // optimistic
    const res = await submitMessageFeedback({
      messageId: msg.serverMessageId!,
      rating: value,
      citations: msg.citations ?? [],
    })
    if (!res.success) setRating(previous)
    setPending(false)
  }

  return (
    <div className="flex items-center gap-0.5 px-1" aria-live="polite">
      <button
        type="button"
        onClick={() => send(1)}
        disabled={pending}
        aria-pressed={rating === 1}
        aria-label={t.aiChat.feedback.helpful}
        title={t.aiChat.feedback.helpful}
        className={cn(
          'rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50',
          rating === 1 && 'bg-primary/10 text-primary'
        )}
      >
        <ThumbsUp size={12} />
      </button>
      <button
        type="button"
        onClick={() => send(-1)}
        disabled={pending}
        aria-pressed={rating === -1}
        aria-label={t.aiChat.feedback.notHelpful}
        title={t.aiChat.feedback.notHelpful}
        className={cn(
          'rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50',
          rating === -1 && 'bg-destructive/10 text-destructive'
        )}
      >
        <ThumbsDown size={12} />
      </button>
      {rating !== null && (
        <span className="ml-1 text-[10px] text-muted-foreground">
          {t.aiChat.feedback.thanks}
        </span>
      )}
    </div>
  )
}
