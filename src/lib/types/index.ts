// ============================================
// mAI Caddy — Core Type Definitions
// ============================================

// --- Player & Profile ---

export type ShotShape = 'straight' | 'fade' | 'draw' | 'slice' | 'hook';
export type MissTendency = 'left' | 'right' | 'short' | 'long' | 'varies';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type ClubType =
  | 'driver' | '3w' | '5w' | '7w'
  | '3h' | '4h' | '5h'
  | '3i' | '4i' | '5i' | '6i' | '7i' | '8i' | '9i'
  | 'pw' | 'gw' | 'sw' | 'lw'
  | 'putter';

export interface ClubInBag {
  clubType: ClubType;
  avgDistance: number;    // yards
  maxDistance: number;    // yards
  confidence: ConfidenceLevel;
  notes?: string;        // e.g., "tends to push right"
}

export interface GolferProfile {
  name: string;
  handicap: number | null;
  age?: number;
  gender?: string;
  shotShape: ShotShape;
  missTendency: MissTendency;
  driverDistance: number;     // average in yards
  clubs: ClubInBag[];
  strengths?: string;
  weaknesses?: string;
  mentalNotes?: string;       // how they handle pressure
  playingStyle?: string;
}

// --- Course Data ---

export interface HoleData {
  holeNumber: number;
  par: number;
  yardage: number;           // from selected tees
  strokeIndex: number;       // 1-18, handicap difficulty ranking
  dogleg?: 'left' | 'right' | 'straight';
  hazards?: string[];        // e.g., ["water left", "bunker right greenside"]
  greenLat?: number;
  greenLon?: number;
  teeLat?: number;
  teeLon?: number;
  notes?: string;
}

export interface CourseData {
  id: string;
  name: string;
  city?: string;
  state?: string;
  country?: string;
  holes: HoleData[];
  courseRating?: number;
  slopeRating?: number;
  altitude?: number;          // feet above sea level
}

// --- Weather ---

export interface WeatherConditions {
  temperatureF: number;
  windSpeedMph: number;
  windDirection: string;      // e.g., "NW", "SSE"
  windDirectionDegrees: number;
  humidity: number;           // percentage
  pressure: number;           // hPa
  description: string;        // e.g., "partly cloudy"
  altitude?: number;          // feet, from course or GPS
}

// --- Round State ---

export interface HoleScore {
  holeNumber: number;
  strokes: number;
  putts?: number;
  fairwayHit?: boolean;
  gir?: boolean;
  penaltyStrokes: number;
  clubOffTee?: ClubType;
}

export interface RoundState {
  courseData: CourseData;
  currentHole: number;
  teeBox: string;             // e.g., "blue", "white"
  scores: HoleScore[];
  shotNumber: number;         // which shot on current hole
  distanceToGreen?: number;   // yards, from GPS
  distanceToHazards?: { name: string; distance: number }[];
  lie?: string;               // e.g., "fairway", "rough", "bunker", "tee"
}

// --- Caddie ---

export type CaddiePersonality = 'pro_jock';
export type CaddieMode = 'voice' | 'chat';

export interface CaddieContext {
  profile: GolferProfile;
  weather: WeatherConditions | null;
  round: RoundState | null;
  currentHole: HoleData | null;
  mode: CaddieMode;
  personality: CaddiePersonality;
  conversationHistory: { role: 'user' | 'assistant'; content: string }[];
}

// --- Club Recommendation ---

export interface ClubRecommendation {
  club: ClubType;
  adjustedDistance: number;     // after C.H.E.W. adjustments
  targetDescription: string;   // e.g., "center green, 10 feet left of pin"
  reasoning: string;           // why this club
  confidence: ConfidenceLevel;
  alternateClub?: ClubType;    // backup option
  alternateReasoning?: string;
}

// --- Bet Tracking ---

export type BetType = 'nassau' | 'skins' | 'sixes' | 'team_match' | 'wolf';
export type HandicapMode = 'gross' | 'net';

export interface NassauPress {
  id: string;
  startHole: number;
  endHole: number;            // 9 for front press, 18 for back/overall press
  level: number;              // 0 = original, 1 = first press, etc.
  parentPressId?: string;
  score: number;              // + means player 1 up, - means player 2 up
  settled: boolean;
}

export interface NassauBet {
  type: 'nassau';
  stakePerBet: number;        // e.g., $2
  autoPress: boolean;
  pressThreshold: number;     // default 2 (press when 2-down)
  front9: NassauPress;
  back9: NassauPress;
  overall: NassauPress;
  activePresses: NassauPress[];
}

export interface SkinsBet {
  type: 'skins';
  stakePerSkin: number;
  carryover: number;          // accumulated unsettled skins
  results: { holeNumber: number; winnerId?: string; value: number }[];
}

export interface BetParticipant {
  userId: string;
  name: string;
  courseHandicap: number;
  strokesReceived: number;    // net strokes vs lowest handicap
  strokeHoles: number[];      // which holes they get strokes on
}

export interface Settlement {
  fromPlayer: string;
  toPlayer: string;
  amount: number;
  breakdown: string[];        // e.g., ["Front 9: $2", "Press from 5: -$2"]
}
