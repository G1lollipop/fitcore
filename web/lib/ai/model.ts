/**
 * Which models the Google text and vision calls use, in what order, and when
 * a call moves from one model to the next.
 *
 * Pure configuration and control flow: no SDK client is created here, so this
 * module can be imported anywhere on the server (and in tests) without
 * credentials.
 */

/**
 * Gemini generation models, in the order they are tried. The first is the
 * default; the next one is used only when the current one cannot answer right
 * now (see {@link failoverReason}).
 */
export const GEMINI_GENERATION_MODELS = [
  "gemini-4-hydrogen",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
] as const

/**
 * Former defaults. Environments still carry them from when the example env
 * files spelled the default out (`AI_CHAT_MODEL=gemini-2.5-flash`), so a value
 * from this list means "nobody chose a model", not "use this model" — it must
 * not pin the app to a retired default.
 */
const SUPERSEDED_GEMINI_MODELS = new Set(["gemini-2.5-flash"])

export const GOOGLE_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"

/**
 * How long one model gets to answer (or, when streaming, to start showing
 * text) before the next model is tried. The last model in the order gets what
 * is left of {@link AI_TOTAL_TIMEOUT_MS} instead.
 */
export const AI_ATTEMPT_TIMEOUT_MS = 30_000
/** How long a call may spend across all models before it gives up. */
export const AI_TOTAL_TIMEOUT_MS = 75_000
/** No model is started with less than this share of an attempt's time left. */
const MIN_ATTEMPT_FRACTION = 0.1

const bareModelName = (name: string) => name.trim().replace(/^models\//i, "").toLowerCase()

/** True when the base URL is Google's OpenAI-compatible Gemini endpoint. */
export function isGoogleGenerativeEndpoint(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === "generativelanguage.googleapis.com"
  } catch {
    return false
  }
}

/** True for a model setting that should be treated as not set at all. */
export function isSupersededModel(configured: string | undefined | null): boolean {
  return SUPERSEDED_GEMINI_MODELS.has(bareModelName(configured ?? ""))
}

/**
 * The ordered list of models to try for one kind of call.
 *
 * On Google's endpoint:
 * - nothing configured, or a superseded default → the standard order;
 * - anything else → that model first, then the rest of the standard order.
 *
 * On any other OpenAI-compatible provider the configured model is used on its
 * own: the Gemini names mean nothing there, so there is nothing to fall back to.
 */
export function resolveModelChain(
  configured: string | undefined | null,
  options: { googleEndpoint?: boolean } = {}
): string[] {
  const name = (configured ?? "").trim()
  if (options.googleEndpoint === false) return [name || GEMINI_GENERATION_MODELS[0]]
  if (!name || isSupersededModel(name)) return [...GEMINI_GENERATION_MODELS]

  const bare = bareModelName(name)
  const standard = GEMINI_GENERATION_MODELS.find((model) => model === bare)
  const first = standard ?? name
  return [first, ...GEMINI_GENERATION_MODELS.filter((model) => model !== first)]
}

// ── When to move to the next model ───────────────────────────────────────────

/** A model did not answer within the time one attempt is given. */
export class AttemptTimeoutError extends Error {
  constructor(
    readonly model: string,
    readonly timeoutMs: number
  ) {
    super(`${model} did not answer within ${Math.round(timeoutMs / 100) / 10}s`)
    this.name = "AttemptTimeoutError"
  }
}

export type FailoverReason = "quota" | "unavailable" | "timeout"

function errorText(error: object): string {
  const e = error as Record<string, unknown>
  const details: string[] = []
  // The status name can sit in the message, the code, or the parsed error body
  // (OpenAI SDK: `error`; Google SDK: `errorDetails`).
  for (const key of ["message", "code", "statusText", "error", "errorDetails", "body"]) {
    const value = e[key]
    if (value === undefined || value === null) continue
    try {
      details.push(typeof value === "string" ? value : JSON.stringify(value))
    } catch {
      // Unserialisable detail: ignore it.
    }
  }
  return details.join(" ")
}

/**
 * Why a failed attempt should be followed by the next model — or `null` when
 * it should not, and the error must be reported as it is.
 *
 * - `quota`: HTTP 429, or Google's `RESOURCE_EXHAUSTED`.
 * - `unavailable`: HTTP 503, or Google's `UNAVAILABLE` (model overloaded).
 * - `timeout`: the attempt ran out of time — our own per-attempt limit, the
 *   SDK's request timeout, or HTTP 504 / `DEADLINE_EXCEEDED` from Google.
 *
 * Everything else is final: invalid requests (400), authentication and
 * permission errors (401 / 403), other server errors, network failures, and a
 * request the caller cancelled. Another model would not fix those, or must not
 * be tried.
 *
 * When the error carries an HTTP status, the status alone decides. The status
 * names are only looked for (as whole, upper-case words) when there is none —
 * for instance an error delivered part-way through a stream — so an ordinary
 * message that happens to say "unavailable" is never mistaken for one.
 */
export function failoverReason(error: unknown): FailoverReason | null {
  if (error instanceof AttemptTimeoutError) return "timeout"
  if (typeof error === "string") return reasonFromText(error)
  if (!error || typeof error !== "object") return null

  const e = error as Record<string, unknown>
  const response = e.response as Record<string, unknown> | undefined
  const status = [e.status, e.statusCode, response?.status].find((s) => typeof s === "number")
  if (status !== undefined) {
    if (status === 429) return "quota"
    if (status === 503) return "unavailable"
    if (status === 504) return "timeout"
    return null
  }

  // The OpenAI SDK's own request timeout.
  if (e.name === "APIConnectionTimeoutError") return "timeout"
  // A cancelled request has no status either; it is never a reason to go on.
  if (e.name === "AbortError" || e.name === "APIUserAbortError") return null
  return reasonFromText(errorText(error))
}

function reasonFromText(text: string): FailoverReason | null {
  if (/\bRESOURCE_EXHAUSTED\b/.test(text)) return "quota"
  if (/\bUNAVAILABLE\b/.test(text)) return "unavailable"
  if (/\bDEADLINE_EXCEEDED\b/.test(text)) return "timeout"
  return null
}

/** True only for a quota or rate-limit failure (HTTP 429 / `RESOURCE_EXHAUSTED`). */
export function isQuotaError(error: unknown): boolean {
  return failoverReason(error) === "quota"
}

export interface FallbackOptions {
  /** Time one model gets to answer. Default {@link AI_ATTEMPT_TIMEOUT_MS}. */
  attemptTimeoutMs?: number
  /** Time the whole call may take across all models. Default {@link AI_TOTAL_TIMEOUT_MS}. */
  totalTimeoutMs?: number
  /** The caller's cancellation signal. Once aborted, no further model is tried. */
  signal?: AbortSignal
}

export interface AttemptContext {
  /** Aborted when this attempt times out or the caller cancels; pass it to the SDK. */
  signal: AbortSignal
  /** The time this attempt has, already capped by what is left of the total. */
  timeoutMs: number
}

/**
 * What is left of the total time for the next attempt, or `null` when none is.
 *
 * The per-attempt limit exists to move on to the next model. The last model
 * has no next one, so it gets everything that is left of the total instead:
 * cutting it off at the attempt limit would only turn a slow answer into a
 * certain failure (seen in practice with an overloaded fallback model that
 * answered in 35–50s while the earlier models were out of quota).
 */
export function nextAttemptTimeout(
  startedAt: number,
  options: FallbackOptions = {},
  isLastModel = false
): number | null {
  const attempt = options.attemptTimeoutMs ?? AI_ATTEMPT_TIMEOUT_MS
  const total = options.totalTimeoutMs ?? AI_TOTAL_TIMEOUT_MS
  const remaining = total - (Date.now() - startedAt)
  // A sliver of time is not an attempt: starting a model that is certain to be
  // cut off only adds a pointless request.
  if (remaining < attempt * MIN_ATTEMPT_FRACTION) return null
  return isLastModel ? remaining : Math.min(attempt, remaining)
}

/** The error a cancelled call ends with: the caller's own reason when it gave one. */
export function cancellationError(signal: AbortSignal): unknown {
  return signal.reason instanceof Error
    ? signal.reason
    : Object.assign(new Error("The request was cancelled"), { name: "AbortError" })
}

/**
 * Run `attempt` against each model in order.
 *
 * The next model is tried only when the current one is out of quota, is
 * unavailable, or does not answer within its time ({@link failoverReason}).
 * Any other error is thrown as it is, as is the last model's error. The time
 * limit is enforced here, so a model that never answers is abandoned on time
 * whatever the SDK does; the SDK should be given `context.signal` so that the
 * abandoned request is actually cancelled, and must not retry on its own —
 * that would only delay the move to the next model.
 *
 * The whole call is bounded: no attempt starts once `totalTimeoutMs` has
 * passed, and each attempt gets at most what is left of it.
 */
export async function withModelFallback<T>(
  models: readonly string[],
  attempt: (model: string, context: AttemptContext) => Promise<T>,
  options: FallbackOptions = {}
): Promise<T> {
  if (models.length === 0) throw new Error("No model configured")
  const startedAt = Date.now()
  const userSignal = options.signal

  for (let i = 0; ; i++) {
    const model = models[i]
    if (userSignal?.aborted) throw cancellationError(userSignal)
    const timeoutMs = nextAttemptTimeout(startedAt, options, i === models.length - 1)
    // Only reachable after a failed attempt used up the rest of the time.
    if (timeoutMs === null) throw new AttemptTimeoutError(models[i - 1] ?? model, 0)

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let onCancel: (() => void) | undefined
    try {
      const timedOut = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new AttemptTimeoutError(model, timeoutMs)
          reject(error)
          controller.abort(error)
        }, timeoutMs)
      })
      const cancelled = new Promise<never>((_, reject) => {
        if (!userSignal) return
        onCancel = () => {
          const error = cancellationError(userSignal)
          reject(error)
          controller.abort(error)
        }
        userSignal.addEventListener("abort", onCancel, { once: true })
      })
      return await Promise.race([
        attempt(model, { signal: controller.signal, timeoutMs }),
        timedOut,
        cancelled,
      ])
    } catch (error) {
      if (userSignal?.aborted) throw cancellationError(userSignal)
      const reason = failoverReason(error)
      if (reason === null || i === models.length - 1) throw error
      // No time left for another model: report what stopped this one.
      if (nextAttemptTimeout(startedAt, options) === null) throw error
      logFallback(model, models[i + 1], reason)
    } finally {
      clearTimeout(timer)
      if (onCancel) userSignal?.removeEventListener("abort", onCancel)
    }
  }
}

const REASON_TEXT: Record<FailoverReason, string> = {
  quota: "hit a quota or rate limit",
  unavailable: "is unavailable",
  timeout: "timed out",
}

export function logFallback(from: string, to: string, reason: FailoverReason): void {
  console.warn(`[ai] ${from} ${REASON_TEXT[reason]}; trying ${to}`)
}

const SAMPLING_PARAMETERS = ["temperature", "top_p", "frequency_penalty", "presence_penalty"] as const

/**
 * Drop the sampling parameters for the models that no longer take them.
 * Gemini 4 and 3.6+ run at fixed sampling settings: today they ignore
 * `temperature` / `top_p` (with a deprecation warning), and Google has said a
 * later release will reject them. Other models keep whatever was passed.
 */
export function withoutUnsupportedSampling<P extends object>(model: string, params: P): P {
  const bare = bareModelName(model)
  if (!GEMINI_GENERATION_MODELS.some((name) => name === bare)) return params
  const copy = { ...params } as Record<string, unknown>
  for (const key of SAMPLING_PARAMETERS) delete copy[key]
  return copy as P
}

// ── Resolved configuration ───────────────────────────────────────────────────

/** Where the text calls go: Google unless another provider is configured. */
export const AI_BASE_URL = process.env.OPENAI_BASE_URL || GOOGLE_OPENAI_BASE_URL
export const AI_USES_GOOGLE = isGoogleGenerativeEndpoint(AI_BASE_URL)

const chatSetting = process.env.AI_CHAT_MODEL
// The fast model follows the chat model unless it has a real setting of its own.
const fastSetting =
  process.env.AI_FAST_MODEL && !(AI_USES_GOOGLE && isSupersededModel(process.env.AI_FAST_MODEL))
    ? process.env.AI_FAST_MODEL
    : chatSetting

/** Coach chat, planning and plan generation. */
export const AI_CHAT_MODELS = resolveModelChain(chatSetting, { googleEndpoint: AI_USES_GOOGLE })
/** Quick Log parsing and onboarding advice. */
export const AI_FAST_MODELS = resolveModelChain(fastSetting, { googleEndpoint: AI_USES_GOOGLE })
/** Meal-photo recognition (always Google: it uses the native Gemini SDK). */
export const GEMINI_VISION_MODELS = resolveModelChain(process.env.GEMINI_VISION_MODEL)

/** The model tried first for each kind of call (for labels and logs). */
export const AI_CHAT_MODEL = AI_CHAT_MODELS[0]
export const AI_FAST_MODEL = AI_FAST_MODELS[0]

// Vision always goes to Google; the text settings only count there too.
const settingsToCheck = AI_USES_GOOGLE
  ? (["AI_CHAT_MODEL", "AI_FAST_MODEL", "GEMINI_VISION_MODEL"] as const)
  : (["GEMINI_VISION_MODEL"] as const)
for (const variable of settingsToCheck) {
  if (isSupersededModel(process.env[variable])) {
    console.warn(
      `[ai] ${variable}=${process.env[variable]} is a retired default and is ignored; ` +
        `using ${GEMINI_GENERATION_MODELS[0]}. Remove the variable, or set a current model.`
    )
  }
}

/** Custom fine-tuned nutrition parsing API (replaces Gemini for food logging). */
export const NUTRITION_PARSE_API_URL =
  process.env.NUTRITION_PARSE_API_URL ||
  "https://g1lollipop--fitcore-nutrition-api-analyze-meal.modal.run"
