/**
 * Server-side Google Gemini client.
 *
 * Used by the meal-photo vision tool. The chat/parsing flows talk to Gemini
 * through its OpenAI-compatible endpoint (see lib/openaiClient.ts); this native
 * client is kept for the vision API, which the compat layer doesn't cover as
 * cleanly (inline image data + forced JSON mime type).
 *
 * IMPORTANT: this module reads GOOGLE_AI_STUDIO_API_KEY from process.env, so
 * it MUST only be imported from server-side code (Server Actions, API routes).
 * Never import from client components.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const DEFAULT_VISION_MODEL = 'gemini-2.5-flash';

let _client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (_client) return _client;
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GOOGLE_AI_STUDIO_API_KEY is not set. Add it to .env.local — never paste API keys into source or chat.'
    );
  }
  _client = new GoogleGenerativeAI(apiKey);
  return _client;
}

export function getGeminiVisionModel() {
  const modelName = process.env.GEMINI_VISION_MODEL || DEFAULT_VISION_MODEL;
  return getClient().getGenerativeModel({
    model: modelName,
    // Force JSON output. Less prompt-engineering, no markdown-fence stripping.
    generationConfig: { responseMimeType: 'application/json' },
  });
}
