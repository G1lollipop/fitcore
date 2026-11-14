// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@/lib/openaiClient', () => ({ openai: { chat: { completions: { create: mocks.create } } } }))
vi.mock('@/lib/ai/rag-client', () => ({ chatWithRagRetrieve: vi.fn() }))

import { runAgent } from '@/lib/ai/agent'
import { GEMINI_GENERATION_MODELS } from '@/lib/ai/model'
import type { UserContextPayload } from '@/lib/ai/types'

const [HYDROGEN, FLASH_38, FLASH_36] = GEMINI_GENERATION_MODELS
const rateLimited = () => Object.assign(new Error('429 Too Many Requests'), { status: 429 })
const overloaded = () => Object.assign(new Error('503 high demand'), { status: 503 })

type Step = string | Error
/** What each model does when asked to stream: yield text pieces, or fail at that point. */
let streams: Record<string, Step[]>
/** Models whose planning call is rate-limited. */
let planRateLimited: string[]
const asked: Array<{ model: string; kind: 'plan' | 'stream' }> = []
const signals: Array<AbortSignal | undefined> = []

beforeEach(() => {
  streams = {}
  planRateLimited = []
  asked.length = 0
  signals.length = 0
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  mocks.create.mockReset()
  mocks.create.mockImplementation(async (params: { model: string; stream?: boolean }, options?: { signal?: AbortSignal }) => {
    asked.push({ model: params.model, kind: params.stream ? 'stream' : 'plan' })
    signals.push(options?.signal)
    if (!params.stream) {
      if (planRateLimited.includes(params.model)) throw rateLimited()
      // The planner answers directly: no tools to run.
      return { model: params.model, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: null } }] }
    }
    const steps = streams[params.model] ?? []
    if (steps[0] instanceof Error) throw steps[0]
    return (async function* () {
      yield { choices: [{ index: 0, delta: { role: 'assistant' } }] }
      for (const step of steps) {
        if (step instanceof Error) throw step
        yield { choices: [{ index: 0, delta: { content: step } }] }
      }
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
