// ============================================
// mAI Caddy — Golf Constants
// ============================================
// All golf science and C.H.E.W. engine constants.
// Based on real caddie data, TrackMan studies, and USGA standards.
// Update these as you refine the recommendation accuracy.

export const CHEW = {
  // --- Temperature (Heat) ---
  /** Baseline temperature in °F (adjustments are relative to this) */
  baselineTemperatureF: 70,
  /** Yards of carry change per 10°F above/below baseline */
  yardsPerTenDegrees: 1.5,

  // --- Elevation ---
  /** Carry distance increase per 1,000 feet of altitude */
  elevationAdjustPerThousandFeet: 0.02,

  // --- Wind ---
  /** Headwind: % of distance lost per 1 mph of headwind */
  headwindFactorPerMph: 0.01,
  /** Tailwind: % of distance gained per 1 mph (less than headwind — aerodynamics) */
  tailwindFactorPerMph: 0.005,

  /** Crosswind thresholds (mph) for caddie descriptions */
  crosswind: {
    strong: 15,    // "aim well left/right"
    moderate: 8,   // "aim a bit left/right"
    light: 3,      // "light breeze"
  },

  // --- Lie Adjustments ---
  /** % distance lost from rough */
  roughPenalty: 0.05,
  /** % distance lost from bunker */
  bunkerPenalty: 0.08,
  /** % distance change for uphill/downhill lies */
  hillAdjustment: 0.05,

  // --- Club Selection ---
  /** Default club when no profile data exists */
  defaultClub: '7i' as const,
  /** Yards short of target that triggers bumping to next club */
  shortThreshold: 5,
  /** Max distance difference (yards) to consider swapping to higher-confidence club */
  confidenceSwapRange: 10,
} as const;

export const SCORING = {
  /** Labels for score relative to par */
  scoreNames: {
    '-3': 'albatross',
    '-2': 'eagle',
    '-1': 'birdie',
    '0': 'par',
    '1': 'bogey',
    '2': 'double bogey',
    '3': 'triple bogey',
  } as Record<string, string>,
} as const;
