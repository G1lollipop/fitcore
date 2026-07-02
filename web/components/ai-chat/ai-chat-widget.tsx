'use client'

import { AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { ChatWindow } from './chat-window'
import { useChatStream } from './hooks/use-chat-stream'
import { useConversations } from './hooks/use-conversations'
import { useCoach } from './coach-context'
import { useDashboardActions } from '@/lib/queries/dashboard'

interface AIChatWidgetProps {
  userId: string
}

/**
 * Top-level AI chat widget. Owns only the *open / closed* window state and
 * the live input value, then delegates the rest:
 *
 *   • Conversation list, history, switch / new / clear  → `useConversations`
 *   • SSE streaming + sendMessage                       → `useChatStream`
 *   • Open/close state (sharable across the app)         → `useCoach`
 *   • Right-docked desktop / full-sheet mobile panel    → `<ChatWindow>`
 *
 * Opening is driven by `CoachProvider` (the home hero + action dock), and the
 * panel auto-sends any prompt queued by the surface that opened it.
 */
export function AIChatWidget({ userId }: AIChatWidgetProps) {
  // Open/closed state now lives in CoachProvider so the home hero, the action
  // dock and suggestion chips can all open the coach (and queue a prompt).
  const { isOpen, close, consumePrompt, openPlanPreview } = useCoach()
  const [input, setInput] = useState('')

  const { invalidate } = useDashboardActions()
  const conv = useConversations(userId)
  const { isTyping, sendMessage } = useChatStream({
    conversationId: conv.conversationId,
    setMessages: conv.setMessages,
    onAssistantDone: conv.refreshSummaries,
    // When the coach logs food/workout/water mid-chat, refresh the dashboard
    // so the rings/totals reflect it without a manual reload.
    onLoggedActivity: invalidate,
    // When the coach produces a plan preview, hand it to the shared coach
    // context so the dashboard can open the plan detail sheet for confirmation.
    onPlanPreview: openPlanPreview,
  })

  /** Wire the input box, chips and slash commands through one entry point. */
  const handleSend = (text: string) => {
    if (!text.trim() || isTyping) return
    void sendMessage(text)
    setInput('')
  }

  // When opened with a queued prompt (e.g. from a home chip), auto-send it once.
  useEffect(() => {
    if (!isOpen) return
    const prompt = consumePrompt()
    if (prompt) {
      void sendMessage(prompt)
    }
    // Only run on open transitions; sendMessage identity is stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  return (
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
          onClose={close}
          onSwitchConversation={conv.switchConversation}
          onStartNewChat={conv.startNewChat}
          onClearHistory={conv.clearHistory}
          onSend={handleSend}
        />
      )}
    </AnimatePresence>
  )
}
