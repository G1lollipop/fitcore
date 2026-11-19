// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ create: vi.fn(), rag: vi.fn() }))
const rag = mocks.rag
vi.mock('@/lib/openaiClient', () => ({ openai: { chat: { completions: { create: mocks.create } } } }))
vi.mock('@/lib/ai/rag-client', () => ({ chatWithRagRetrieve: mocks.rag }))
vi.mock('@/lib/ai/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/model')>()),
  AI_USES_GOOGLE: true,
}))

import { ANSWER_NOW_INSTRUCTION, modelsAfter, runAgent } from '@/lib/ai/agent'
import { GEMINI_GENERATION_MODELS } from '@/lib/ai/model'
import type { UserContextPayload } from '@/lib/ai/types'

const [HYDROGEN, FLASH_38, FLASH_36] = GEMINI_GENERATION_MODELS
const rateLimited = () => Object.assign(new Error('429 Too Many Requests'), { status: 429 })
const overloaded = () => Object.assign(new Error('503 high demand'), { status: 503 })

type ToolCallStep = { toolCall: { name: string; arguments: string; extra_content?: unknown } }
type Step = string | Error | ToolCallStep
/**
 * What each model does when asked to stream: yield text pieces, a tool call,
 * or fail at that point. A list of lists answers successive requests in turn.
 */
let streams: Record<string, Step[] | Step[][]>
const streamCalls: Record<string, number> = {}
/** Messages of each answer request. */
const answerPrompts: unknown[][] = []
/** Models whose planning call is rate-limited. */
let planRateLimited: string[]
/** When set, the planner asks for a knowledge-base search with this query. */
let planSearch: string | null
const asked: Array<{ model: string; kind: 'plan' | 'stream' }> = []
const signals: Array<AbortSignal | undefined> = []
const generationRequests: Array<{
  lastMessage?: unknown
  model: string
  temperature?: number
  max_tokens?: number
  reasoning_effort?: string
}> = []

beforeEach(() => {
  streams = {}
  for (const key of Object.keys(streamCalls)) delete streamCalls[key]
  answerPrompts.length = 0
  rag.mockReset()
  rag.mockResolvedValue({
    chunks: [{ title: 'ISSN creatine', snippet: '3–5 g a day' }],
    citations: [{ title: 'ISSN creatine', source: 'issn.txt', snippet: '3–5 g a day' }],
  })
  planRateLimited = []
  planSearch = null
  asked.length = 0
  signals.length = 0
  generationRequests.length = 0
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  mocks.create.mockReset()
  mocks.create.mockImplementation(async (params: {
    model: string
    stream?: boolean
    temperature?: number
    max_tokens?: number
    reasoning_effort?: string
  }, options?: { signal?: AbortSignal }) => {
    asked.push({ model: params.model, kind: params.stream ? 'stream' : 'plan' })
    signals.push(options?.signal)
    if (!params.stream) {
      if (planRateLimited.includes(params.model)) throw rateLimited()
      if (planSearch) {
        const tool_calls = [{ id: 'plan-1', type: 'function', function: { name: 'query_knowledge_base', arguments: JSON.stringify({ query: planSearch }) } }]
        return { model: params.model, choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls } }] }
      }
      // The planner answers directly: no tools to run.
      return { model: params.model, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: null } }] }
    }
    generationRequests.push({
      lastMessage: (params as { messages?: unknown[] }).messages?.at(-1),
      model: params.model,
      temperature: params.temperature,
      max_tokens: params.max_tokens,
      reasoning_effort: params.reasoning_effort,
    })
    answerPrompts.push([...((params as { messages?: unknown[] }).messages ?? [])])
    const configured = streams[params.model] ?? []
    const call = (streamCalls[params.model] = (streamCalls[params.model] ?? 0) + 1)
    const steps = (Array.isArray(configured[0]) ? (configured as Step[][])[call - 1] ?? [] : configured) as Step[]
    if (steps[0] instanceof Error) throw steps[0]
    return (async function* () {
      yield { model: params.model, choices: [{ index: 0, delta: { role: 'assistant' } }] }
      for (const step of steps) {
        if (step instanceof Error) throw step
        if (typeof step === 'object') {
          const { name, arguments: args, extra_content } = step.toolCall
          // Streamed in two pieces, as providers may split a call's arguments.
          yield { model: params.model, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name, arguments: args.slice(0, 5) }, ...(extra_content ? { extra_content } : {}) }] } }] }
          yield { model: params.model, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: args.slice(5) } }] } }] }
          continue
        }
        yield { model: params.model, choices: [{ index: 0, delta: { content: step } }] }
      }
      yield { model: params.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }
    })()
  })
})
afterEach(() => {
  vi.restoreAllMocks()
})

function ask(signal?: AbortSignal) {
  const tokens: string[] = []
  const result = runAgent({
    message: 'How much protein should I eat?',
    sessionId: 'session-1',
    userContext: {} as UserContextPayload,
    conversationHistory: [],
    onToken: (token) => tokens.push(token),
    signal,
  })
  return { tokens, result }
}

describe('coach answer streaming', () => {
  it('streams the answer from gemini-4-hydrogen when it is available', async () => {
    streams = { [HYDROGEN]: ['About ', '120 g ', 'a day.'] }
    const { tokens, result } = ask()

    expect((await result).answer).toBe('About 120 g a day.')
    expect(tokens).toEqual(['About ', '120 g ', 'a day.'])
    expect(asked).toEqual([
      { model: HYDROGEN, kind: 'plan' },
      { model: HYDROGEN, kind: 'stream' },
    ])
  })

  it('uses a bounded low-reasoning budget for Google final answer generation', async () => {
    streams = { [HYDROGEN]: ['A concise answer.'] }
    await ask().result

    expect(generationRequests).toHaveLength(1)
    expect(generationRequests[0]).toMatchObject({
      model: HYDROGEN,
      max_tokens: 4096,
      reasoning_effort: 'low',
    })
    expect(generationRequests[0]?.temperature).toBeUndefined()
  })

  it('ends the answer prompt by telling the model to answer in text, not call tools', async () => {
    // Without it Gemini often replies to a knowledge-base result with only
    // another tool call: no text at all, which the user saw as an error.
    streams = { [HYDROGEN]: ['Yes.'] }
    await ask().result

    expect(generationRequests[0]?.lastMessage).toEqual({ role: 'system', content: ANSWER_NOW_INSTRUCTION })
  })

  it('preserves leading whitespace when visible answer text follows', async () => {
    streams = { [HYDROGEN]: ['  \n', 'A concise answer.'] }
    const { tokens, result } = ask()

    expect((await result).answer).toBe('  \nA concise answer.')
    expect(tokens.join('')).toBe('  \nA concise answer.')
  })

  it.each([
    { label: 'no answer chunks', chunks: [] as Step[] },
    { label: 'whitespace only', chunks: ['  ', '\n\t'] },
  ])('rejects when every model gives a clean $label response, without emitting blank tokens', async ({ chunks }) => {
    streams = { [HYDROGEN]: chunks, [FLASH_38]: chunks, [FLASH_36]: chunks }
    const { tokens, result } = ask()

    await expect(result).rejects.toMatchObject({ name: 'EmptyAgentResponseError', message: '' })
    expect(tokens).toEqual([])
    expect(asked.filter((entry) => entry.kind === 'stream').map((entry) => entry.model)).toEqual([
      HYDROGEN,
      FLASH_38,
      FLASH_36,
    ])
  })

  it('answers from the next model when the first ends its reply with no text', async () => {
    streams = { [HYDROGEN]: [], [FLASH_38]: ['  ', 'About ', '120 g.'] }
    const { tokens, result } = ask()

    // Whitespace held back from the empty first reply never leaks into the answer.
    expect((await result).answer).toBe('  About 120 g.')
    expect(tokens).toEqual(['  About ', '120 g.'])
    expect(asked.filter((a) => a.kind === 'stream').map((a) => a.model)).toEqual([HYDROGEN, FLASH_38])
  })

  it('skips past a fallback model that already answered empty', async () => {
    // Hydrogen is rate-limited, 3.8 answers empty: the retry goes to 3.6, not back to 3.8.
    streams = { [HYDROGEN]: [rateLimited()], [FLASH_38]: [], [FLASH_36]: ['Fine.'] }
    const { result } = ask()

    expect((await result).answer).toBe('Fine.')
    expect(asked.filter((a) => a.kind === 'stream').map((a) => a.model)).toEqual([
      HYDROGEN,
      FLASH_38,
      FLASH_36,
    ])
  })

  it('answers from the next model when the first is rate-limited before any text', async () => {
    streams = { [HYDROGEN]: [rateLimited()], [FLASH_38]: ['Around ', '120 g.'] }
    const { tokens, result } = ask()

    expect((await result).answer).toBe('Around 120 g.')
    // Only the second model's text ever reaches the screen.
    expect(tokens).toEqual(['Around ', '120 g.'])
    expect(asked.filter((a) => a.kind === 'stream').map((a) => a.model)).toEqual([HYDROGEN, FLASH_38])
  })

  it('answers from gemini-3.6-flash when Hydrogen returns 429 and 3.8 returns 503', async () => {
    streams = { [HYDROGEN]: [rateLimited()], [FLASH_38]: [overloaded()], [FLASH_36]: ['About ', '120 g.'] }
    const { tokens, result } = ask()

    expect((await result).answer).toBe('About 120 g.')
    expect(tokens).toEqual(['About ', '120 g.'])
    expect(asked.filter((a) => a.kind === 'stream').map((a) => a.model)).toEqual([
      HYDROGEN,
      FLASH_38,
      FLASH_36,
    ])
  })

  it('stops, without trying another model, when the user has gone away', async () => {
    const user = new AbortController()
    user.abort()
    streams = { [HYDROGEN]: ['unused'] }
    const { tokens, result } = ask(user.signal)

    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(tokens).toEqual([])
    expect(asked).toEqual([])
  })

  it('hands every model call a signal that cancels it', async () => {
    streams = { [HYDROGEN]: ['Fine.'] }
    await ask(new AbortController().signal).result

    expect(signals).toHaveLength(2)
    for (const signal of signals) expect(signal).toBeInstanceOf(AbortSignal)
  })

  it('does not switch models after the answer has started showing', async () => {
    streams = { [HYDROGEN]: ['About ', '120 g', rateLimited()], [FLASH_38]: ['A second, different answer.'] }
    const { tokens, result } = ask()

    await expect(result).rejects.toMatchObject({ status: 429 })
    // What was shown stays as it is: nothing from another model is appended.
    expect(tokens).toEqual(['About ', '120 g'])
    expect(asked.filter((a) => a.kind === 'stream').map((a) => a.model)).toEqual([HYDROGEN])
  })

  it('runs a search the answer step asks for, then streams the answer with its sources', async () => {
    // Seen live with Gemini: after a knowledge-base result it replies with only
    // another search, no text. That used to end in "Sorry, something went wrong".
    const search = {
      toolCall: {
        name: 'query_knowledge_base',
        arguments: '{"query":"creatine loading dose","k":8}',
        extra_content: { google: { thought_signature: 'sig-1' } },
      },
    }
    streams = { [HYDROGEN]: [[search], ['Take ', '3–5 g a day.']] }
    const { tokens, result } = ask()

    const answer = await result
    expect(answer.answer).toBe('Take 3–5 g a day.')
    expect(tokens).toEqual(['Take ', '3–5 g a day.'])
    expect(answer.toolsUsed).toEqual(['query_knowledge_base'])
    expect(answer.citations).toEqual([{ title: 'ISSN creatine', source: 'issn.txt', snippet: '3–5 g a day' }])
    expect(rag).toHaveBeenCalledWith(expect.objectContaining({ query: 'creatine loading dose', topK: 8 }))

    // The second request carries the whole call (reassembled, signature kept),
    // its result, and still ends with the answer-now instruction.
    const second = answerPrompts[1]
    expect(second.at(-3)).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: 'call-1',
        type: 'function',
        function: { name: 'query_knowledge_base', arguments: '{"query":"creatine loading dose","k":8}' },
        extra_content: { google: { thought_signature: 'sig-1' } },
      }],
    })
    expect(second.at(-2)).toMatchObject({ role: 'tool', tool_call_id: 'call-1' })
    expect(second.at(-1)).toEqual({ role: 'system', content: ANSWER_NOW_INSTRUCTION })
  })

  it('numbers overlapping sources from two searches by their place in the citation list', async () => {
    const doc = (name: string, id?: string) => ({ id, title: name, source: `${name}.txt`, snippet: `${name} text` })
    const found = (...docs: ReturnType<typeof doc>[]) => ({ chunks: docs, citations: docs })
    // First search (planner): A B C. Second search (answer step): C D A E,
    // where A comes back with an id the first result lacked → matched by text.
    planSearch = 'creatine'
    rag
      .mockResolvedValueOnce(found(doc('A'), doc('B'), doc('C', 'c1')))
      .mockResolvedValueOnce(found(doc('C', 'c1'), doc('D'), doc('A'), doc('E')))
    const search = { toolCall: { name: 'query_knowledge_base', arguments: '{"query":"creatine dose"}' } }
    streams = { [HYDROGEN]: [[search], ['Take 3–5 g [1][4].']] }

    const answer = await ask().result

    // The list the user sees: each source once, in first-seen order.
    expect(answer.citations.map((c) => c.title)).toEqual(['A', 'B', 'C', 'D', 'E'])
    // Labels the model saw: repeats keep their first number, new ones follow on.
    const toolResults = answerPrompts[1].filter((m) => (m as { role: string }).role === 'tool') as Array<{ content: string }>
    const labels = (text: string) => [...text.matchAll(/\[(\d+)\] "(\w)"/g)].map(([, n, title]) => `${n}${title}`)
    expect(labels(toolResults[0].content)).toEqual(['1A', '2B', '3C'])
    expect(labels(toolResults[1].content)).toEqual(['3C', '4D', '1A', '5E'])
  })

  it('runs only one extra round of tools, then lets the next model answer', async () => {
    const search = { toolCall: { name: 'query_knowledge_base', arguments: '{"query":"creatine"}' } }
    streams = { [HYDROGEN]: [[search], [search]], [FLASH_38]: ['Done.'] }
    const { result } = ask()

    expect((await result).answer).toBe('Done.')
    expect(rag).toHaveBeenCalledTimes(1)
    expect(asked.filter((a) => a.kind === 'stream').map((a) => a.model)).toEqual([HYDROGEN, HYDROGEN, FLASH_38])
  })

  it('finds the answering model in the order even with a prefixed name', () => {
    const order = [HYDROGEN, FLASH_38, FLASH_36]
    expect(modelsAfter(order, `models/${FLASH_38}`)).toEqual([FLASH_36])
    expect(modelsAfter(order, FLASH_36)).toEqual([])
    expect(modelsAfter(order, undefined)).toEqual([FLASH_38, FLASH_36])
  })

  it('plans with the next model when planning is rate-limited, then streams from the first again', async () => {
    planRateLimited = [HYDROGEN]
    streams = { [HYDROGEN]: ['Fine.'] }
    const { tokens, result } = ask()

    expect((await result).answer).toBe('Fine.')
    expect(tokens).toEqual(['Fine.'])
    // Each call starts from the top of the order: a fallback is not sticky.
    expect(asked).toEqual([
      { model: HYDROGEN, kind: 'plan' },
      { model: FLASH_38, kind: 'plan' },
      { model: HYDROGEN, kind: 'stream' },
    ])
  })
})
