'use server';

import { randomUUID } from 'crypto';
import { getGeminiVisionModel } from '@/lib/ai/gemini-client';
import type { DietLogItem } from './types';

/**
 * Parsed photo result. Adds confidence + notes on top of DietLogItem so the
 * UI can warn on low-confidence predictions and surface model caveats
 * (e.g. "can't tell the cooking method") to the user before they confirm.
 *
 * confidence + notes are NOT persisted to daily_stats — they're transient,
 * for the preview/edit step only.
 */
export type ParsedMealPhoto = DietLogItem & {
  confidence: number;
  notes?: string;
};

const PROMPT = `You are a professional nutritionist assistant. Analyze this food photo and estimate its nutritional content.

Return JSON only, matching the schema below (no markdown code block):
{
  "food_name": string,
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "confidence": number,
  "notes": string
}

Field notes:
- food_name: a specific description of the food, e.g. "a chicken breast salad" or "~200g beef noodles"
- calories: estimated total calories (kcal), integer
- protein / carbs / fat: grams, integer
- confidence: 0.0 - 1.0, your confidence in the estimate. Below 0.5 means it's hard to tell (unclear portion or preparation).
- notes: a short note, may be an empty string. e.g. "small portion" or "can't tell the sugar content"

If there is no recognizable food in the photo, return:
{"food_name":"","calories":0,"protein":0,"carbs":0,"fat":0,"confidence":0,"notes":"No food detected"}`;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB upper bound — client should compress first
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export async function parseFoodFromPhoto(
  formData: FormData
): Promise<{ success: boolean; data?: ParsedMealPhoto; error?: string }> {
  const file = formData.get('photo');
  if (!(file instanceof File)) {
    return { success: false, error: 'No image provided' };
  }
  if (file.size === 0) {
    return { success: false, error: 'Image is empty' };
  }
  if (file.size > MAX_BYTES) {
    return { success: false, error: 'Image too large; please compress and retry (< 8 MB)' };
  }

  const mimeType = file.type || 'image/jpeg';
  if (!ALLOWED_MIME.has(mimeType)) {
    return { success: false, error: `Unsupported image format: ${mimeType}` };
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  let raw: string;
  try {
    const model = getGeminiVisionModel();
    const result = await model.generateContent([
      PROMPT,
      { inlineData: { data: base64, mimeType } },
    ]);
    raw = result.response.text() ?? '';
  } catch (error) {
    console.error('[parseFoodFromPhoto] Gemini call failed:', error);
    const message = error instanceof Error ? error.message : 'Recognition failed';
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(message)) {
      return {
        success: false,
        error: 'Could not reach the Google AI service; check your network and retry',
      };
    }
    return { success: false, error: `Recognition failed: ${message}` };
  }

  if (!raw.trim()) {
    return { success: false, error: 'Recognition returned an empty result' };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Should not happen — generationConfig.responseMimeType pins JSON output —
    // but be defensive in case Gemini returns prose anyway.
    console.error('[parseFoodFromPhoto] non-JSON response:', raw.slice(0, 300));
    return { success: false, error: 'Unexpected recognition result format; please retry' };
  }

  const num = (k: string) => Math.max(0, Math.round(Number(parsed[k]) || 0));
  const data: ParsedMealPhoto = {
    id: randomUUID(),
    food_name: typeof parsed.food_name === 'string' && parsed.food_name.trim()
      ? parsed.food_name.trim()
      : 'Unrecognized food',
    calories: num('calories'),
    protein: num('protein'),
    carbs: num('carbs'),
    fat: num('fat'),
    logged_at: new Date().toISOString(),
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    notes: typeof parsed.notes === 'string' && parsed.notes.trim() ? parsed.notes.trim() : undefined,
  };

  if (data.confidence === 0 && data.calories === 0) {
    return { success: false, error: data.notes || 'No food detected; please try a clearer photo' };
  }

  return { success: true, data };
}
