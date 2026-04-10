// ============================================
// mAI Caddy — AI Configuration
// ============================================
// All AI model settings in one place.
// Change the model, adjust token limits, update fallback messages here.

export const AI_CONFIG = {
  /** Claude model to use for caddie responses */
  model: 'claude-sonnet-4-6',

  /** Max tokens for voice mode (on-course: short, spoken responses) */
  voiceMaxTokens: 150,

  /** Max tokens for chat mode (off-course: richer, detailed responses) */
  chatMaxTokens: 500,

  /** Number of conversation messages to include for context */
  conversationHistoryLimit: 10,

  /** Fallback messages when AI is unavailable */
  fallbackMessages: {
    rateLimit: "Taking a breath here — give me a moment and ask again.",
    generalError: "Lost my train of thought for a second. Try me again.",
    noDistance: "I need to know your distance. What are you looking at?",
  },
} as const;
