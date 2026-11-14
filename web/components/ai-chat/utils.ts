import type { ChatConversationSummary } from '@/app/actions/chat'
import type { Dictionary } from '@/lib/i18n'
import { formatClock, toLocalDateStr } from '@/lib/utils/date'

/** Current wall-clock in the app time zone as HH:MM (24h, zero-padded). */
export function nowHHMM(): string {
  return formatClock()
}

/** Quick http(s)-URL test used to decide whether to render a citation source as a link. */
export function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim())
}

/**
 * Compose the dropdown label for a single conversation entry.
 * Format: "<short> MM/DD · <preview>" — where <short> is "Current" for the
 * active conversation or "…<lastSix>" for siblings.
 */
export function sessionSelectLabel(c: ChatConversationSummary, activeId: string, t: Dictionary): string {
  const short = c.conversationId === activeId ? t.aiChat.current : `…${c.conversationId.slice(-6)}`
  const d = c.lastAt ? new Date(c.lastAt) : new Date()
  // Month/day of the conversation's last message on the app's calendar.
  const [, month, day] = toLocalDateStr(d).split('-')
  const md = `${month}/${day}`
  const pv = (c.preview || '').replace(/\s+/g, ' ').slice(0, 20)
  return pv ? `${short} ${md} · ${pv}` : `${short} ${md}`
}
