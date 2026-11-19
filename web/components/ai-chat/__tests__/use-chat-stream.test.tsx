import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en } from '@/lib/i18n/dictionaries/en'
import { useChatStream } from '../hooks/use-chat-stream'
import type { Message } from '../types'

vi.mock('@/lib/i18n/provider', async () => {
  const { en } = await import('@/lib/i18n/dictionaries/en')
  return { useLanguage: () => ({ t: en }) }
})

/** A fetch reply whose body is exactly `body` (an SSE stream). */
function sseResponse(body: string, init: ResponseInit = { status: 200 }) {
  return new Response(body, init)
}

async function ask(response: Response | Error) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (response instanceof Error) throw response
      return response
    })
  )
  const { result } = renderHook(() => {
    const [messages, setMessages] = useState<Message[]>([])
    return { messages, ...useChatStream({ conversationId: 'c1', setMessages }) }
  })
  await act(() => result.current.sendMessage('How many calories should I eat?'))
  const answer = result.current.messages.find((m) => m.role === 'assistant')!
  return { answer, isTyping: result.current.isTyping }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useChatStream', () => {
  it('shows a streamed answer and finishes on `done`', async () => {
    const { answer, isTyping } = await ask(
      sseResponse(
        'data: {"type":"token","content":"About 2,600"}\n\n' +
          'data: {"type":"token","content":" kcal a day."}\n\n' +
          'data: {"type":"done","mode":"knowledge","citations":[{"title":"Guide","source":"kb","snippet":"…"}],"toolsUsed":["query_knowledge_base"],"meta":{}}\n\n'
      )
    )
    expect(answer.content).toBe('About 2,600 kcal a day.')
    expect(answer.isStreaming).toBe(false)
    expect(answer.citations).toHaveLength(1)
    expect(isTyping).toBe(false)
  })

  it('stops the cursor and says so when the stream is cut off after some text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { answer } = await ask(sseResponse('data: {"type":"token","content":"Most adults need roughly"}\n\n'))
    expect(answer.isStreaming).toBe(false)
    expect(answer.content).toBe(`Most adults need roughly\n\n${en.aiChat.interrupted}`)
  })

  it('never leaves a blank, blinking reply when the stream closes with nothing', async () => {
    const { answer } = await ask(sseResponse(''))
    expect(answer.isStreaming).toBe(false)
    expect(answer.content).toBe(en.aiChat.interrupted)
  })

  it('says the coach is busy, instead of showing provider text, when no model can answer', async () => {
    const { answer } = await ask(sseResponse('data: {"type":"error","code":"ai_unavailable","message":""}\n\n'))
    expect(answer.content).toBe(en.aiChat.busy)
    expect(answer.isStreaming).toBe(false)
  })

  it('keeps text that already streamed when an error event follows it', async () => {
    const { answer } = await ask(
      sseResponse(
        'data: {"type":"token","content":"Most adults need roughly"}\n\n' +
          'data: {"type":"error","message":"stream failed"}\n\n'
      )
    )
    expect(answer.isStreaming).toBe(false)
    expect(answer.content).toBe(`Most adults need roughly\n\n${en.aiChat.interrupted}`)
    expect(answer.content).not.toContain('stream failed')
  })

  it('keeps the text that arrived when the connection drops', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { answer } = await ask(new TypeError('network error'))
    expect(answer.content).toBe(en.aiChat.interrupted)
    expect(answer.content).not.toContain('network error')
  })
})
