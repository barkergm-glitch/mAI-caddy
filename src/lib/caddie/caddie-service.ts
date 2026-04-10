// ============================================
// mAI Caddy — Core Caddie Service
// ============================================
// This is the main entry point for talking to the AI caddie.
// It assembles context, calls Claude, and returns the response.

import Anthropic from '@anthropic-ai/sdk';
import { CaddieContext, CaddieMode } from '@/lib/types';
import { buildMessages } from './context-builder';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface CaddieResponse {
  message: string;
  tokensUsed: number;
  model: string;
}

/**
 * Send a message to the AI caddie and get a response
 */
export async function askCaddie(
  context: CaddieContext,
  userMessage: string
): Promise<CaddieResponse> {
  const { system, messages } = buildMessages(context, userMessage);

  // Voice mode: shorter, faster responses
  // Chat mode: more detailed, richer responses
  const maxTokens = context.mode === 'voice' ? 150 : 500;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages,
    });

    const textContent = response.content.find(block => block.type === 'text');
    const message = textContent?.text || 'I\'m here. What do you need?';

    return {
      message,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      model: response.model,
    };
  } catch (error: any) {
    console.error('Caddie AI error:', error);

    // Graceful fallback
    if (error?.status === 429) {
      return {
        message: 'Taking a breath here — give me a moment and ask again.',
        tokensUsed: 0,
        model: 'fallback',
      };
    }

    return {
      message: 'Lost my train of thought for a second. Try me again.',
      tokensUsed: 0,
      model: 'fallback',
    };
  }
}

/**
 * Get a quick club recommendation without a full conversation
 * Used for the "What club?" quick-action button
 */
export async function quickRecommendation(
  context: CaddieContext
): Promise<CaddieResponse> {
  const distance = context.round?.distanceToGreen;
  if (!distance) {
    return {
      message: 'I need to know your distance. What are you looking at?',
      tokensUsed: 0,
      model: 'local',
    };
  }

  // For quick recs, force voice mode for short responses
  const voiceContext: CaddieContext = { ...context, mode: 'voice' };
  return askCaddie(voiceContext, `What club should I hit? I'm ${distance} yards out.`);
}
