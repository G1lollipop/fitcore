import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchNutritionApi } from '../nutrition-client'

afterEach(() => vi.unstubAllGlobals())

describe('nutrition API response validation', () => {
  it('returns the food nutrition supplied by Modal', async () => {
    const nutrition = { calories: 350, protein: 25, carbs: 35, fat: 12 }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(nutrition)))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchNutritionApi('a turkey sandwich')).toEqual(nutrition)
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: JSON.stringify({ meal: 'a turkey sandwich' }) }))
  })

  it.each([
    { calories: -1, protein: 25, carbs: 35, fat: 12 },
    { calories: 'invalid', protein: 25, carbs: 35, fat: 12 },
    { calories: 350, protein: 25 },
  ])('rejects malformed nutrition instead of saving an estimate of zero: %j', async (nutrition) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(nutrition))))
    await expect(fetchNutritionApi('sandwich')).rejects.toThrow()
  })

  it('propagates an unavailable nutrition service', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
    await expect(fetchNutritionApi('sandwich')).rejects.toThrow('Modal API returned 503')
  })
})
