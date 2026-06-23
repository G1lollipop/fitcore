import type { AgentMode, Citation } from '@/lib/ai/types'
import type { Dictionary } from '@/lib/i18n'

/** A single chat bubble — user or assistant. */
export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** HH:MM string. Empty for messages restored from history. */
  timestamp: string
  mode?: AgentMode
  citations?: Citation[]
  toolsUsed?: string[]
  /** True while the SSE stream is still appending tokens. */
  isStreaming?: boolean
}

/**
 * Slash command shortcut shown when the input begins with `/`.
 *
 * Selecting a command rewrites the input to `template`, places the cursor
 * at the end, and lets the user append details before sending. The literal
 * `cmd` is what we filter by; `label` and `description` are display only.
 */
export interface SlashCommand {
  cmd: string
  label: string
  description: string
  template: string
}

/** Build the localized slash-command list from the active dictionary. */
export function buildSlashCommands(t: Dictionary): SlashCommand[] {
  return [
    { cmd: '/plan', ...t.aiChat.slash.plan },
    { cmd: '/log', ...t.aiChat.slash.log },
    { cmd: '/macros', ...t.aiChat.slash.macros },
  ]
}

/**
 * Filter slash commands by the user's current input. Matches the
 * leading `/token` against either the literal `cmd` or the localized
 * `label`, so typing part of the label also finds the command.
 */
export function filterSlashCommands(input: string, commands: SlashCommand[]): SlashCommand[] {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed.startsWith('/')) return commands
  const token = trimmed.split(/\s+/)[0] ?? '/'
  if (token === '/') return commands
  const needle = token.slice(1)
  return commands.filter(
    (c) =>
      c.cmd.slice(1).toLowerCase().startsWith(needle) ||
      c.label.toLowerCase().includes(needle)
  )
}
