// ============================================
// mAI Caddy — Caddie Chat API Route
// POST /api/caddie/chat
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { askCaddie } from '@/lib/caddie/caddie-service';
import { CaddieContext, CaddieMode, CaddiePersonality } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      message,
      profile,
      weather,
      round,
      currentHole,
      mode = 'chat',
      personality = 'zen_guru',
      conversationHistory = [],
    } = body;

    if (!message || !profile) {
      return NextResponse.json(
        { error: 'Message and player profile are required' },
        { status: 400 }
      );
    }

    const context: CaddieContext = {
      profile,
      weather: weather || null,
      round: round || null,
      currentHole: currentHole || null,
      mode: mode as CaddieMode,
      personality: personality as CaddiePersonality,
      conversationHistory,
    };

    const response = await askCaddie(context, message);

    return NextResponse.json({
      message: response.message,
      tokensUsed: response.tokensUsed,
      model: response.model,
    });
  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Try again.' },
      { status: 500 }
    );
  }
}
