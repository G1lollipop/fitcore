'use client'

import type { ReactNode } from 'react'
import { Bot, MessageSquarePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/provider'
import type { ChatConversationSummary } from '@/app/actions/chat'
import { sessionSelectLabel } from './utils'

interface ChatHeaderProps {
  conversationId: string
  sessionOptions: ChatConversationSummary[]
  isTyping: boolean
  onSwitchConversation: (cid: string) => void
  onStartNewChat: () => void
  /**
   * Right-side controls slot. Each window variant supplies its own
   * arrangement of close / minimize / clear buttons here.
   */
  rightControls?: ReactNode
  /**
   * `true` for the desktop corner panel (denser layout, gap-1, smaller icons),
   * `false` for the mobile fullscreen overlay (gap-3, larger touch targets).
   */
  compact?: boolean
}

/**
 * Header bar shown atop every chat window variant. Owns the avatar, title,
 * conversation switcher and "online" dot. Variant-specific right-side
 * controls are passed in as `rightControls`.
 */
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
        'flex items-center gap-3 border-b border-border shrink-0',
        compact ? 'px-4 py-3 rounded-t-xl bg-muted/50' : 'px-4 py-4 bg-card'
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-lg bg-primary/10 shrink-0',
          compact ? 'w-7 h-7' : 'w-8 h-8'
        )}
      >
        <Bot size={compact ? 14 : 16} className="text-primary" />
      </div>

      <div className={cn('flex-1 min-w-0 flex flex-col', compact ? 'gap-1' : 'gap-1.5')}>
        <p className="text-sm font-medium text-foreground leading-none">{t.aiChat.assistant}</p>

        <div className="flex items-center gap-1.5 min-w-0">
          {conversationId ? (
            <select
              value={conversationId}
              onChange={(e) => onSwitchConversation(e.target.value)}
              disabled={isTyping}
              className={cn(
                'min-w-0 flex-1 truncate text-[11px] border border-border',
                compact
                  ? 'bg-background/80 rounded-md px-1.5 py-1'
                  : 'max-w-[200px] bg-secondary rounded-lg px-2 py-1.5'
              )}
              aria-label={t.aiChat.switchSession}
            >
              {sessionOptions.map((c) => (
                <option key={c.conversationId} value={c.conversationId}>
                  {sessionSelectLabel(c, conversationId, t)}
                </option>
              ))}
            </select>
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
              'shrink-0 border border-border text-muted-foreground hover:text-foreground disabled:opacity-50',
              compact
                ? 'p-1 rounded-md bg-background/80'
                : 'p-2 rounded-lg bg-secondary'
            )}
            aria-label={t.aiChat.newSession}
          >
            <MessageSquarePlus size={compact ? 14 : 16} />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
          <span className="text-[10px] text-muted-foreground">{t.aiChat.online}</span>
        </div>
      </div>

      {rightControls}
    </div>
  )
}
