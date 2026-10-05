export const AI_CHAT_MODEL = process.env.AI_CHAT_MODEL || "gemini-2.5-flash"

export const AI_FAST_MODEL = process.env.AI_FAST_MODEL || AI_CHAT_MODEL

/** Custom fine-tuned nutrition parsing API (replaces Gemini for food logging). */
export const NUTRITION_PARSE_API_URL =
  process.env.NUTRITION_PARSE_API_URL ||
  "https://g1lollipop--fitcore-nutrition-api-analyze-meal.modal.run"
