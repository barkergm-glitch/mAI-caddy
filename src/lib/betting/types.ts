// ============================================
// mAI Caddy — Betting System Types
// ============================================

export type BetType =
  | 'nassau'
  | 'skins'
  | 'match_play'
  | 'wolf'
  | 'bingo_bango_bongo'
  | 'dots';

export interface BetTypeInfo {
  id: BetType;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  howToPlay: string[];
  settlement: string;
  popularity: 'essential' | 'popular' | 'classic';
  minPlayers: number;
  maxPlayers: number;
  /** Default wager amount in dollars */
  defaultAmount: number;
  /** Supports auto-press? */
  supportsPress: boolean;
  /** Uses handicap strokes? */
  usesHandicap: boolean;
}

export interface BetConfig {
  type: BetType;
  amount: number;
  /** For Nassau: auto-press when down by this many */
  autoPressAt?: number;
  /** Track with handicap strokes applied */
  useHandicap: boolean;
  /** Player names in the bet (references PlayerScore.name) */
  players: string[];
}

/** Per-hole result for a single player in a bet */
export interface HoleBetResult {
  holeNumber: number;
  /** Net score after handicap strokes (if applicable) */
  netScore: number;
  /** Raw gross score */
  grossScore: number;
  /** Did player receive a stroke on this hole? */
  receivedStroke: boolean;
}

/** Running bet state tracked hole-by-hole */
export interface NassauState {
  frontStatus: Record<string, number>; // player → net holes won/lost on front 9
  backStatus: Record<string, number>;  // player → net holes won/lost on back 9
  overallStatus: Record<string, number>; // player → net holes won/lost overall
  presses: NassauPress[];
}

export interface NassauPress {
  startHole: number;
  triggeredBy: string; // player name who was down
  amount: number;
  status: Record<string, number>; // player → net from press start
}

export interface SkinsState {
  /** Holes that have been won — holeNumber → winner name */
  winners: Record<number, string>;
  /** Holes that carried over (tied) */
  carryovers: number;
  /** Current pot (number of skins available on current hole) */
  currentPot: number;
}

export interface BetSettlement {
  /** Player name → net amount (positive = won, negative = lost) */
  netAmounts: Record<string, number>;
  /** Detailed breakdown per bet component */
  details: BetSettlementDetail[];
}

export interface BetSettlementDetail {
  label: string; // e.g., "Front 9", "Back 9", "Press (started hole 5)"
  winner: string;
  loser: string;
  amount: number;
}
