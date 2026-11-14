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

import { GoogleGenerativeAI, type Part } from '@google/generative-ai';
import { GEMINI_VISION_MODELS, withModelFallback, type FallbackOptions } from '@/lib/ai/model';

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

/**
 * Ask the vision model for a JSON answer about the given prompt + image parts.
 *
 * Models are tried in the configured order (`GEMINI_VISION_MODEL` first when
 * set, then gemini-4-hydrogen → gemini-3.8-flash → gemini-3.6-flash); the next
 * one is used when the current one is out of quota, unavailable, or does not
 * answer in time. Every model gets the same request, with JSON output forced,
 * so the caller parses the reply the same way whichever model produced it.
 */
export async function generateVisionJson(
  parts: Array<string | Part>,
  models: readonly string[] = GEMINI_VISION_MODELS,
  options: FallbackOptions = {}
): Promise<{ text: string; model: string }> {
  return withModelFallback(
    models,
    async (model, attempt) => {
      const result = await getClient()
        .getGenerativeModel({
          model,
          // Force JSON output. Less prompt-engineering, no markdown-fence stripping.
          generationConfig: { responseMimeType: 'application/json' },
        })
        // The signal cancels the request when the attempt is given up on.
        .generateContent(parts, { signal: attempt.signal, timeout: attempt.timeoutMs });
      return { text: result.response.text() ?? '', model };
    },
    options
  );
}
