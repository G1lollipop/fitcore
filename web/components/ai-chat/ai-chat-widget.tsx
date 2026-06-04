'use client'

import { AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { ChatLauncher } from './chat-launcher'
import { ChatWindow } from './chat-window'
import { useChatStream } from './hooks/use-chat-stream'
import { useConversations } from './hooks/use-conversations'

interface AIChatWidgetProps {
  userId: string
}

/**
 * Top-level AI chat widget. Owns only the *open / closed* window state and
 * the live input value, then delegates the rest:
 *
 *   • Conversation list, history, switch / new / clear  → `useConversations`
 *   • SSE streaming + sendMessage                       → `useChatStream`
 *   • Floating launcher when closed                     → `<ChatLauncher>`
 *   • Right-docked desktop / full-sheet mobile panel    → `<ChatWindow>`
 *
 * Wraps the panel in `<AnimatePresence>` so the slide-out animation
 * actually fires when the user closes the chat.
 */
export function AIChatWidget({ userId }: AIChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')

  const conv = useConversations(userId)
  const { isTyping, sendMessage } = useChatStream({
    conversationId: conv.conversationId,
    setMessages: conv.setMessages,
    onAssistantDone: conv.refreshSummaries,
  })

  /** Wire the input box, chips and slash commands through one entry point. */
  const handleSend = (text: string) => {
    if (!text.trim() || isTyping) return
    void sendMessage(text)
    setInput('')
  }

  return (
    <>
      {!isOpen && <ChatLauncher onClick={() => setIsOpen(true)} />}
      <AnimatePresence>
        {isOpen && (
          <ChatWindow
            conversationId={conv.conversationId}
            sessionOptions={conv.sessionOptions}
            isLoadingHistory={conv.isLoadingHistory}
            messages={conv.messages}
            isTyping={isTyping}
            input={input}
            setInput={setInput}
            onClose={() => setIsOpen(false)}
            onSwitchConversation={conv.switchConversation}
            onStartNewChat={conv.startNewChat}
            onClearHistory={conv.clearHistory}
            onSend={handleSend}
          />
        )}
      </AnimatePresence>
    </>
  )
}
