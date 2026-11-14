// @vitest-environment node
import OpenAI from 'openai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The shared client needs a key at import time; these tests bring their own.
vi.mock('@/lib/openaiClient', () => ({ openai: {} }))

import { createChatCompletion, streamChatCompletion, type ChatClient } from '@/lib/ai/chat-completion'
import {
  AttemptTimeoutError,
  GEMINI_GENERATION_MODELS,
  GOOGLE_OPENAI_BASE_URL,
  failoverReason,
  isQuotaError,
  resolveModelChain,
  withModelFallback,
  withoutUnsupportedSampling,
} from '@/lib/ai/model'

const [HYDROGEN, FLASH_38, FLASH_36] = GEMINI_GENERATION_MODELS
/** Short limits so that "the model never answers" takes milliseconds to test. */
const QUICK = { attemptTimeoutMs: 40, totalTimeoutMs: 2_000 }

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

// ── Errors, as the two SDKs raise them ───────────────────────────────────────
const withStatus = (status: number, message: string) => Object.assign(new Error(message), { status })
const rateLimited = () => withStatus(429, '429 Too Many Requests')
const resourceExhausted = () =>
  Object.assign(new Error('Quota exceeded for metric'), {
    error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' },
  })
const overloaded = () => withStatus(503, '503 This model is currently experiencing high demand')
const badRequest = () => withStatus(400, '400 Invalid argument')
const unauthorized = () => withStatus(401, '401 API key not valid')
const forbidden = () => withStatus(403, '403 Permission denied')
/** An attempt that never answers, unless it is told to stop. */
const hang = (signal?: AbortSignal) =>
  new Promise<never>((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason)))

describe('the model order', () => {
  it('is gemini-4-hydrogen, then gemini-3.8-flash, then gemini-3.6-flash', () => {
    expect([...GEMINI_GENERATION_MODELS]).toEqual([
      'gemini-4-hydrogen',
      'gemini-3.8-flash',
      'gemini-3.6-flash',
    ])
    expect(resolveModelChain(undefined)).toEqual([HYDROGEN, FLASH_38, FLASH_36])
    expect(resolveModelChain('  ')).toEqual([HYDROGEN, FLASH_38, FLASH_36])
  })

  it('ignores a leftover gemini-2.5-flash setting instead of putting it first', () => {
    for (const leftover of ['gemini-2.5-flash', 'models/gemini-2.5-flash', ' Gemini-2.5-Flash ']) {
      expect(resolveModelChain(leftover)).toEqual([HYDROGEN, FLASH_38, FLASH_36])
    }
  })

  it('puts an explicitly chosen model first, followed by the rest of the order', () => {
    expect(resolveModelChain('gemini-3.8-flash')).toEqual([FLASH_38, HYDROGEN, FLASH_36])
    expect(resolveModelChain('models/gemini-3.6-flash')).toEqual([FLASH_36, HYDROGEN, FLASH_38])
    expect(resolveModelChain('gemini-4-argon')).toEqual(['gemini-4-argon', HYDROGEN, FLASH_38, FLASH_36])
    expect(resolveModelChain('gemini-4-hydrogen')).toEqual([HYDROGEN, FLASH_38, FLASH_36])
  })

  it('uses the configured model alone on another provider', () => {
    expect(resolveModelChain('gpt-x', { googleEndpoint: false })).toEqual(['gpt-x'])
    // The setting is the other provider's business, even if it looks like an old Gemini name.
    expect(resolveModelChain('gemini-2.5-flash', { googleEndpoint: false })).toEqual(['gemini-2.5-flash'])
  })
})

describe('environment settings', () => {
  const load = async () => {
    vi.resetModules()
    return import('@/lib/ai/model')
  }

  it('defaults every kind of call to the standard order', async () => {
    for (const name of ['AI_CHAT_MODEL', 'AI_FAST_MODEL', 'GEMINI_VISION_MODEL', 'OPENAI_BASE_URL']) vi.stubEnv(name, '')
    const model = await load()
    expect(model.AI_CHAT_MODELS).toEqual([HYDROGEN, FLASH_38, FLASH_36])
    expect(model.AI_FAST_MODELS).toEqual([HYDROGEN, FLASH_38, FLASH_36])
    expect(model.GEMINI_VISION_MODELS).toEqual([HYDROGEN, FLASH_38, FLASH_36])
    expect(model.AI_CHAT_MODEL).toBe(HYDROGEN)
  })

  it('does not let existing gemini-2.5-flash settings override the new default', async () => {
    vi.stubEnv('OPENAI_BASE_URL', '')
    vi.stubEnv('AI_CHAT_MODEL', 'gemini-2.5-flash')
    vi.stubEnv('AI_FAST_MODEL', 'gemini-2.5-flash')
    vi.stubEnv('GEMINI_VISION_MODEL', 'gemini-2.5-flash')
    const model = await load()

    expect(model.AI_CHAT_MODELS).toEqual([HYDROGEN, FLASH_38, FLASH_36])
    expect(model.AI_FAST_MODELS).toEqual([HYDROGEN, FLASH_38, FLASH_36])
    expect(model.GEMINI_VISION_MODELS).toEqual([HYDROGEN, FLASH_38, FLASH_36])
    // Each ignored setting is called out once in the server log.
    const warnings = vi.mocked(console.warn).mock.calls.map(([line]) => String(line))
    for (const name of ['AI_CHAT_MODEL', 'AI_FAST_MODEL', 'GEMINI_VISION_MODEL']) {
      expect(warnings.some((line) => line.includes(`${name}=gemini-2.5-flash`))).toBe(true)
    }
  })

  it('lets the fast model follow a real chat setting when its own is a leftover', async () => {
    vi.stubEnv('OPENAI_BASE_URL', '')
    vi.stubEnv('AI_CHAT_MODEL', 'gemini-4-argon')
    vi.stubEnv('AI_FAST_MODEL', 'gemini-2.5-flash')
    const model = await load()
    expect(model.AI_FAST_MODELS[0]).toBe('gemini-4-argon')
  })

  it('keeps a single configured model, and no Gemini fallback, for another provider', async () => {
    vi.stubEnv('OPENAI_BASE_URL', 'https://llm.example.com/v1')
    vi.stubEnv('AI_CHAT_MODEL', 'some-model')
    vi.stubEnv('AI_FAST_MODEL', '')
    vi.stubEnv('GEMINI_VISION_MODEL', '')
    const model = await load()
    expect(model.AI_USES_GOOGLE).toBe(false)
    expect(model.AI_CHAT_MODELS).toEqual(['some-model'])
    expect(model.AI_FAST_MODELS).toEqual(['some-model'])
    // Vision always goes to Google, whatever the text provider is.
    expect(model.GEMINI_VISION_MODELS).toEqual([HYDROGEN, FLASH_38, FLASH_36])
  })
})

describe('failoverReason', () => {
  it('moves on for quota errors: HTTP 429 or RESOURCE_EXHAUSTED', () => {
    expect(failoverReason(rateLimited())).toBe('quota')
    expect(failoverReason(resourceExhausted())).toBe('quota')
    expect(failoverReason({ response: { status: 429 } })).toBe('quota')
    // A stream that fails part-way reports only the body.
    expect(failoverReason(new Error('{"error":{"status":"RESOURCE_EXHAUSTED"}}'))).toBe('quota')
    expect(isQuotaError(rateLimited())).toBe(true)
    expect(isQuotaError(overloaded())).toBe(false)
  })

  it('moves on for an unavailable model: HTTP 503 or UNAVAILABLE', () => {
    expect(failoverReason(overloaded())).toBe('unavailable')
    // @google/generative-ai: status on the error, details alongside.
    expect(failoverReason(withStatus(503, '[503 Service Unavailable] overloaded'))).toBe('unavailable')
    expect(failoverReason(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'))).toBe('unavailable')
    expect(failoverReason({ message: 'failed', errorDetails: [{ reason: 'UNAVAILABLE' }] })).toBe('unavailable')
  })

  it('moves on for a timeout: ours, the SDK’s, or Google’s', () => {
    expect(failoverReason(new AttemptTimeoutError(HYDROGEN, 30_000))).toBe('timeout')
    expect(failoverReason(Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }))).toBe('timeout')
    expect(failoverReason(withStatus(504, '504 Deadline exceeded'))).toBe('timeout')
    expect(failoverReason(new Error('{"error":{"status":"DEADLINE_EXCEEDED"}}'))).toBe('timeout')
  })

  it('stops for invalid requests, auth errors and cancellation', () => {
    expect(failoverReason(badRequest())).toBeNull()
    expect(failoverReason(unauthorized())).toBeNull()
    expect(failoverReason(forbidden())).toBeNull()
    expect(failoverReason(withStatus(404, '404 model not found'))).toBeNull()
    expect(failoverReason(Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' }))).toBeNull()
    expect(failoverReason(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }))).toBeNull()
  })

  it('stops for anything else, and is not fooled by wording', () => {
    expect(failoverReason(withStatus(500, '500 Internal error'))).toBeNull()
    expect(failoverReason(new Error('fetch failed'))).toBeNull()
    expect(failoverReason(undefined)).toBeNull()
    // The status decides when there is one, whatever the message says.
    expect(failoverReason(withStatus(400, '400 UNAVAILABLE in your region: RESOURCE_EXHAUSTED'))).toBeNull()
    // Only the status names count, not ordinary words or digits.
    expect(failoverReason(new Error('The knowledge base is temporarily unavailable'))).toBeNull()
    expect(failoverReason(new Error('max_tokens must be below 4290 or 5030'))).toBeNull()
  })
})

describe('withModelFallback', () => {
  type Outcome = (() => Error) | 'hang'
  const tryModels = async (failures: Record<string, Outcome>, options = QUICK) => {
    const tried: string[] = []
    const abandoned: string[] = []
    const startedAt = Date.now()
    const result = await withModelFallback(
      GEMINI_GENERATION_MODELS,
      async (model, attempt) => {
        tried.push(model)
        attempt.signal.addEventListener('abort', () => abandoned.push(model))
        const failure = failures[model]
        if (failure === 'hang') return hang(attempt.signal)
        if (failure) throw failure()
        return `answer from ${model}`
      },
      options
    ).then((value) => value, (error: Error) => error)
    return { tried, abandoned, result, elapsedMs: Date.now() - startedAt }
  }

  it('uses the first model when it answers', async () => {
    const { tried, result } = await tryModels({})
    expect(tried).toEqual([HYDROGEN])
    expect(result).toBe(`answer from ${HYDROGEN}`)
  })

  it.each([
    ['returns 503', overloaded as Outcome],
    ['times out', 'hang' as Outcome],
  ])('reaches gemini-3.6-flash when Hydrogen returns 429 and 3.8 %s', async (_label, flash38) => {
    const { tried, result } = await tryModels({ [HYDROGEN]: rateLimited, [FLASH_38]: flash38 })

    expect(tried).toEqual([HYDROGEN, FLASH_38, FLASH_36])
    expect(result).toBe(`answer from ${FLASH_36}`)
  })

  it('moves down the order one model at a time, for each kind of failover', async () => {
    expect((await tryModels({ [HYDROGEN]: rateLimited })).tried).toEqual([HYDROGEN, FLASH_38])
    expect((await tryModels({ [HYDROGEN]: resourceExhausted })).tried).toEqual([HYDROGEN, FLASH_38])
    expect((await tryModels({ [HYDROGEN]: overloaded })).tried).toEqual([HYDROGEN, FLASH_38])
    expect((await tryModels({ [HYDROGEN]: 'hang' })).tried).toEqual([HYDROGEN, FLASH_38])
  })

  it('gives up on a model that never answers after the attempt time, and cancels its request', async () => {
    const { tried, abandoned, result, elapsedMs } = await tryModels({ [HYDROGEN]: 'hang' })

    expect(tried).toEqual([HYDROGEN, FLASH_38])
    expect(abandoned).toEqual([HYDROGEN])
    expect(result).toBe(`answer from ${FLASH_38}`)
    expect(elapsedMs).toBeGreaterThanOrEqual(QUICK.attemptTimeoutMs - 5)
    expect(elapsedMs).toBeLessThan(1_000)
  })

  it('does not wait for a request that ignores the cancel signal', async () => {
    const tried: string[] = []
    const result = await withModelFallback(
      GEMINI_GENERATION_MODELS,
      (model) => {
        tried.push(model)
        return model === HYDROGEN ? new Promise<string>(() => {}) : Promise.resolve('ok')
      },
      QUICK
    )
    expect(result).toBe('ok')
    expect(tried).toEqual([HYDROGEN, FLASH_38])
  })

  it('bounds the total wait: no model is started once the time is used up', async () => {
    const { tried, result, elapsedMs } = await tryModels(
      { [HYDROGEN]: 'hang', [FLASH_38]: 'hang', [FLASH_36]: 'hang' },
      { attemptTimeoutMs: 40, totalTimeoutMs: 60 }
    )

    // Hydrogen gets its 40 ms, 3.8 the 20 ms that are left, 3.6 nothing.
    expect(tried).toEqual([HYDROGEN, FLASH_38])
    expect(result).toBeInstanceOf(AttemptTimeoutError)
    expect((result as AttemptTimeoutError).model).toBe(FLASH_38)
    expect(elapsedMs).toBeLessThan(500)
  })

  it('reports the last error when every model fails over', async () => {
    const { tried, result } = await tryModels({
      [HYDROGEN]: rateLimited,
      [FLASH_38]: overloaded,
      [FLASH_36]: resourceExhausted,
    })
    expect(tried).toEqual([HYDROGEN, FLASH_38, FLASH_36])
    expect((result as Error).message).toBe('Quota exceeded for metric')
  })

  it.each([
    ['an invalid request', badRequest],
    ['an authentication error', unauthorized],
    ['a permission error', forbidden],
    ['a server error', () => withStatus(500, '500 Internal error')],
    ['a network failure', () => new Error('fetch failed')],
  ])('stops at once on %s', async (_label, failure) => {
    const { tried, result } = await tryModels({ [HYDROGEN]: failure })
    expect(tried).toEqual([HYDROGEN])
    expect(result).toBeInstanceOf(Error)

    // Also part-way down the order.
    const later = await tryModels({ [HYDROGEN]: rateLimited, [FLASH_38]: failure })
    expect(later.tried).toEqual([HYDROGEN, FLASH_38])
    expect(later.result).toBeInstanceOf(Error)
  })

  it('stops when the user cancels, without trying another model', async () => {
    const user = new AbortController()
    const tried: string[] = []
    const call = withModelFallback(
      GEMINI_GENERATION_MODELS,
      (model, attempt) => {
        tried.push(model)
        return hang(attempt.signal)
      },
      { ...QUICK, attemptTimeoutMs: 5_000, signal: user.signal }
    )
    user.abort()

    await expect(call).rejects.toMatchObject({ name: 'AbortError' })
    expect(tried).toEqual([HYDROGEN])

    // Already cancelled: nothing is asked at all.
    await expect(
      withModelFallback(GEMINI_GENERATION_MODELS, async (model) => void tried.push(model), { signal: user.signal })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(tried).toEqual([HYDROGEN])
  })

  it('does not treat a cancellation that arrives with a 503 as a reason to go on', async () => {
    const user = new AbortController()
    const tried: string[] = []
    const call = withModelFallback(
      GEMINI_GENERATION_MODELS,
      async (model) => {
        tried.push(model)
        user.abort()
        throw overloaded()
      },
      { ...QUICK, signal: user.signal }
    )
    await expect(call).rejects.toMatchObject({ name: 'AbortError' })
    expect(tried).toEqual([HYDROGEN])
  })
})

// ── Through the real OpenAI SDK, with only the network replaced ──────────────

type Body = Record<string, unknown> & { model: string }
type Reply = Response | 'hang'
function sdkClient(respond: (body: Body) => Reply) {
  const requests: Body[] = []
  const cancelled: string[] = []
  const network: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Body
    requests.push(body)
    const reply = respond(body)
    if (reply !== 'hang') return reply
    init?.signal?.addEventListener('abort', () => cancelled.push(body.model))
    return hang(init?.signal ?? undefined)
  }
  // Built like the app's client: the SDK's default retries are left on, so
  // these tests fail (slowly) if a call does not switch them off itself.
  const client = new OpenAI({ apiKey: 'test-key', baseURL: GOOGLE_OPENAI_BASE_URL, fetch: network })
  return { client, requests, cancelled }
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
// A long retry-after: if the SDK retried the model, the test would time out.
const http429 = () =>
  json(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } }, { 'retry-after': '120' })
const http503 = () =>
  json(503, { error: { code: 503, status: 'UNAVAILABLE', message: 'This model is currently experiencing high demand.' } })
const completion = (model: string, message: Record<string, unknown>) =>
  json(200, {
    id: 'cmpl-1',
    object: 'chat.completion',
    created: 0,
    model,
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', ...message } }],
  })
const sse = (model: string, deltas: Array<Record<string, unknown>>) =>
  new Response(
    deltas
      .map((delta) => `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 0, model, choices: [{ index: 0, delta }] })}\n\n`)
      .join('') + 'data: [DONE]\n\n',
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  )
const hello = { messages: [{ role: 'user' as const, content: 'hi' }] }

describe('createChatCompletion', () => {
  it.each([
    ['returns 503', http503 as () => Reply],
    ['times out', (() => 'hang') as () => Reply],
  ])('answers from gemini-3.6-flash when Hydrogen returns 429 and 3.8 %s', async (_label, flash38) => {
    const { client, requests, cancelled } = sdkClient((body) =>
      body.model === HYDROGEN ? http429() : body.model === FLASH_38 ? flash38() : completion(body.model, { content: 'hello' })
    )
    const startedAt = Date.now()

    const reply = await createChatCompletion(GEMINI_GENERATION_MODELS, hello, { client, ...QUICK })

    // One request per model: neither the 429 nor the 503 was retried by the SDK.
    expect(requests.map((r) => r.model)).toEqual([HYDROGEN, FLASH_38, FLASH_36])
    expect(reply.model).toBe(FLASH_36)
    expect(reply.choices[0].message.content).toBe('hello')
    expect(Date.now() - startedAt).toBeLessThan(2_000)
    // A request that was given up on is cancelled, not left running.
    if (_label === 'times out') expect(cancelled).toEqual([FLASH_38])
  })

  it('fails with the last error once every model has failed over', async () => {
    const { client, requests } = sdkClient((body) => (body.model === FLASH_36 ? http503() : http429()))

    await expect(createChatCompletion(GEMINI_GENERATION_MODELS, hello, { client, ...QUICK })).rejects.toMatchObject({
      status: 503,
    })
    expect(requests.map((r) => r.model)).toEqual([HYDROGEN, FLASH_38, FLASH_36])
  })

  it.each([
    ['an invalid request', 400, 'INVALID_ARGUMENT'],
    ['an authentication error', 401, 'UNAUTHENTICATED'],
    ['a permission error', 403, 'PERMISSION_DENIED'],
  ])('stops on %s without trying another model', async (_label, status, name) => {
    const { client, requests } = sdkClient(() => json(status, { error: { code: status, status: name, message: name } }))

    await expect(createChatCompletion(GEMINI_GENERATION_MODELS, hello, { client, ...QUICK })).rejects.toMatchObject({
      status,
    })
    expect(requests.map((r) => r.model)).toEqual([HYDROGEN])
  })

  it('stops when the user cancels a pending request', async () => {
    const user = new AbortController()
    const { client, requests, cancelled } = sdkClient(() => 'hang')

    const call = createChatCompletion(GEMINI_GENERATION_MODELS, hello, { client, signal: user.signal })
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    user.abort()

    await expect(call).rejects.toMatchObject({ name: 'AbortError' })
    expect(requests.map((r) => r.model)).toEqual([HYDROGEN])
    expect(cancelled).toEqual([HYDROGEN])
  })

  it('bounds the total wait across models', async () => {
    const { client, requests } = sdkClient(() => 'hang')
    const startedAt = Date.now()

    await expect(
      createChatCompletion(GEMINI_GENERATION_MODELS, hello, { client, attemptTimeoutMs: 40, totalTimeoutMs: 60 })
    ).rejects.toBeInstanceOf(AttemptTimeoutError)

    expect(requests.map((r) => r.model)).toEqual([HYDROGEN, FLASH_38])
    expect(Date.now() - startedAt).toBeLessThan(1_000)
  })

  it('sends the same structured-output request to the fallback model and returns its JSON', async () => {
    const plan = { items: [{ kind: 'food', food_name: 'oatmeal' }] }
    const { client, requests } = sdkClient((body) =>
      body.model === HYDROGEN ? http429() : body.model === FLASH_38 ? http503() : completion(body.model, { content: JSON.stringify(plan) })
    )

    const reply = await createChatCompletion(
      GEMINI_GENERATION_MODELS,
      {
        messages: [
          { role: 'system', content: 'Reply in JSON.' },
          { role: 'user', content: 'oatmeal' },
        ],
        response_format: { type: 'json_object' },
      },
      { client, ...QUICK }
    )

    expect(requests.map((r) => r.model)).toEqual([HYDROGEN, FLASH_38, FLASH_36])
    for (const request of requests) {
      expect(request.response_format).toEqual({ type: 'json_object' })
      expect(request.messages).toEqual(requests[0].messages)
    }
    expect(JSON.parse(reply.choices[0].message.content!)).toEqual(plan)
  })

  it('keeps tool definitions and returns the fallback model’s tool calls', async () => {
    const tools = [{ type: 'function' as const, function: { name: 'get_user_stats', parameters: { type: 'object', properties: {} } } }]
    const toolCalls = [{ id: 'call-1', type: 'function', function: { name: 'get_user_stats', arguments: '{}' } }]
    const { client, requests } = sdkClient((body) =>
      body.model === HYDROGEN ? http503() : completion(body.model, { content: null, tool_calls: toolCalls })
    )

    const reply = await createChatCompletion(
      GEMINI_GENERATION_MODELS,
      { messages: [{ role: 'user', content: 'how am I doing?' }], tools, tool_choice: 'auto', max_tokens: 300 },
      { client, ...QUICK }
    )

    expect(requests[1]).toMatchObject({ model: FLASH_38, tools, tool_choice: 'auto', max_tokens: 300 })
    expect(reply.choices[0].message.tool_calls).toEqual(toolCalls)
  })

  it('drops sampling parameters for the models that no longer take them, and only for those', async () => {
    const { client, requests } = sdkClient((body) =>
      body.model === 'custom-model' ? http429() : completion(body.model, { content: 'ok' })
    )

    await createChatCompletion(
      ['custom-model', HYDROGEN],
      { ...hello, temperature: 0.2, top_p: 0.9, max_tokens: 50 },
      { client, ...QUICK }
    )

    expect(requests[0]).toMatchObject({ model: 'custom-model', temperature: 0.2, top_p: 0.9, max_tokens: 50 })
    expect(requests[1]).toMatchObject({ model: HYDROGEN, max_tokens: 50 })
    expect(requests[1]).not.toHaveProperty('temperature')
    expect(requests[1]).not.toHaveProperty('top_p')
    expect(withoutUnsupportedSampling('models/gemini-3.6-flash', { temperature: 1, n: 1 })).toEqual({ n: 1 })
  })

  it('calls a single model as before: no fallback, no time limit of ours', async () => {
    const create = vi.fn(async () => ({ model: 'only-model', choices: [] }))
    const client = { chat: { completions: { create } } } as unknown as ChatClient

    await createChatCompletion(['only-model'], { ...hello, temperature: 0.3 }, { client })

    // No request options: the SDK's own retries and timeout stay as configured.
    expect(create).toHaveBeenCalledWith({ ...hello, temperature: 0.3, model: 'only-model' }, undefined)
  })
})

describe('streamChatCompletion', () => {
  type StreamChunk = { choices: Array<{ delta?: { role?: string; content?: string | null } }> }
  const collect = async (stream: AsyncIterable<StreamChunk>) => {
    const text: string[] = []
    let chunks = 0
    let error: unknown
    try {
      for await (const chunk of stream) {
        chunks++
        const token = chunk.choices[0]?.delta?.content
        if (token) text.push(token)
      }
    } catch (caught) {
      error = caught
    }
    return { text: text.join(''), chunks, error }
  }

  /**
   * A stand-in client whose streams can fail or stall part-way. A step is a
   * piece of text, `null` for a chunk with no text (like the opening role-only
   * chunk), an error to raise at that point, or 'hang' to stop answering.
   */
  type Step = string | null | Error | 'hang'
  function streamingClient(script: Record<string, Step[]>) {
    const tried: string[] = []
    const create = vi.fn(async (params: { model: string }, options?: { signal?: AbortSignal; maxRetries?: number }) => {
      tried.push(params.model)
      const steps = script[params.model]
      if (steps.length === 1 && steps[0] instanceof Error) throw steps[0]
      if (steps.length === 1 && steps[0] === 'hang') return hang(options?.signal)
      return (async function* () {
        for (const step of steps) {
          if (step instanceof Error) throw step
          if (step === 'hang') await hang(options?.signal)
          yield { choices: [{ index: 0, delta: step === null ? { role: 'assistant' } : { content: step } }] }
        }
      })()
    })
    return { client: { chat: { completions: { create } } } as unknown as ChatClient, tried, create }
  }
  const run = (client: ChatClient, options = {}) =>
    collect(streamChatCompletion(GEMINI_GENERATION_MODELS, { messages: [] }, { client, ...QUICK, ...options }))

  it('streams from the first model when it answers', async () => {
    const { client, tried, create } = streamingClient({ [HYDROGEN]: [null, 'Hel', 'lo'] })

    expect(await run(client)).toEqual({ text: 'Hello', chunks: 3, error: undefined })
    expect(tried).toEqual([HYDROGEN])
    // SDK retries are off for calls that have somewhere else to go.
    expect(create.mock.calls[0][1]).toMatchObject({ maxRetries: 0 })
  })

  it.each([
    ['returns 503', [overloaded()] as Step[]],
    ['sends an empty chunk and then 503', [null, overloaded()] as Step[]],
    ['never answers', ['hang'] as Step[]],
    ['sends an empty chunk and then stalls', [null, 'hang'] as Step[]],
  ])('streams from gemini-3.6-flash when Hydrogen returns 429 and 3.8 %s', async (_label, flash38) => {
    const { client, tried } = streamingClient({
      [HYDROGEN]: [rateLimited()],
      [FLASH_38]: flash38,
      [FLASH_36]: [null, 'From ', '3.6'],
    })

    const { text, chunks, error } = await run(client)

    expect(error).toBeUndefined()
    expect(text).toBe('From 3.6')
    // Only the answering model's chunks reach the caller — not the empty chunk
    // of the model that was abandoned.
    expect(chunks).toBe(3)
    expect(tried).toEqual([HYDROGEN, FLASH_38, FLASH_36])
  })

  it('falls back through the real SDK when the request is refused before the stream starts', async () => {
    const { client, requests } = sdkClient((body) =>
      body.model === HYDROGEN
        ? http429()
        : body.model === FLASH_38
          ? http503()
          : sse(body.model, [{ role: 'assistant' }, { content: 'Hi ' }, { content: 'there' }])
    )

    const { text, error } = await collect(
      streamChatCompletion(GEMINI_GENERATION_MODELS, { ...hello, temperature: 0.7 }, { client, ...QUICK })
    )

    expect(error).toBeUndefined()
    expect(text).toBe('Hi there')
    expect(requests.map((r) => [r.model, r.stream])).toEqual([[HYDROGEN, true], [FLASH_38, true], [FLASH_36, true]])
  })

  it('switches before visible text even though empty chunks have arrived', async () => {
    const { client, tried } = streamingClient({
      [HYDROGEN]: [null, null, resourceExhausted()],
      [FLASH_38]: [null, 'From ', 'the second model'],
    })

    const { text, error } = await run(client)

    expect(error).toBeUndefined()
    expect(text).toBe('From the second model')
    expect(tried).toEqual([HYDROGEN, FLASH_38])
  })

  it.each([
    ['a 429', rateLimited()],
    ['a 503', overloaded()],
    ['a timeout from the provider', withStatus(504, '504 Deadline exceeded')],
  ])('never switches models once text has started showing, even on %s', async (_label, failure) => {
    const { client, tried } = streamingClient({
      [HYDROGEN]: [null, 'Your protein ', 'target is', failure],
      [FLASH_38]: ['A different answer'],
    })

    const { text, error } = await run(client)

    // The text already shown stands; the failure is reported; no second model is asked.
    expect(text).toBe('Your protein target is')
    expect(error).toBe(failure)
    expect(tried).toEqual([HYDROGEN])
  })

  it('does not cut off a reply for being slow once its text has started', async () => {
    const { client, tried } = streamingClient({ [HYDROGEN]: ['Slow ', 'but steady'] })
    // Far longer than the attempt time between the first text and the rest.
    const slow = {
      chat: {
        completions: {
          create: async (params: { model: string }) => {
            const stream = await (client.chat.completions.create as unknown as (p: unknown) => Promise<AsyncIterable<StreamChunk>>)(params)
            return (async function* () {
              for await (const chunk of stream) {
                yield chunk
                await new Promise((resolve) => setTimeout(resolve, 120))
              }
            })()
          },
        },
      },
    } as unknown as ChatClient

    expect((await run(slow)).text).toBe('Slow but steady')
    expect(tried).toEqual([HYDROGEN])
  })

  it.each([
    ['an invalid request', badRequest()],
    ['an authentication error', unauthorized()],
    ['a network failure', new Error('socket hang up')],
  ])('stops on %s, before or after empty chunks', async (_label, failure) => {
    const before = streamingClient({ [HYDROGEN]: [failure], [FLASH_38]: ['unused'] })
    expect((await run(before.client)).error).toBe(failure)
    expect(before.tried).toEqual([HYDROGEN])

    const during = streamingClient({ [HYDROGEN]: [null, failure], [FLASH_38]: ['unused'] })
    expect((await run(during.client)).error).toBe(failure)
    expect(during.tried).toEqual([HYDROGEN])
  })

  it('stops when the user cancels, before text and after it', async () => {
    const waiting = streamingClient({ [HYDROGEN]: [null, 'hang'], [FLASH_38]: ['unused'] })
    const user = new AbortController()
    const pending = run(waiting.client, { signal: user.signal, attemptTimeoutMs: 5_000 })
    await vi.waitFor(() => expect(waiting.tried).toEqual([HYDROGEN]))
    user.abort()
    expect((await pending).error).toMatchObject({ name: 'AbortError' })
    expect(waiting.tried).toEqual([HYDROGEN])

    const talking = streamingClient({ [HYDROGEN]: ['Some text', 'hang'], [FLASH_38]: ['unused'] })
    const later = new AbortController()
    const tokens: string[] = []
    const reading = (async () => {
      for await (const chunk of streamChatCompletion(GEMINI_GENERATION_MODELS, { messages: [] }, { client: talking.client, ...QUICK, signal: later.signal })) {
        tokens.push(chunk.choices[0]?.delta?.content ?? '')
        later.abort()
      }
    })()
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' })
    expect(tokens).toEqual(['Some text'])
    expect(talking.tried).toEqual([HYDROGEN])
  })

  it('bounds the wait for the first text across models', async () => {
    const { client, tried } = streamingClient({
      [HYDROGEN]: [null, 'hang'],
      [FLASH_38]: ['hang'],
      [FLASH_36]: ['unused'],
    })
    const startedAt = Date.now()

    const { text, error } = await run(client, { attemptTimeoutMs: 40, totalTimeoutMs: 60 })

    expect(text).toBe('')
    expect(error).toBeInstanceOf(AttemptTimeoutError)
    expect(tried).toEqual([HYDROGEN, FLASH_38])
    expect(Date.now() - startedAt).toBeLessThan(1_000)
  })

  it('fails with the last error when every model has failed over', async () => {
    const { client, tried } = streamingClient({
      [HYDROGEN]: [rateLimited()],
      [FLASH_38]: [overloaded()],
      [FLASH_36]: [resourceExhausted()],
    })

    const { text, error } = await run(client)

    expect(text).toBe('')
    expect(error).toMatchObject({ message: 'Quota exceeded for metric' })
    expect(tried).toEqual([HYDROGEN, FLASH_38, FLASH_36])
  })
})
