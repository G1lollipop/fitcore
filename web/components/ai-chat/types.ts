import type { AgentMode, Citation } from '@/lib/ai/types'

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

/** Chinese display label for each agent mode chip. */
export const MODE_LABEL: Record<AgentMode, string> = {
  knowledge: '知识库',
  personal: '个人',
  hybrid: '混合',
  direct: '直接',
}

/** Quick-reply chips shown above the input. */
export const SUGGESTED = [
  '今天吃什么能增肌？',
  '帮我制定本周训练计划',
  '我的蛋白质够吗？',
] as const

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

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    cmd: '/plan',
    label: '训练计划',
    description: '让 AI 教练帮你制定或调整本周训练计划',
    template: '帮我制定一份本周训练计划，目标是 ',
  },
  {
    cmd: '/log',
    label: '快速记录',
    description: '描述今天的饮食或训练，让 AI 帮你转成结构化日志',
    template: '帮我记录今天的训练 / 饮食：',
  },
  {
    cmd: '/macros',
    label: '宏量分析',
    description: '检查今天的蛋白 / 碳水 / 脂肪是否达标',
    template: '看看我今天的宏量营养够不够，有没有需要补的？',
  },
]

/**
 * Filter slash commands by the user's current input. Matches the
 * leading `/token` against either the literal `cmd` or the localised
 * `label`, so `/计划` finds `/plan`.
 */
export function filterSlashCommands(input: string): SlashCommand[] {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed.startsWith('/')) return SLASH_COMMANDS
  const token = trimmed.split(/\s+/)[0] ?? '/'
  if (token === '/') return SLASH_COMMANDS
  const needle = token.slice(1)
  return SLASH_COMMANDS.filter(
    (c) =>
      c.cmd.slice(1).toLowerCase().startsWith(needle) ||
      c.label.toLowerCase().includes(needle)
  )
}
