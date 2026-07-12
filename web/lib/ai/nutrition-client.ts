import { NUTRITION_PARSE_API_URL } from '@/lib/ai/model'

const FETCH_TIMEOUT_MS = 60_000

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

    return (await response.json()) as NutritionApiResponse
  } finally {
    clearTimeout(timeoutId)
  }
}
