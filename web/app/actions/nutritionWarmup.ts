'use server'

import { NUTRITION_PARSE_API_URL } from '@/lib/ai/model'

export async function warmupNutritionApi(): Promise<void> {
  try {
    await fetch(NUTRITION_PARSE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal: 'warmup' }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    // Silently ignore warmup failures — the actual parse calls have their own
    // error handling. The warmup is purely a cold-start hedge.
  }
}
