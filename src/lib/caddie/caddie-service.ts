// ============================================
// mAI Caddy — Core Caddie Service
// ============================================
// This is the main entry point for talking to the AI caddie.
// It assembles context, calls Claude, and returns the response.

import Anthropic from '@anthropic-ai/sdk';
import { CaddieContext } from '@/lib/types';
import { AI_CONFIG } from '@/lib/config';
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

  const maxTokens = context.mode === 'voice'
    ? AI_CONFIG.voiceMaxTokens
    : AI_CONFIG.chatMaxTokens;

  try {
    const response = await anthropic.messages.create({
      model: AI_CONFIG.model,
      max_tokens: maxTokens,
      system,
      messages,
    });

    const textContent = response.content.find(block => block.type === 'text');
    const message = textContent?.text || "I'm here. What do you need?";

    return {
      message,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      model: response.model,
    };
  } catch (error: any) {
    console.error('Caddie AI error:', error);

    if (error?.status === 429) {
      return {
        message: AI_CONFIG.fallbackMessages.rateLimit,
        tokensUsed: 0,
        model: 'fallback',
      };
    }

    return {
      message: AI_CONFIG.fallbackMessages.generalError,
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
      message: AI_CONFIG.fallbackMessages.noDistance,
      tokensUsed: 0,
      model: 'local',
    };
  }

  const voiceContext: CaddieContext = { ...context, mode: 'voice' };
  return askCaddie(voiceContext, `What club should I hit? I'm ${distance} yards out.`);
}
