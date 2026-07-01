'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/**
 * Minimal typings for the Web Speech API (`SpeechRecognition`), which isn't in
 * the default TS DOM lib. We only model the surface this hook touches.
 */
interface SpeechRecognitionAlternativeLike {
  transcript: string
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike
  isFinal: boolean
  length: number
}
interface SpeechRecognitionResultListLike {
  length: number
  [index: number]: SpeechRecognitionResultLike
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: SpeechRecognitionResultListLike
}
interface SpeechRecognitionErrorEventLike {
  error: string
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// Feature detection via useSyncExternalStore keeps SSR (server snapshot =
// unsupported) and the client hydration in sync without a setState-in-effect.
const NOOP_SUBSCRIBE = () => () => {}
const getSupportedSnapshot = () => getRecognitionCtor() !== null
const getSupportedServerSnapshot = () => false

export interface UseSpeechInputOptions {
  /** BCP-47 language tag, e.g. 'en-US' or 'zh-CN'. Defaults to 'en-US'. */
  lang?: string
  /**
   * Called on every transcript update (interim + final) with the full text
   * recognized since `start()`. The caller merges it into the input value.
   */
  onTranscript: (transcript: string) => void
  /** Called with a coarse error code (e.g. 'not-allowed', 'no-speech'). */
  onError?: (error: string) => void
}

export interface UseSpeechInputResult {
  /** True only when the browser exposes the Web Speech API. */
  supported: boolean
  /** True while actively listening. */
  listening: boolean
  start: () => void
  stop: () => void
  toggle: () => void
}

/**
 * Small wrapper around the browser Web Speech API for voice-to-text on the
 * Quick Log input.
 *
 * - Feature-detected: `supported` is false on browsers without the API, so the
 *   caller can hide the mic button entirely (no crashes).
 * - Streams interim results so the input fills in live as the user speaks.
 * - Surfaces permission / recognition errors via `onError` and always resets
 *   `listening` on end so the UI can't get stuck in a recording state.
 */
export function useSpeechInput({
  lang = 'en-US',
  onTranscript,
  onError,
}: UseSpeechInputOptions): UseSpeechInputResult {
  const supported = useSyncExternalStore(
    NOOP_SUBSCRIBE,
    getSupportedSnapshot,
    getSupportedServerSnapshot
  )
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const finalRef = useRef('')

  // Keep the latest callbacks/lang in refs so the recognition handlers don't
  // need to be re-created (which would drop an in-flight session).
  const onTranscriptRef = useRef(onTranscript)
  const onErrorRef = useRef(onError)
  const langRef = useRef(lang)
  useEffect(() => {
    onTranscriptRef.current = onTranscript
    onErrorRef.current = onError
    langRef.current = lang
  }, [onTranscript, onError, lang])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    if (recognitionRef.current) return
    const Ctor = getRecognitionCtor()
    if (!Ctor) return

    const recognition = new Ctor()
    recognition.lang = langRef.current
    recognition.continuous = false
    recognition.interimResults = true
    finalRef.current = ''

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) {
          finalRef.current += text
        } else {
          interim += text
        }
      }
      onTranscriptRef.current((finalRef.current + interim).trim())
    }

    recognition.onerror = (event) => {
      onErrorRef.current?.(event.error)
    }

    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
    }

    recognitionRef.current = recognition
    setListening(true)
    try {
      recognition.start()
    } catch {
      // start() throws if called while already active; reset defensively.
      recognitionRef.current = null
      setListening(false)
    }
  }, [])

  const toggle = useCallback(() => {
    if (recognitionRef.current) stop()
    else start()
  }, [start, stop])

  // Tear down any active session on unmount.
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      recognitionRef.current = null
    }
  }, [])

  return { supported, listening, start, stop, toggle }
}
