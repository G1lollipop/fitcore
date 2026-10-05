'use client'

import type { ReactNode } from 'react'
import { ChevronDown, MessageSquarePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CoachAvatar } from './coach-avatar'
import { useT } from '@/lib/i18n/provider'
import type { ChatConversationSummary } from '@/app/actions/chat'
import { sessionSelectLabel } from './utils'

interface ChatHeaderProps {
  conversationId: string
  sessionOptions: ChatConversationSummary[]
  isTyping: boolean
  onSwitchConversation: (cid: string) => void
  onStartNewChat: () => void
  rightControls?: ReactNode
  compact?: boolean
}

export function ChatHeader({
  conversationId,
  sessionOptions,
  isTyping,
  onSwitchConversation,
  onStartNewChat,
  rightControls,
  compact = false,
}: ChatHeaderProps) {
  const t = useT()
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b border-border/50 shrink-0 bg-background/60 backdrop-blur-xl',
        compact ? 'px-3 py-2.5' : 'px-4 py-3.5'
      )}
    >
      <div
        className={cn(
          'relative flex items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-accent/20 shadow-sm shrink-0 overflow-hidden text-primary',
          compact ? 'w-7 h-7' : 'w-9 h-9'
        )}
      >
        <CoachAvatar size={compact ? 20 : 24} />
      </div>

      <div className={cn('flex-1 min-w-0 flex flex-col', compact ? 'gap-0.5' : 'gap-1')}>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground leading-none">{t.aiChat.coach}</p>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        </div>

        <div className="flex items-center gap-1.5 min-w-0">
          {conversationId ? (
            <div className="relative min-w-0 flex-1 max-w-[220px]">
              <select
                value={conversationId}
                onChange={(e) => onSwitchConversation(e.target.value)}
                disabled={isTyping}
                className={cn(
                  'w-full appearance-none truncate text-[11px] font-medium text-muted-foreground',
                  'border border-border/60 bg-secondary/50 rounded-lg pl-2.5 pr-7 py-1',
                  'hover:border-primary/30 hover:bg-secondary transition-colors',
                  'focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15',
                  'disabled:opacity-50'
                )}
                aria-label={t.aiChat.switchSession}
              >
                {sessionOptions.map((c) => (
                  <option key={c.conversationId} value={c.conversationId}>
                    {sessionSelectLabel(c, conversationId, t)}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60"
                aria-hidden
              />
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {compact ? t.aiChat.loadingShort : t.aiChat.loading}
            </span>
          )}

          <button
            type="button"
            onClick={onStartNewChat}
            disabled={isTyping}
            className={cn(
              'shrink-0 inline-flex items-center justify-center rounded-lg border border-border/60',
              'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-primary/30',
              'transition-colors disabled:opacity-50',
              compact ? 'h-6 w-6' : 'h-7 w-7'
            )}
            aria-label={t.aiChat.newSession}
          >
            <MessageSquarePlus size={compact ? 13 : 15} />
          </button>
        </div>
      </div>

      {rightControls}
    </div>
  )
}
