// ============================================
// mAI Caddy — UI Configuration
// ============================================
// All user-facing text, suggested prompts, and display settings.
// Edit here to change what users see — no digging through components.

/** Suggested prompts shown on the empty state / welcome screen */
export const SUGGESTED_PROMPTS = [
  "What club for 155 yards into the wind?",
  "I keep slicing my driver. Help.",
  "Give me a pre-round warm-up routine",
  "How do I manage a dogleg right?",
];

/** User-facing error messages */
export const UI_MESSAGES = {
  connectionError: 'Having trouble connecting. Check your API key and try again.',
  courseLoadError: 'Had trouble loading that course. Try searching again.',
  welcomeTitle: 'Welcome to mAI Caddy',
  welcomeSubtitle: 'Ask me anything about your game, course strategy, or club selection.',
  welcomeHint: 'Tap "Select Course" above to load a real course with hole data.',
  selectCourse: 'Select Course',
} as const;
