// ============================================
// mAI Caddy — Context Assembly Pipeline
// ============================================
// Builds the full context that gets injected into the Claude system prompt.
// This is what makes the caddie SMART — it knows your game, the course,
// the weather, and the situation on every shot.

import {
  CaddieContext,
  CaddieMode,
  GolferProfile,
  WeatherConditions,
  RoundState,
  HoleData,
  ClubInBag,
} from '@/lib/types';
import { PERSONALITY_PROMPTS } from './personalities';
import { chewRecommend, formatClubName } from './chew-engine';

/**
 * Layer 2: Golf Intelligence — hardcoded golf knowledge
 * This never changes — it's the caddie's "golf brain"
 */
const GOLF_INTELLIGENCE = `
GOLF KNOWLEDGE (use this for every recommendation):

CLUB SELECTION (C.H.E.W. Method):
- Carry: Start with the raw distance to the target
- Heat: Ball travels ~1.5 yards further per 10°F above 70°F. Cold = less carry.
- Elevation: +2% carry per 1,000 feet above sea level. Denver plays much shorter.
- Wind: 10 mph headwind adds 10-15 yards. 10 mph tailwind subtracts 5-7 yards. Crosswind mostly affects direction, not distance.

COURSE MANAGEMENT PRINCIPLES:
- Miss to the fat side of the green — never short-side yourself
- When in doubt, take more club. Pin-high and past is better than short.
- Play away from trouble, not toward the pin. A bogey from the center of the green beats a double from a bunker.
- Factor the player's miss pattern: if they tend to miss right, aim left of target.
- On par 3s: aim center green unless the player's game supports flag-hunting.
- On par 5s: layup to the player's favorite approach distance, not "as close as possible."

SCORING MINDSET:
- Bogey is not a disaster — doubles and triples are. Manage risk to avoid big numbers.
- When a player is scoring well, keep the strategy conservative — protect the round.
- When a player is struggling, simplify: fairway, green, two-putt. Build confidence through routine.
- The mental game matters: a confident recommendation beats a technically "optimal" one that creates doubt.

COMMUNICATION RULES:
- ALWAYS commit to a specific club. Never say "either 7 or 8 iron would work" — that creates doubt.
- Give a specific target: "10 feet left of the pin" or "center of the green" — not "somewhere on the green."
- Keep it short on the course. Save the detailed explanations for off-course chats.
- After giving a recommendation, reinforce with a simple swing thought: "smooth tempo" or "trust it."
`;

/**
 * Build the player context string from their profile
 */
function buildPlayerContext(profile: GolferProfile): string {
  const lines: string[] = [
    `\nPLAYER PROFILE:`,
    `Name: ${profile.name}`,
  ];

  if (profile.handicap !== null) {
    lines.push(`Handicap: ${profile.handicap}`);
  }
  if (profile.shotShape) {
    lines.push(`Shot shape: ${profile.shotShape}`);
  }
  if (profile.missTendency) {
    lines.push(`Typical miss: ${profile.missTendency}`);
  }
  if (profile.driverDistance) {
    lines.push(`Driver distance: ${profile.driverDistance} yards`);
  }
  if (profile.strengths) {
    lines.push(`Strengths: ${profile.strengths}`);
  }
  if (profile.weaknesses) {
    lines.push(`Weaknesses: ${profile.weaknesses}`);
  }
  if (profile.mentalNotes) {
    lines.push(`Mental game: ${profile.mentalNotes}`);
  }
  if (profile.playingStyle) {
    lines.push(`Playing style: ${profile.playingStyle}`);
  }

  // Club bag
  if (profile.clubs.length > 0) {
    lines.push(`\nCLUB BAG:`);
    for (const club of profile.clubs) {
      let clubLine = `  ${formatClubName(club.clubType)}: ${club.avgDistance} yards avg`;
      if (club.confidence !== 'medium') {
        clubLine += ` (${club.confidence} confidence)`;
      }
      if (club.notes) {
        clubLine += ` — ${club.notes}`;
      }
      lines.push(clubLine);
    }
  }

  return lines.join('\n');
}

/**
 * Build the weather context string
 */
function buildWeatherContext(weather: WeatherConditions): string {
  return `
CURRENT CONDITIONS:
Temperature: ${weather.temperatureF}°F
Wind: ${weather.windSpeedMph} mph from ${weather.windDirection}
Humidity: ${weather.humidity}%
Conditions: ${weather.description}
${weather.altitude ? `Altitude: ${weather.altitude} feet` : ''}`;
}

/**
 * Build the current hole/situation context
 */
function buildSituationContext(round: RoundState, hole: HoleData | null): string {
  const lines: string[] = ['\nCURRENT SITUATION:'];

  lines.push(`Course: ${round.courseData.name}`);
  lines.push(`Hole: ${round.currentHole} of ${round.courseData.holes.length}`);

  if (hole) {
    lines.push(`Par: ${hole.par}`);
    lines.push(`Yardage: ${hole.yardage} yards (${round.teeBox} tees)`);
    if (hole.strokeIndex) {
      lines.push(`Stroke index: ${hole.strokeIndex} (${hole.strokeIndex <= 6 ? 'hard' : hole.strokeIndex <= 12 ? 'medium' : 'easier'} hole)`);
    }
    if (hole.dogleg) {
      lines.push(`Hole shape: dogleg ${hole.dogleg}`);
    }
    if (hole.hazards && hole.hazards.length > 0) {
      lines.push(`Hazards: ${hole.hazards.join(', ')}`);
    }
  }

  lines.push(`Shot number: ${round.shotNumber}`);

  if (round.distanceToGreen) {
    lines.push(`Distance to green: ${round.distanceToGreen} yards`);
  }

  if (round.distanceToHazards && round.distanceToHazards.length > 0) {
    for (const h of round.distanceToHazards) {
      lines.push(`Distance to ${h.name}: ${h.distance} yards`);
    }
  }

  if (round.lie) {
    lines.push(`Lie: ${round.lie}`);
  }

  // Score context — how's the round going?
  if (round.scores.length > 0) {
    const holesPlayed = round.scores.length;
    const totalStrokes = round.scores.reduce((sum, s) => sum + s.strokes, 0);
    const totalPar = round.scores.reduce((sum, s) => {
      const holeData = round.courseData.holes.find(h => h.holeNumber === s.holeNumber);
      return sum + (holeData?.par || 4);
    }, 0);
    const toPar = totalStrokes - totalPar;
    const toParStr = toPar === 0 ? 'even par' : toPar > 0 ? `+${toPar}` : `${toPar}`;

    lines.push(`\nROUND STATUS:`);
    lines.push(`Through ${holesPlayed} holes: ${totalStrokes} strokes (${toParStr})`);

    // Recent momentum — last 3 holes
    const recent = round.scores.slice(-3);
    if (recent.length >= 2) {
      const recentResults = recent.map(s => {
        const hd = round.courseData.holes.find(h => h.holeNumber === s.holeNumber);
        const diff = s.strokes - (hd?.par || 4);
        if (diff === 0) return 'par';
        if (diff === -1) return 'birdie';
        if (diff === -2) return 'eagle';
        if (diff === 1) return 'bogey';
        if (diff === 2) return 'double';
        return `+${diff}`;
      });
      lines.push(`Last ${recent.length} holes: ${recentResults.join(', ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * Build the response format instructions based on mode
 */
function buildModeInstructions(mode: CaddieMode): string {
  if (mode === 'voice') {
    return `
RESPONSE FORMAT:
You are in VOICE MODE — the player is on the course and your response will be spoken aloud.
- Maximum 2 sentences. Be direct and confident.
- Give a specific club and target. Commit — no hedging.
- Add one simple swing thought or encouragement.
- Example: "I like 7-iron here. Aim just left of center, smooth tempo, let it fly."
- NEVER start with "Great question" or "That's a good point" — just answer.`;
  }

  return `
RESPONSE FORMAT:
You are in CHAT MODE — the player is off-course or asking a detailed question.
- Up to 3 short paragraphs.
- Be conversational and personalized to their game.
- You can discuss strategy, mechanics, mental game, equipment, or practice.
- Use their stats and profile to give specific, personalized advice.
- If they ask about their game, reference their actual numbers.
- NEVER start with "Great question" or "That's a good point" — just answer.`;
}

// --- Main Context Builder ---

/**
 * Assemble the complete system prompt from all context layers
 */
export function buildSystemPrompt(context: CaddieContext): string {
  const parts: string[] = [];

  // Layer 1: Personality
  parts.push(PERSONALITY_PROMPTS[context.personality]);

  // Layer 2: Golf Intelligence
  parts.push(GOLF_INTELLIGENCE);

  // Layer 3: Player Context
  parts.push(buildPlayerContext(context.profile));

  // Layer 3b: Weather (if available)
  if (context.weather) {
    parts.push(buildWeatherContext(context.weather));
  }

  // Layer 3c: Situation (if in a round)
  if (context.round && context.currentHole) {
    parts.push(buildSituationContext(context.round, context.currentHole));

    // Pre-calculate C.H.E.W. recommendation and inject it
    if (context.round.distanceToGreen && context.round.distanceToGreen > 30) {
      const chewResult = chewRecommend({
        targetDistance: context.round.distanceToGreen,
        weather: context.weather,
        profile: context.profile,
        hole: context.currentHole,
        lie: context.round.lie,
      });

      parts.push(`
C.H.E.W. ANALYSIS (pre-calculated for this shot):
Raw distance: ${context.round.distanceToGreen} yards
Adjusted distance: ${chewResult.adjustedDistance} yards
Adjustments — Heat: ${chewResult.adjustments.heat > 0 ? '+' : ''}${chewResult.adjustments.heat}y, Elevation: ${chewResult.adjustments.elevation > 0 ? '+' : ''}${chewResult.adjustments.elevation}y, Wind: ${chewResult.adjustments.wind > 0 ? '+' : ''}${chewResult.adjustments.wind}y, Lie: ${chewResult.adjustments.lie > 0 ? '+' : ''}${chewResult.adjustments.lie}y
Recommended club: ${formatClubName(chewResult.recommendation.club)}
Wind note: ${chewResult.crosswindEffect}
Use this analysis to inform your club recommendation. You can adjust based on player confidence and situation.`);
    }
  }

  // Response format instructions
  parts.push(buildModeInstructions(context.mode));

  return parts.join('\n\n');
}

/**
 * Build the messages array for the Claude API call
 */
export function buildMessages(
  context: CaddieContext,
  userMessage: string
): { system: string; messages: { role: 'user' | 'assistant'; content: string }[] } {
  const system = buildSystemPrompt(context);

  // Include conversation history + new message
  const messages = [
    ...context.conversationHistory.slice(-10), // last 10 messages for context
    { role: 'user' as const, content: userMessage },
  ];

  return { system, messages };
}
