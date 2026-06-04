'use client'

import { Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CitationsList } from './citations-list'
import { MODE_LABEL, type Message } from './types'

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
    <div className={cn('flex gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {!isUser && (
        <div className="shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
          <Bot size={12} className="text-primary" />
        </div>
      )}
      <div className={cn('flex flex-col gap-0.5', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'px-3 py-2.5 rounded-2xl text-[13px] leading-relaxed max-w-[320px] whitespace-pre-line',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-secondary text-foreground rounded-tl-sm'
          )}
        >
          {msg.content}
          {msg.isStreaming && (
            <span className="inline-block w-0.5 h-3.5 bg-foreground/60 ml-0.5 align-middle animate-pulse" />
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
  const hasMeta = Boolean(msg.mode || msg.timestamp)
  return (
    <>
      {hasMeta && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 max-w-[320px]">
          {msg.mode && (
            <span
              className="text-[10px] rounded-md border border-border bg-background/80 px-1.5 py-0.5 text-muted-foreground shrink-0"
              title={msg.toolsUsed?.length ? `工具: ${msg.toolsUsed.join(', ')}` : undefined}
            >
              {MODE_LABEL[msg.mode]}
            </span>
          )}
          {msg.timestamp && (
            <span className="text-[10px] text-muted-foreground">{msg.timestamp}</span>
          )}
        </div>
      )}
      <CitationsList citations={msg.citations ?? []} />
    </>
  )
}
