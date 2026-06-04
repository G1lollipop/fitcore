import type { ChatConversationSummary } from '@/app/actions/chat'

/** Current wall-clock as HH:MM (24h, zero-padded). */
export function nowHHMM(): string {
  const d = new Date()
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

/** Quick http(s)-URL test used to decide whether to render a citation source as a link. */
export function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim())
}

/**
 * Compose the dropdown label for a single conversation entry.
 * Format: "<short> MM/DD · <preview>" — where <short> is "当前" for the
 * active conversation or "…<lastSix>" for siblings.
 */
export function sessionSelectLabel(c: ChatConversationSummary, activeId: string): string {
  const short = c.conversationId === activeId ? '当前' : `…${c.conversationId.slice(-6)}`
  const d = c.lastAt ? new Date(c.lastAt) : new Date()
  const md = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`
  const pv = (c.preview || '').replace(/\s+/g, ' ').slice(0, 20)
  return pv ? `${short} ${md} · ${pv}` : `${short} ${md}`
}
