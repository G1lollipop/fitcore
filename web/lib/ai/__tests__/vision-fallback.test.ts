// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getGenerativeModel: vi.fn(),
  generateContent: vi.fn(),
}))
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel = mocks.getGenerativeModel
  },
}))

import { generateVisionJson } from '@/lib/ai/gemini-client'
import { AttemptTimeoutError, GEMINI_GENERATION_MODELS } from '@/lib/ai/model'

const [HYDROGEN, FLASH_38, FLASH_36] = GEMINI_GENERATION_MODELS
const parts = ['Describe the meal as JSON.', { inlineData: { data: 'aGVsbG8=', mimeType: 'image/jpeg' } }]
const meal = { food_name: 'Chicken salad', calories: 420, protein: 35, carbs: 12, fat: 24 }
const QUICK = { attemptTimeoutMs: 40, totalTimeoutMs: 2_000 }

// As @google/generative-ai raises them.
const sdkError = (status: number, text: string) => Object.assign(new Error(`[${status} ${text}]`), { status })
const rateLimited = () => sdkError(429, 'Too Many Requests] You exceeded your current quota')
const overloaded = () => sdkError(503, 'Service Unavailable] The model is overloaded')
type RequestOptions = { signal: AbortSignal; timeout: number }
/** Never answers, unless the SDK is told to stop. */
const hang = (_model: string, _input: unknown, options: RequestOptions) =>
  new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)))

beforeEach(() => {
  vi.stubEnv('GOOGLE_AI_STUDIO_API_KEY', 'test-key')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  mocks.generateContent.mockReset()
  mocks.getGenerativeModel.mockReset()
  mocks.getGenerativeModel.mockImplementation((config: { model: string }) => ({
    generateContent: (input: unknown, options: RequestOptions) =>
      mocks.generateContent(config.model, input, options),
  }))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

const answer = (value: unknown) => ({ response: { text: () => JSON.stringify(value) } })
const modelsAsked = () => mocks.generateContent.mock.calls.map(([model]) => model)

describe('generateVisionJson', () => {
  it('asks gemini-4-hydrogen first and forces JSON output', async () => {
    mocks.generateContent.mockResolvedValue(answer(meal))

    const result = await generateVisionJson(parts)

    expect(modelsAsked()).toEqual([HYDROGEN])
    expect(mocks.getGenerativeModel).toHaveBeenCalledWith({
      model: HYDROGEN,
      generationConfig: { responseMimeType: 'application/json' },
    })
    expect(mocks.generateContent.mock.calls[0][1]).toBe(parts)
    expect(result.model).toBe(HYDROGEN)
    expect(JSON.parse(result.text)).toEqual(meal)
  })

  it.each([
    ['returns 503', (): unknown => Promise.reject(overloaded())],
    ['times out', hang],
  ])('recognises the photo with gemini-3.6-flash when Hydrogen returns 429 and 3.8 %s', async (_label, flash38) => {
    mocks.generateContent.mockImplementation((model: string, input: unknown, options: RequestOptions) => {
      if (model === HYDROGEN) return Promise.reject(rateLimited())
      if (model === FLASH_38) return flash38(model, input, options)
      return Promise.resolve(answer(meal))
    })

    const result = await generateVisionJson(parts, GEMINI_GENERATION_MODELS, QUICK)

    expect(modelsAsked()).toEqual([HYDROGEN, FLASH_38, FLASH_36])
    // Same image and JSON settings for every model, each with its own time
    // limit: the attempt limit, except for the last model, which has nothing
    // to fall back to and gets what is left of the total.
    const calls = mocks.generateContent.mock.calls
    calls.forEach(([, input, options], i) => {
      expect(input).toBe(parts)
      const limit = i === calls.length - 1 ? QUICK.totalTimeoutMs : QUICK.attemptTimeoutMs
      expect(options.timeout).toBeLessThanOrEqual(limit)
      expect(options.signal).toBeInstanceOf(AbortSignal)
    })
    for (const [config] of mocks.getGenerativeModel.mock.calls) {
      expect(config.generationConfig).toEqual({ responseMimeType: 'application/json' })
    }
    // The structured reply of the model that answered is what the caller parses.
    expect(result.model).toBe(FLASH_36)
    expect(JSON.parse(result.text)).toEqual(meal)
  })

  it.each([
    ['an invalid image', sdkError(400, 'Bad Request] Unable to process input image')],
    ['an invalid API key', sdkError(403, 'Forbidden] API key not valid')],
  ])('stops on %s', async (_label, failure) => {
    mocks.generateContent.mockRejectedValue(failure)

    await expect(generateVisionJson(parts, GEMINI_GENERATION_MODELS, QUICK)).rejects.toBe(failure)
    expect(modelsAsked()).toEqual([HYDROGEN])
  })

  it('bounds the total wait when no model answers', async () => {
    mocks.generateContent.mockImplementation(hang)
    const startedAt = Date.now()

    await expect(
      generateVisionJson(parts, GEMINI_GENERATION_MODELS, { attemptTimeoutMs: 40, totalTimeoutMs: 60 })
    ).rejects.toBeInstanceOf(AttemptTimeoutError)

    expect(modelsAsked()).toEqual([HYDROGEN, FLASH_38])
    expect(Date.now() - startedAt).toBeLessThan(1_000)
  })

  it('reports the last error when every model has failed over', async () => {
    mocks.generateContent.mockRejectedValue(rateLimited())

    await expect(generateVisionJson(parts, GEMINI_GENERATION_MODELS, QUICK)).rejects.toMatchObject({ status: 429 })
    expect(modelsAsked()).toEqual([HYDROGEN, FLASH_38, FLASH_36])
  })
})
