/**
 * Text generation through the OpenAI-compatible client, with the model
 * fallback order applied.
 *
 * Every text call in the app (Quick Log parsing, onboarding advice, plan
 * generation, coach planning and the coach's streamed answer) goes through one
 * of the two functions here instead of calling `openai.chat.completions.create`
 * with a single model.
 */

import type OpenAI from "openai"
import { openai } from "@/lib/openaiClient"
import {
  AttemptTimeoutError,
  cancellationError,
  failoverReason,
  logFallback,
  nextAttemptTimeout,
  withModelFallback,
  withoutUnsupportedSampling,
  type FallbackOptions,
} from "@/lib/ai/model"

type Completions = OpenAI["chat"]["completions"]
/** The part of the client these helpers need; lets tests pass a stand-in. */
export interface ChatClient {
  chat: { completions: Pick<Completions, "create"> }
}

export interface ChatOptions extends FallbackOptions {
  client?: ChatClient
}

type CreateParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
type StreamParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
type Completion = OpenAI.Chat.Completions.ChatCompletion
type Chunk = OpenAI.Chat.Completions.ChatCompletionChunk

/**
 * One complete (non-streamed) reply.
 *
 * With a fallback order (more than one model) the next model is tried when the
 * current one is out of quota, unavailable, or does not answer in time; the
 * SDK's own retries are switched off for these calls, because retrying the
 * same model only delays the move. The request — messages, `response_format`,
 * tools — is sent unchanged to whichever model answers; `completion.model`
 * says which one that was.
 *
 * A single model (another provider, or a model asked for explicitly) is called
 * exactly as before: no fallback, and the SDK's defaults untouched.
 */
export function createChatCompletion(
  models: readonly string[],
  params: Omit<CreateParams, "model" | "stream">,
  options: ChatOptions = {}
): Promise<Completion> {
  const client = options.client ?? openai
  if (models.length === 1) {
    return client.chat.completions.create(
      withoutUnsupportedSampling(models[0], { ...params, model: models[0] }),
      options.signal ? { signal: options.signal } : undefined
    )
  }
  return withModelFallback(
    models,
    (model, attempt) =>
      client.chat.completions.create(withoutUnsupportedSampling(model, { ...params, model }), {
        signal: attempt.signal,
        maxRetries: 0,
      }),
    options
  )
}

/** True once a chunk carries something the user would see (or a tool call). */
function hasOutput(chunk: Chunk): boolean {
  return chunk.choices.some(
    (choice) => !!choice.delta?.content || (choice.delta?.tool_calls?.length ?? 0) > 0
  )
}

/**
 * A streamed reply, as the chunks of whichever model answers.
 *
 * A model can only be replaced *before* it has produced visible text. Until
 * then — while the request is pending, and while only empty chunks (such as the
 * opening role-only chunk) have arrived — a quota error, an unavailable model,
 * or no text within the attempt's time moves on to the next model. Those empty
 * chunks are held back and only released together with the first text, so a
 * caller never sees anything from a model that was abandoned.
 *
 * Once text has been yielded the reply belongs to that model. A later failure
 * of any kind is thrown to the caller; it is never patched over with text from
 * another model, and no time limit of ours applies any more.
 *
 * The caller's `signal` cancels the stream at any point and stops the search.
 */
export async function* streamChatCompletion(
  models: readonly string[],
  params: Omit<StreamParams, "model" | "stream">,
  options: ChatOptions = {}
): AsyncGenerator<Chunk, void, undefined> {
  if (models.length === 0) throw new Error("No model configured")
  const client = options.client ?? openai
  const failover = models.length > 1
  const userSignal = options.signal
  const startedAt = Date.now()

  for (let i = 0; ; i++) {
    const model = models[i]
    if (userSignal?.aborted) throw cancellationError(userSignal)
    const timeoutMs = failover ? nextAttemptTimeout(startedAt, options) : null
    if (failover && timeoutMs === null) throw new AttemptTimeoutError(models[i - 1] ?? model, 0)

    // Aborted when this attempt runs out of time or the caller cancels.
    const controller = new AbortController()
    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true })
    })
    aborted.catch(() => {}) // only matters while something is racing against it
    const timer =
      timeoutMs === null
        ? undefined
        : setTimeout(() => controller.abort(new AttemptTimeoutError(model, timeoutMs)), timeoutMs)
    const onCancel = () => controller.abort(cancellationError(userSignal!))
    userSignal?.addEventListener("abort", onCancel, { once: true })

    let textStarted = false
    let iterator: AsyncIterator<Chunk> | undefined
    try {
      const stream = await Promise.race([
        client.chat.completions.create(
          withoutUnsupportedSampling(model, { ...params, model, stream: true as const }),
          failover ? { signal: controller.signal, maxRetries: 0 } : { signal: controller.signal }
        ),
        aborted,
      ])
      iterator = stream[Symbol.asyncIterator]()
      const held: Chunk[] = []
      for (;;) {
        const next = await Promise.race([iterator.next(), aborted])
        if (next.done) break
        if (!textStarted) {
          if (!hasOutput(next.value)) {
            held.push(next.value)
            continue
          }
          // First visible text: from here on this model owns the reply.
          textStarted = true
          clearTimeout(timer)
          yield* held
        }
        yield next.value
      }
      // A reply with no text at all: pass on whatever it did contain.
      if (!textStarted) yield* held
      return
    } catch (error) {
      if (textStarted) throw error
      if (userSignal?.aborted) throw cancellationError(userSignal)
      const reason = failover ? failoverReason(error) : null
      if (reason === null || i === models.length - 1) throw error
      // No time left for another model: report what stopped this one.
      if (nextAttemptTimeout(startedAt, options) === null) throw error
      logFallback(model, models[i + 1], reason)
    } finally {
      clearTimeout(timer)
      userSignal?.removeEventListener("abort", onCancel)
      // Cancels the request if it is still open (abandoned, or the consumer
      // stopped reading); a no-op once it has finished.
      controller.abort()
      void iterator?.return?.().catch(() => {})
    }
  }
}
