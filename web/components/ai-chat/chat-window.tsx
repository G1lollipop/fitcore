'use client'

import { motion } from 'framer-motion'
import { ChevronDown, Loader2, Trash2, X } from 'lucide-react'
import { useEffect, useRef, type RefObject } from 'react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/provider'
import type { ChatConversationSummary } from '@/app/actions/chat'
import { ChatBody } from './chat-body'
import { ChatHeader } from './chat-header'
import type { Message } from './types'

interface ChatWindowProps {
  conversationId: string
  sessionOptions: ChatConversationSummary[]
  isLoadingHistory: boolean
  messages: Message[]
  isTyping: boolean
  input: string
  setInput: (v: string) => void
  onClose: () => void
  onSwitchConversation: (cid: string) => void
  onStartNewChat: () => void
  onClearHistory: () => void
  onSend: (text: string) => void
}

const PANEL_EASE = [0.22, 1, 0.36, 1] as const

export function ChatWindow(props: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
  const t = useT()
  return (
    <motion.div
      key="ai-chat-mobile"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ duration: 0.35, ease: PANEL_EASE }}
      className="flex fixed inset-0 z-50 flex-col bg-background/95 backdrop-blur-xl md:hidden"
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
              ariaLabel={t.aiChat.clearSession}
              tone="destructive"
            >
              <Trash2 size={16} />
            </IconButton>
            <IconButton onClick={onClose} ariaLabel={t.aiChat.closeChat}>
              <ChevronDown size={16} />
            </IconButton>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col rounded-b-2xl bg-background pb-14">
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
  const t = useT()
  return (
    <motion.aside
      key="ai-chat-desktop"
      role="complementary"
      aria-label={t.aiChat.coach}
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ duration: 0.3, ease: PANEL_EASE }}
      className={cn(
        'fixed inset-y-0 right-0 z-50 hidden w-full max-w-[420px] flex-col',
        'border-l border-border/50 bg-background/80 backdrop-blur-2xl',
        'shadow-[-8px_0_40px_-8px_rgba(0,0,0,0.12)]',
        'md:flex'
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/[0.02] to-transparent" />

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
              ariaLabel={t.aiChat.clearSession}
              tone="destructive"
            >
              <Trash2 size={14} />
            </IconButton>
            <IconButton onClick={onClose} ariaLabel={t.aiChat.close}>
              <X size={14} />
            </IconButton>
          </div>
        }
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
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
        'flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 bg-secondary/50 text-muted-foreground transition-all hover:border-primary/30 hover:bg-secondary hover:shadow-sm',
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
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={18} className="animate-spin text-primary" />
        <span>Loading...</span>
      </div>
    </div>
  )
}
