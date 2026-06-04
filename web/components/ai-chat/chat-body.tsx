'use client'

import { Bot } from 'lucide-react'
import type { RefObject } from 'react'
import { ChatInput } from './chat-input'
import { ChatMessage } from './chat-message'
import { TypingIndicator } from './typing-indicator'
import type { Message } from './types'

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

  return (
    <>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} msg={msg} />
        ))}
        {showWaiting && (
          <div className="flex gap-2">
            <div className="shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
              <Bot size={12} className="text-primary" />
            </div>
            <div className="bg-secondary rounded-2xl rounded-tl-sm">
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
