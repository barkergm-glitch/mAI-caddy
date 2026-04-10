// ============================================
// mAI Caddy — UI Configuration
// ============================================
// All user-facing text, suggested prompts, and display settings.
// Edit here to change what users see — no digging through components.

import { CaddiePersonality } from '@/lib/types';
import { PERSONALITY_NAMES, PERSONALITY_DESCRIPTIONS } from '@/lib/caddie/personalities';

/** Personality options for the picker dropdown */
export const PERSONALITY_OPTIONS: {
  value: CaddiePersonality;
  label: string;
  emoji: string;
  description: string;
}[] = [
  { value: 'zen_guru', label: PERSONALITY_NAMES.zen_guru, emoji: '🧘', description: PERSONALITY_DESCRIPTIONS.zen_guru },
  { value: 'old_sage', label: PERSONALITY_NAMES.old_sage, emoji: '🎩', description: PERSONALITY_DESCRIPTIONS.old_sage },
  { value: 'tough_love', label: PERSONALITY_NAMES.tough_love, emoji: '💪', description: PERSONALITY_DESCRIPTIONS.tough_love },
  { value: 'comforting_friend', label: PERSONALITY_NAMES.comforting_friend, emoji: '🤗', description: PERSONALITY_DESCRIPTIONS.comforting_friend },
];

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
