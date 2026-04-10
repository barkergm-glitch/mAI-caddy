// ============================================
// mAI Caddy — C.H.E.W. Club Recommendation Engine
// ============================================
// Carry + Heat + Elevation + Wind = Adjusted Distance
// This is how real caddies think about club selection.

import {
  ClubInBag,
  ClubRecommendation,
  WeatherConditions,
  HoleData,
  GolferProfile,
  ConfidenceLevel,
  ClubType,
} from '@/lib/types';
import { CHEW } from '@/lib/config';

// --- C.H.E.W. Adjustment Functions ---

/**
 * Heat (Temperature) adjustment
 * Ball travels ~1.5 yards further per 10°F above 70°F baseline
 * Cold air is denser = less carry
 */
export function heatAdjustment(temperatureF: number, baseDistance: number): number {
  const baseline = CHEW.baselineTemperatureF;
  const yardsPerTenDegrees = CHEW.yardsPerTenDegrees;
  const tempDiff = temperatureF - baseline;
  const adjustment = (tempDiff / 10) * yardsPerTenDegrees;
  // Return the yards to ADD to the required distance (negative = ball goes shorter, need more club)
  // If it's cold, ball flies shorter, so we need to play MORE distance → positive adjustment to target
  // If it's hot, ball flies longer, so we need to play LESS distance → negative adjustment to target
  return -adjustment;
}

/**
 * Elevation adjustment
 * +2% carry distance per 1,000 feet above sea level
 * Thinner air = less drag = more carry
 */
export function elevationAdjustment(altitudeFeet: number, baseDistance: number): number {
  const adjustmentPercent = (altitudeFeet / 1000) * CHEW.elevationAdjustPerThousandFeet;
  // At altitude, ball goes FURTHER, so we need LESS club → negative adjustment to target
  return -(baseDistance * adjustmentPercent);
}

/**
 * Wind adjustment
 * Headwind: +10-15% distance (need more club)
 * Tailwind: -5-7% distance (need less club)
 * Crosswind: minor distance effect, mostly affects direction
 *
 * @param windSpeedMph - wind speed
 * @param windAngleToShot - 0° = pure headwind, 180° = pure tailwind, 90° = pure crosswind
 */
export function windAdjustment(
  windSpeedMph: number,
  windAngleToShot: number,
  baseDistance: number
): { distanceAdjustment: number; crosswindEffect: string } {
  // Decompose wind into headwind/tailwind and crosswind components
  const windAngleRad = (windAngleToShot * Math.PI) / 180;
  const headwindComponent = Math.cos(windAngleRad) * windSpeedMph; // positive = headwind
  const crosswindComponent = Math.sin(windAngleRad) * windSpeedMph; // positive = left-to-right

  // Headwind costs more than tailwind helps (aerodynamics)
  let distanceAdjustment = 0;
  if (headwindComponent > 0) {
    // Headwind: roughly 1% distance loss per 1 mph of headwind component
    // 10 mph headwind on 150 yard shot = ~15 yards more needed
    distanceAdjustment = headwindComponent * (baseDistance * CHEW.headwindFactorPerMph);
  } else {
    distanceAdjustment = headwindComponent * (baseDistance * CHEW.tailwindFactorPerMph);
  }

  // Crosswind description for caddie advice
  let crosswindEffect = 'minimal crosswind';
  const absXWind = Math.abs(crosswindComponent);
  if (absXWind > CHEW.crosswind.strong) {
    crosswindEffect = crosswindComponent > 0
      ? 'strong wind left-to-right — aim well left'
      : 'strong wind right-to-left — aim well right';
  } else if (absXWind > CHEW.crosswind.moderate) {
    crosswindEffect = crosswindComponent > 0
      ? 'moderate wind left-to-right — aim a bit left'
      : 'moderate wind right-to-left — aim a bit right';
  } else if (absXWind > CHEW.crosswind.light) {
    crosswindEffect = crosswindComponent > 0
      ? 'light breeze left-to-right'
      : 'light breeze right-to-left';
  }

  return { distanceAdjustment, crosswindEffect };
}

/**
 * Calculate the angle between wind direction and the shot direction (tee to green)
 * Returns 0° for pure headwind, 180° for pure tailwind
 */
export function calculateWindAngleToShot(
  windDirectionDegrees: number,  // meteorological: direction wind comes FROM
  shotDirectionDegrees: number   // direction from player to target
): number {
  // Wind direction is where it comes FROM, so the wind vector points opposite
  // A headwind means wind is coming from the direction you're hitting toward
  let angle = Math.abs(windDirectionDegrees - shotDirectionDegrees);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

/**
 * Calculate shot direction from player position to target (green)
 * Returns compass bearing in degrees (0° = North, 90° = East)
 */
export function calculateShotDirection(
  fromLat: number, fromLon: number,
  toLat: number, toLon: number
): number {
  const dLon = ((toLon - fromLon) * Math.PI) / 180;
  const fromLatRad = (fromLat * Math.PI) / 180;
  const toLatRad = (toLat * Math.PI) / 180;

  const x = Math.sin(dLon) * Math.cos(toLatRad);
  const y = Math.cos(fromLatRad) * Math.sin(toLatRad) -
    Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(dLon);

  let bearing = (Math.atan2(x, y) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

// --- Main C.H.E.W. Engine ---

interface CHEWInput {
  targetDistance: number;        // raw distance to target in yards
  weather: WeatherConditions | null;
  profile: GolferProfile;
  hole: HoleData | null;
  playerLat?: number;
  playerLon?: number;
  lie?: string;
}

interface CHEWResult {
  adjustedDistance: number;
  recommendation: ClubRecommendation;
  adjustments: {
    heat: number;
    elevation: number;
    wind: number;
    lie: number;
    total: number;
  };
  crosswindEffect: string;
}

/**
 * The main C.H.E.W. engine — calculates adjusted distance and recommends a club
 */
export function chewRecommend(input: CHEWInput): CHEWResult {
  const { targetDistance, weather, profile, hole, playerLat, playerLon, lie } = input;

  let heatAdj = 0;
  let elevAdj = 0;
  let windAdj = 0;
  let lieAdj = 0;
  let crosswindEffect = 'no wind data';

  // --- Heat adjustment ---
  if (weather) {
    heatAdj = heatAdjustment(weather.temperatureF, targetDistance);
  }

  // --- Elevation adjustment ---
  const altitude = weather?.altitude || hole?.notes?.match(/altitude[:\s]+(\d+)/i)?.[1];
  if (altitude) {
    elevAdj = elevationAdjustment(typeof altitude === 'number' ? altitude : parseInt(altitude), targetDistance);
  }

  // --- Wind adjustment ---
  if (weather && weather.windSpeedMph > 2) {
    let shotDirection: number | null = null;

    // Calculate shot direction if we have coordinates
    if (playerLat && playerLon && hole?.greenLat && hole?.greenLon) {
      shotDirection = calculateShotDirection(playerLat, playerLon, hole.greenLat, hole.greenLon);
    }

    if (shotDirection !== null) {
      const windAngle = calculateWindAngleToShot(weather.windDirectionDegrees, shotDirection);
      const windResult = windAdjustment(weather.windSpeedMph, windAngle, targetDistance);
      windAdj = windResult.distanceAdjustment;
      crosswindEffect = windResult.crosswindEffect;
    } else {
      // No GPS data — give general wind info
      crosswindEffect = `${weather.windSpeedMph} mph wind from ${weather.windDirection} — adjust accordingly`;
    }
  }

  // --- Lie adjustment ---
  if (lie) {
    switch (lie.toLowerCase()) {
      case 'rough':
      case 'deep rough':
        lieAdj = targetDistance * CHEW.roughPenalty;
        break;
      case 'bunker':
      case 'fairway bunker':
        lieAdj = targetDistance * CHEW.bunkerPenalty;
        break;
      case 'uphill':
        lieAdj = targetDistance * CHEW.hillAdjustment;
        break;
      case 'downhill':
        lieAdj = -(targetDistance * CHEW.hillAdjustment);
        break;
      default:
        lieAdj = 0;
    }
  }

  // --- Total adjusted distance ---
  const totalAdjustment = heatAdj + elevAdj + windAdj + lieAdj;
  const adjustedDistance = targetDistance + totalAdjustment;

  // --- Find best club ---
  const recommendation = selectClub(adjustedDistance, profile, lie);

  return {
    adjustedDistance: Math.round(adjustedDistance),
    recommendation,
    adjustments: {
      heat: Math.round(heatAdj),
      elevation: Math.round(elevAdj),
      wind: Math.round(windAdj),
      lie: Math.round(lieAdj),
      total: Math.round(totalAdjustment),
    },
    crosswindEffect,
  };
}

/**
 * Select the best club for a given adjusted distance from the player's bag
 */
function selectClub(
  adjustedDistance: number,
  profile: GolferProfile,
  lie?: string,
): ClubRecommendation {
  const clubs = profile.clubs;

  if (!clubs.length) {
    return {
      club: CHEW.defaultClub,
      adjustedDistance,
      targetDescription: 'center of green',
      reasoning: 'No club data in profile — defaulting to 7-iron. Add your clubs for better recommendations.',
      confidence: 'low',
    };
  }

  // Sort clubs by average distance (ascending)
  const sorted = [...clubs].sort((a, b) => a.avgDistance - b.avgDistance);

  // Find the club whose average distance is closest to (but ideally just over) the target
  let bestClub: ClubInBag | null = null;
  let altClub: ClubInBag | null = null;
  let bestDiff = Infinity;

  for (const club of sorted) {
    const diff = club.avgDistance - adjustedDistance;

    // Prefer a club that reaches the target (diff >= 0) over one that falls short
    // But don't want to be way over either
    if (Math.abs(diff) < Math.abs(bestDiff)) {
      altClub = bestClub;
      bestClub = club;
      bestDiff = diff;
    }
  }

  // If best club falls short, bump up to next club (better to be pin-high than short)
  if (bestClub && bestDiff < -CHEW.shortThreshold) {
    const idx = sorted.indexOf(bestClub);
    if (idx < sorted.length - 1) {
      altClub = bestClub;
      bestClub = sorted[idx + 1];
      bestDiff = bestClub.avgDistance - adjustedDistance;
    }
  }

  // Factor in confidence — if low confidence with best club, consider alternative
  let confidence: ConfidenceLevel = bestClub?.confidence || 'medium';
  let reasoning = `${Math.round(adjustedDistance)} yards adjusted distance.`;

  if (bestClub && bestClub.confidence === 'low' && altClub && altClub.confidence !== 'low') {
    // Swap to the club they're more confident with if it's close enough
    const altDiff = Math.abs(altClub.avgDistance - adjustedDistance);
    if (altDiff < CHEW.confidenceSwapRange) {
      const temp = bestClub;
      bestClub = altClub;
      altClub = temp;
      reasoning += ' Going with the club you trust more.';
      confidence = bestClub.confidence;
    }
  }

  const clubName = formatClubName(bestClub?.clubType || CHEW.defaultClub);
  const altClubName = altClub ? formatClubName(altClub.clubType) : undefined;

  return {
    club: bestClub?.clubType || '7i',
    adjustedDistance: Math.round(adjustedDistance),
    targetDescription: 'center of green',
    reasoning,
    confidence,
    alternateClub: altClub?.clubType,
    alternateReasoning: altClub
      ? `${altClubName} is an option at ${altClub.avgDistance} yards average`
      : undefined,
  };
}

/**
 * Format club type for display: "7i" → "7-iron", "pw" → "pitching wedge", etc.
 */
export function formatClubName(club: ClubType): string {
  const names: Record<ClubType, string> = {
    driver: 'driver',
    '3w': '3-wood',
    '5w': '5-wood',
    '7w': '7-wood',
    '3h': '3-hybrid',
    '4h': '4-hybrid',
    '5h': '5-hybrid',
    '3i': '3-iron',
    '4i': '4-iron',
    '5i': '5-iron',
    '6i': '6-iron',
    '7i': '7-iron',
    '8i': '8-iron',
    '9i': '9-iron',
    pw: 'pitching wedge',
    gw: 'gap wedge',
    sw: 'sand wedge',
    lw: 'lob wedge',
    putter: 'putter',
  };
  return names[club] || club;
}
