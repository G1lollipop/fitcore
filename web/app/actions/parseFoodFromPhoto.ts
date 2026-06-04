'use server';

import { randomUUID } from 'crypto';
import { getGeminiVisionModel } from '@/lib/ai/gemini-client';
import type { DietLogItem } from './types';

/**
 * Parsed photo result. Adds confidence + notes on top of DietLogItem so the
 * UI can warn on low-confidence predictions and surface model caveats
 * (e.g. "无法判断烹饪方式") to the user before they confirm.
 *
 * confidence + notes are NOT persisted to daily_stats — they're transient,
 * for the preview/edit step only.
 */
export type ParsedMealPhoto = DietLogItem & {
  confidence: number;
  notes?: string;
};

const PROMPT = `你是一位专业的营养师助手。请分析这张食物照片并估算其营养成分。

只返回 JSON，符合下面的 schema（不要 markdown 代码块）：
{
  "food_name": string,
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "confidence": number,
  "notes": string
}

字段说明：
- food_name：食物的具体描述，例如 "一份鸡胸肉沙拉" 或 "约 200g 牛肉面"
- calories：估算的总热量 (kcal)，整数
- protein / carbs / fat：克数，整数
- confidence：0.0 - 1.0，对营养估算的置信度。低于 0.5 表示难以判断（份量、做法不明）。
- notes：简短备注，可为空字符串。例如 "份量较小" 或 "无法判断含糖量"

如果照片中没有可辨识的食物，返回：
{"food_name":"","calories":0,"protein":0,"carbs":0,"fat":0,"confidence":0,"notes":"未识别到食物"}`;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB upper bound — client should compress first
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export async function parseFoodFromPhoto(
  formData: FormData
): Promise<{ success: boolean; data?: ParsedMealPhoto; error?: string }> {
  const file = formData.get('photo');
  if (!(file instanceof File)) {
    return { success: false, error: '未提供图片' };
  }
  if (file.size === 0) {
    return { success: false, error: '图片为空' };
  }
  if (file.size > MAX_BYTES) {
    return { success: false, error: '图片过大，请压缩后重试（< 8 MB）' };
  }

  const mimeType = file.type || 'image/jpeg';
  if (!ALLOWED_MIME.has(mimeType)) {
    return { success: false, error: `不支持的图片格式：${mimeType}` };
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
    const message = error instanceof Error ? error.message : '识别失败';
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(message)) {
      return {
        success: false,
        error: '无法连接到 Google AI 服务，请检查网络后重试',
      };
    }
    return { success: false, error: `识别失败：${message}` };
  }

  if (!raw.trim()) {
    return { success: false, error: '识别返回空结果' };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Should not happen — generationConfig.responseMimeType pins JSON output —
    // but be defensive in case Gemini returns prose anyway.
    console.error('[parseFoodFromPhoto] non-JSON response:', raw.slice(0, 300));
    return { success: false, error: '识别结果格式异常，请重试' };
  }

  const num = (k: string) => Math.max(0, Math.round(Number(parsed[k]) || 0));
  const data: ParsedMealPhoto = {
    id: randomUUID(),
    food_name: typeof parsed.food_name === 'string' && parsed.food_name.trim()
      ? parsed.food_name.trim()
      : '未识别食物',
    calories: num('calories'),
    protein: num('protein'),
    carbs: num('carbs'),
    fat: num('fat'),
    logged_at: new Date().toISOString(),
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    notes: typeof parsed.notes === 'string' && parsed.notes.trim() ? parsed.notes.trim() : undefined,
  };

  if (data.confidence === 0 && data.calories === 0) {
    return { success: false, error: data.notes || '未识别到食物，请换一张更清晰的照片' };
  }

  return { success: true, data };
}
