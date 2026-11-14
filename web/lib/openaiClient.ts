import OpenAI from 'openai';
import { AI_BASE_URL } from '@/lib/ai/model';

/**
 * Chat/completions client for the text AI flows (coach agent, food/workout
 * parsing, onboarding advice).
 *
 * The whole app talks to Google Gemini through its OpenAI-compatible endpoint,
 * so the existing `openai` SDK keeps working with only a base-URL swap. We reuse
 * the same GOOGLE_AI_STUDIO_API_KEY that the vision tool uses, so a single key
 * powers every AI feature. OPENAI_API_KEY / OPENAI_BASE_URL still override when
 * set, in case you want to point this at a different OpenAI-compatible provider.
 *
 * Don't call `openai.chat.completions.create` with a single model: use
 * `createChatCompletion` / `streamChatCompletion` (lib/ai/chat-completion.ts),
 * which apply the Gemini model fallback order, its time limits, and switch the
 * SDK's own retries off so a failing model is left for the next one at once.
 */
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY,
  baseURL: AI_BASE_URL,
});
