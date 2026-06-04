'use client'

import { motion } from 'framer-motion'
import { ChevronDown, Loader2, Trash2, X } from 'lucide-react'
import { useEffect, useRef, type RefObject } from 'react'
import { cn } from '@/lib/utils'
import type { ChatConversationSummary } from '@/app/actions/chat'
import { ChatBody } from './chat-body'
import { ChatHeader } from './chat-header'
import type { Message } from './types'

interface ChatWindowProps {
  // ── conversation state ──
  conversationId: string
  sessionOptions: ChatConversationSummary[]
  isLoadingHistory: boolean

  // ── message stream state ──
  messages: Message[]
  isTyping: boolean
  input: string
  setInput: (v: string) => void

  onClose: () => void

  // ── actions ──
  onSwitchConversation: (cid: string) => void
  onStartNewChat: () => void
  onClearHistory: () => void
  onSend: (text: string) => void
}

const PANEL_EASE = [0.16, 1, 0.3, 1] as const

/**
 * Renders both responsive chat panels:
 *   • Desktop (`md:` and up): a right-docked rail anchored to the viewport's
 *     right edge, full-height, ~420px wide. Slides in from the right.
 *   • Mobile: a full-sheet that slides up from the bottom and fills the
 *     screen. Uses the same components as desktop.
 *
 * The Tailwind responsive `hidden md:flex` toggles keep us from having to
 * track viewport width in JS — only one panel is laid out at a time.
 */
export function ChatWindow(props: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to the latest message whenever the list grows or the
  // typing indicator changes.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [props.messages, props.isTyping])

  return (
    <>
      <MobileSheet {...props} bottomRef={bottomRef} inputRef={inputRef} />
      <DesktopDock {...props} bottomRef={bottomRef} inputRef={inputRef} />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  Variants                                                                  */
/* -------------------------------------------------------------------------- */

interface VariantProps extends ChatWindowProps {
  bottomRef: RefObject<HTMLDivElement | null>
  inputRef: RefObject<HTMLInputElement | null>
}

function MobileSheet({
  conversationId,
  sessionOptions,
  isLoadingHistory,
  messages,
  isTyping,
  input,
  setInput,
  onClose,
  onSwitchConversation,
  onStartNewChat,
  onClearHistory,
  onSend,
  bottomRef,
  inputRef,
}: VariantProps) {
  return (
    <motion.div
      key="ai-chat-mobile"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ duration: 0.32, ease: PANEL_EASE }}
      className="fixed inset-0 z-50 flex flex-col bg-background md:hidden"
    >
      <ChatHeader
        compact={false}
        conversationId={conversationId}
        sessionOptions={sessionOptions}
        isTyping={isTyping}
        onSwitchConversation={onSwitchConversation}
        onStartNewChat={onStartNewChat}
        rightControls={
          <>
            <IconButton
              onClick={onClearHistory}
              ariaLabel="清除当前会话"
              tone="destructive"
            >
              <Trash2 size={16} />
            </IconButton>
            <IconButton onClick={onClose} ariaLabel="关闭聊天">
              <ChevronDown size={16} />
            </IconButton>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col pb-14">
        {isLoadingHistory ? (
          <Spinner />
        ) : (
          <ChatBody
            messages={messages}
            isTyping={isTyping}
            input={input}
            setInput={setInput}
            onSend={onSend}
            bottomRef={bottomRef}
            inputRef={inputRef}
          />
        )}
      </div>
    </motion.div>
  )
}

function DesktopDock({
  conversationId,
  sessionOptions,
  isLoadingHistory,
  messages,
  isTyping,
  input,
  setInput,
  onClose,
  onSwitchConversation,
  onStartNewChat,
  onClearHistory,
  onSend,
  bottomRef,
  inputRef,
}: VariantProps) {
  return (
    <motion.aside
      key="ai-chat-desktop"
      role="complementary"
      aria-label="AI 教练"
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ duration: 0.32, ease: PANEL_EASE }}
      className={cn(
        'fixed inset-y-0 right-0 z-50 hidden w-full max-w-[420px] flex-col border-l border-border bg-card/95 shadow-2xl backdrop-blur',
        'md:flex'
      )}
    >
      <ChatHeader
        compact={false}
        conversationId={conversationId}
        sessionOptions={sessionOptions}
        isTyping={isTyping}
        onSwitchConversation={onSwitchConversation}
        onStartNewChat={onStartNewChat}
        rightControls={
          <div className="flex items-center gap-1">
            <IconButton
              onClick={onClearHistory}
              ariaLabel="清除当前会话"
              tone="destructive"
            >
              <Trash2 size={14} />
            </IconButton>
            <IconButton onClick={onClose} ariaLabel="关闭">
              <X size={14} />
            </IconButton>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {isLoadingHistory ? (
          <Spinner />
        ) : (
          <ChatBody
            messages={messages}
            isTyping={isTyping}
            input={input}
            setInput={setInput}
            onSend={onSend}
            bottomRef={bottomRef}
            inputRef={inputRef}
          />
        )}
      </div>
    </motion.aside>
  )
}

interface IconButtonProps {
  onClick: () => void
  ariaLabel: string
  tone?: 'default' | 'destructive'
  children: React.ReactNode
}

function IconButton({ onClick, ariaLabel, tone = 'default', children }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary/80 text-muted-foreground transition-all hover:border-primary/30',
        tone === 'destructive' ? 'hover:text-destructive' : 'hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 size={24} className="animate-spin text-primary" />
    </div>
  )
}
