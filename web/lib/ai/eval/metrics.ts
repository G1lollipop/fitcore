/**
 * Offline metrics for Agent Step-1 tool-selection eval.
 */

export type IntentMode = "knowledge" | "personal" | "hybrid" | "small_talk"

export interface AgentGoldenCase {
  id: string
  message: string
  intent_mode: IntentMode
  /** Expected tool names (set). Order-independent. Empty for small_talk. */
  expected_tools: string[]
  /** Expected k when knowledge retrieval is needed. */
  expected_k?: number
  /** Acceptable k values when exact match is too strict. */
  acceptable_k?: number[]
  note?: string
}

export interface AgentEvalRow {
  id: string
  intent_mode: IntentMode
  expected_tools: string[]
  actual_tools: string[]
  tool_set_match: boolean
  k_expected?: number
  k_actual?: number
  k_hit?: boolean
  false_tool_call: boolean
}

export interface PerToolCounts {
  tp: number
  fp: number
  fn: number
}

const KNOWLEDGE_TOOLS = ["set_retrieval_params", "query_knowledge_base"]
const ALL_TOOLS = [
  "set_retrieval_params",
  "query_knowledge_base",
  "get_user_stats",
] as const

export function normalizeToolSet(tools: string[]): string[] {
  return [...new Set(tools)].sort()
}

export function toolSetsEqual(a: string[], b: string[]): boolean {
  const na = normalizeToolSet(a)
  const nb = normalizeToolSet(b)
  return na.length === nb.length && na.every((t, i) => t === nb[i])
}

export function isKHit(
  actual: number | undefined,
  expected?: number,
  acceptable?: number[]
): boolean | undefined {
  if (expected === undefined && !acceptable?.length) return undefined
  if (actual === undefined) return false
  if (acceptable?.length) return acceptable.includes(actual)
  return actual === expected
}

export function scoreCase(
  item: AgentGoldenCase,
  actualTools: string[],
  actualK?: number
): AgentEvalRow {
  const expected = normalizeToolSet(item.expected_tools)
  const actual = normalizeToolSet(actualTools)
  const tool_set_match = toolSetsEqual(expected, actual)
  const false_tool_call =
    item.intent_mode === "small_talk" && actual.length > 0

  const needsK =
    item.intent_mode === "knowledge" ||
    item.intent_mode === "hybrid" ||
    expected.some((t) => KNOWLEDGE_TOOLS.includes(t))

  return {
    id: item.id,
    intent_mode: item.intent_mode,
    expected_tools: expected,
    actual_tools: actual,
    tool_set_match,
    k_expected: item.expected_k,
    k_actual: actualK,
    k_hit: needsK
      ? isKHit(actualK, item.expected_k, item.acceptable_k)
      : undefined,
    false_tool_call,
  }
}

export function perToolPrf(rows: AgentEvalRow[]): Record<string, PerToolCounts> {
  const counts: Record<string, PerToolCounts> = {}
  for (const tool of ALL_TOOLS) {
    counts[tool] = { tp: 0, fp: 0, fn: 0 }
  }

  for (const row of rows) {
    for (const tool of ALL_TOOLS) {
      const expected = row.expected_tools.includes(tool)
      const actual = row.actual_tools.includes(tool)
      if (expected && actual) counts[tool].tp += 1
      else if (!expected && actual) counts[tool].fp += 1
      else if (expected && !actual) counts[tool].fn += 1
    }
  }
  return counts
}

export function prfFromCounts(c: PerToolCounts): {
  precision: number
  recall: number
  f1: number
} {
  const precision = c.tp + c.fp > 0 ? c.tp / (c.tp + c.fp) : 1
  const recall = c.tp + c.fn > 0 ? c.tp / (c.tp + c.fn) : 1
  const f1 =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  return { precision, recall, f1 }
}

export function summarizeAgentEval(rows: AgentEvalRow[]) {
  const n = rows.length || 1
  const toolAcc = rows.filter((r) => r.tool_set_match).length / n

  const kRows = rows.filter((r) => r.k_hit !== undefined)
  const kHit =
    kRows.length > 0
      ? kRows.filter((r) => r.k_hit).length / kRows.length
      : null

  const smallTalk = rows.filter((r) => r.intent_mode === "small_talk")
  const falseToolRate =
    smallTalk.length > 0
      ? smallTalk.filter((r) => r.false_tool_call).length / smallTalk.length
      : null

  const perTool = perToolPrf(rows)
  const perToolMetrics = Object.fromEntries(
    Object.entries(perTool).map(([tool, c]) => [tool, prfFromCounts(c)])
  )

  return {
    total_cases: rows.length,
    tool_selection_accuracy: round(toolAcc),
    k_hit_rate: kHit === null ? null : round(kHit),
    false_tool_call_rate: falseToolRate === null ? null : round(falseToolRate),
    per_tool: perToolMetrics,
  }
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}
