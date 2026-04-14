// ============================================
// mAI Caddy — Stroke Counter
// ============================================
// Pure helpers that derive stroke-counting signals from natural
// language: how many shots a user just described, whether they took
// a penalty, whether the hole is done, and whether a reply is a yes/no
// confirmation to a "5, right?" prompt.
//
// Kept intentionally conservative — we'd rather undercount and let the
// user tap to fix than make up strokes. The UX confirms before writing
// anything to the scorecard.

export interface StrokeEvents {
  /** Number of distinct shots described in this utterance */
  shots: number;
  /** Penalty strokes (water, OB, lost ball, drop, etc.) */
  penalties: number;
  /** User signaled the hole is complete (holed out, picked up, gimme, etc.) */
  holeComplete: boolean;
  /** User is reporting an explicit final score for the hole ("I made a 5") */
  reportedScore: number | null;
}

// --- Vocabulary ---

// Verb forms that count as one shot each time they appear.
// Tense-agnostic; we match on word stems.
const SHOT_VERBS = [
  'hit', 'hits',
  'drove', 'drive', 'drives', 'driving',
  'chip', 'chips', 'chipped', 'chipping',
  'pitch', 'pitches', 'pitched', 'pitching',
  'putt', 'putts', 'putted', 'putting',
  'lag', 'lagged', 'lagging',
  'tap', 'taps', 'tapped', 'tapping',
  'flop', 'flops', 'flopped',
  'punch', 'punches', 'punched',
  'bunt', 'bunted',
  'stripe', 'striped', 'striping',
  'launch', 'launched',
  'flushed',
  'sent',
  'smoked',
  'bombed',
  'duffed',
  'topped',
  'skulled', 'thinned', 'bladed', 'chunked',
];

// Club mentions — when they're the ONLY signal in an utterance, we
// count the utterance as one shot. (Avoids double-counting "hit driver".)
const CLUB_WORDS = [
  'driver', 'wood', '3-wood', '5-wood', '3w', '5w',
  'hybrid', '3h', '4h', '5h',
  '3-iron', '4-iron', '5-iron', '6-iron', '7-iron', '8-iron', '9-iron',
  '3i', '4i', '5i', '6i', '7i', '8i', '9i',
  'wedge', 'pw', 'gw', 'sw', 'lw',
  'pitching wedge', 'gap wedge', 'sand wedge', 'lob wedge',
  'putter',
];

// Phrases signaling the hole is done
const HOLE_COMPLETE_PHRASES = [
  'in the hole', 'in the cup',
  'holed out', 'holed it',
  'drained it', 'drained', 'sunk it', 'sunk', 'sank it',
  'buried it', 'poured it in',
  'tap in', 'tapped in', 'tap-in',
  'picked up', 'pick up', 'pick it up',
  'concede', 'conceded',
  'gimme', 'given', 'give me that',
  'that\'s good', 'thats good',
  'finish the hole', 'finished the hole', 'hole complete', 'done with the hole',
  'walked off', 'walk off',
];

const PENALTY_PHRASES = [
  'water', 'hazard', 'in the drink', 'wet',
  'ob', 'o.b.', 'out of bounds',
  'lost ball', 'lost it', 'couldn\'t find it',
  'took a drop', 'drop', 'dropping',
  'penalty',
];

const AFFIRMATIVE = [
  'yes', 'yep', 'yeah', 'yup', 'yea',
  'right', 'correct', 'confirmed',
  'ok', 'okay', 'affirmative',
  'sure', 'sounds right', 'that\'s right', 'thats right',
  'exactly', '100%', 'for sure',
];

const NEGATIVE = [
  'no', 'nope', 'nah', 'not quite', 'not right',
  'wrong', 'incorrect',
  'actually', // "actually it was 6"
];

// --- Utilities ---

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function containsAny(text: string, phrases: string[]): boolean {
  const lower = text.toLowerCase();
  return phrases.some(p => lower.includes(p));
}

function countOccurrences(tokens: string[], vocab: string[]): number {
  const vocabSet = new Set(vocab);
  let n = 0;
  for (const t of tokens) if (vocabSet.has(t)) n++;
  return n;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

// --- Public API ---

/**
 * Extract stroke-counting signals from a single user utterance.
 */
export function detectStrokeEvents(text: string): StrokeEvents {
  if (!text || !text.trim()) {
    return { shots: 0, penalties: 0, holeComplete: false, reportedScore: null };
  }

  const lower = text.toLowerCase();
  const tokens = tokenize(text);

  const verbHits = countOccurrences(tokens, SHOT_VERBS);
  const clubHits = countOccurrences(tokens, CLUB_WORDS);

  // Base shot count from verbs
  let shots = verbHits;

  // If there were no verb hits but clubs were mentioned, count as 1 shot
  if (shots === 0 && clubHits > 0) shots = 1;

  // Multi-clause clue: "then" / "and then" splits typically indicate
  // multiple shots even without enough verb hits (e.g., "driver then 7-iron").
  if (clubHits >= 2 && shots <= 1) {
    const segments = lower.split(/\s+(?:then|and then|followed by|next)\s+/);
    if (segments.length > 1) {
      shots = Math.max(shots, segments.length);
    }
  }

  // Penalties: each penalty phrase match counts as 1 extra stroke
  let penalties = 0;
  for (const p of PENALTY_PHRASES) {
    if (lower.includes(p)) { penalties += 1; break; } // one penalty at a time
  }

  // Hole complete?
  const holeComplete = containsAny(lower, HOLE_COMPLETE_PHRASES);

  // Reported final score: "made a 5", "shot a 6", "carded 4", "took a 7", "for a 5"
  let reportedScore: number | null = null;
  const reportRegex =
    /(?:made|shot|carded|took|had|got|scored|finished with|ended with|for)\s+(?:a\s+|an\s+)?(\w+)/;
  const m = lower.match(reportRegex);
  if (m) {
    const raw = m[1];
    const asInt = parseInt(raw, 10);
    const fromWord = NUMBER_WORDS[raw];
    const n = !isNaN(asInt) ? asInt : (fromWord ?? null);
    if (n !== null && n >= 1 && n <= 20) reportedScore = n;
  }

  return { shots, penalties, holeComplete, reportedScore };
}

/**
 * Is this reply a confirmation like "yes" or "yep" to a "5, right?" prompt?
 */
export function isAffirmative(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (!lower) return false;
  // Whole-token match against the affirmative set (avoid matching "yesterday")
  const tokens = tokenize(lower);
  if (tokens.some(t => AFFIRMATIVE.includes(t))) {
    // but if the message also contains a number, treat it as a correction instead
    if (tokens.some(t => /^\d+$/.test(t) || NUMBER_WORDS[t] !== undefined)) return false;
    return true;
  }
  return AFFIRMATIVE.some(a => a.includes(' ') && lower.includes(a));
}

/**
 * Is this reply a rejection like "no" / "wrong"?
 */
export function isNegative(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (!lower) return false;
  const tokens = tokenize(lower);
  return tokens.some(t => NEGATIVE.includes(t));
}

/**
 * Try to extract an explicit number from a correction reply ("no, 6" / "it was six").
 */
export function extractCorrectionNumber(text: string): number | null {
  const lower = text.toLowerCase();
  const digit = lower.match(/\b(\d{1,2})\b/);
  if (digit) {
    const n = parseInt(digit[1], 10);
    if (n >= 1 && n <= 20) return n;
  }
  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    const re = new RegExp(`\\b${word}\\b`);
    if (re.test(lower)) return num;
  }
  return null;
}
