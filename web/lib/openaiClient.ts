import OpenAI from 'openai';

/**
 * Chat/completions client for the text AI flows (coach agent, food/workout
 * parsing, onboarding advice).
 *
 * The whole app talks to Google Gemini through its OpenAI-compatible endpoint,
 * so the existing `openai` SDK keeps working with only a base-URL swap. We reuse
 * the same GOOGLE_AI_STUDIO_API_KEY that the vision tool uses, so a single key
 * powers every AI feature. OPENAI_API_KEY / OPENAI_BASE_URL still override when
 * set, in case you want to point this at a different OpenAI-compatible provider.
 */
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY,
  baseURL:
    process.env.OPENAI_BASE_URL ||
    'https://generativelanguage.googleapis.com/v1beta/openai/',
});
