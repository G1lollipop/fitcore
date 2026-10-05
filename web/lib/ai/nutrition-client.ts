import { NUTRITION_PARSE_API_URL } from '@/lib/ai/model'
import { z } from 'zod'

const FETCH_TIMEOUT_MS = 60_000
const nutritionSchema = z.object({
  calories: z.number().finite().nonnegative(),
  protein: z.number().finite().nonnegative(),
  carbs: z.number().finite().nonnegative(),
  fat: z.number().finite().nonnegative(),
})

export interface NutritionApiResponse {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export async function fetchNutritionApi(
  meal: string,
): Promise<NutritionApiResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(NUTRITION_PARSE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Modal API returned ${response.status}`)
    }

    return nutritionSchema.parse(await response.json())
  } finally {
    clearTimeout(timeoutId)
  }
}
