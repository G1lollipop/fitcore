import { track } from '@vercel/analytics'

export type LoggingSource = 'text' | 'photo' | 'record'

type LoggingEvent =
  | 'FitCore Logging Attempt'
  | 'FitCore Logging Completed'
  | 'FitCore Logging Failed'
  | 'FitCore Logging Correction'
  | 'FitCore Logging Review Required'
  | 'FitCore Logging Review Cancelled'

type LoggingProperties = {
  source: LoggingSource
  entry_point:
    | 'home_log_bar'
    | 'floating_quick_log'
    | 'meal_photo'
    | 'meal_photo_review'
    | 'record_editor'
  elapsed_ms?: number
  item_count?: number
  failure_reason?:
    | 'authentication_required'
    | 'request_failed'
    | 'parse_failed'
    | 'save_failed'
    | 'processing_failed'
  changed_field_count?: number
  log_type?: 'food' | 'workout'
  review_type?: 'confirmation' | 'adjustment'
  confidence_band?: 'low' | 'high'
}

/**
 * Send only coarse logging-flow metadata. Never pass log content, image data,
 * nutrition values, filenames, user IDs, or server error text here.
 */
export function trackLoggingEvent(event: LoggingEvent, properties: LoggingProperties) {
  try {
    track(event, properties)
  } catch {
    // Analytics must never block or change the logging flow.
  }
}

export function elapsedLoggingMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt))
}
