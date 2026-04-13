// ============================================
// mAI Caddy — Betting Engine
// ============================================
// Pure functions that take scores + bet config and compute results.
// No state mutation — call these on every score update.

import { PlayerScore } from '@/components/Scorecard';
import { HoleData } from '@/lib/types';
import { BetConfig, BetSettlement, BetSettlementDetail, NassauPress } from './types';

// --- Handicap Helpers ---

/**
 * Determine how many strokes a player receives on a given hole.
 * Uses stroke index (SI): if handicap >= SI, player gets 1 stroke.
 * If handicap >= SI + 18, player gets 2 strokes (very high handicap).
 */
function strokesReceived(handicap: number, strokeIndex: number): number {
  if (strokeIndex <= 0) return 0;
  let strokes = 0;
  if (handicap >= strokeIndex) strokes++;
  if (handicap >= strokeIndex + 18) strokes++;
  return strokes;
}

/**
 * Get net score for a player on a hole.
 */
function netScore(
  grossScore: number,
  handicap: number,
  strokeIndex: number,
  useHandicap: boolean
): number {
  if (!useHandicap) return grossScore;
  return grossScore - strokesReceived(handicap, strokeIndex);
}

// --- Nassau Engine ---

export interface NassauResult {
  /** Per-player: net holes won/lost on front 9 */
  front: Record<string, number>;
  /** Per-player: net holes won/lost on back 9 */
  back: Record<string, number>;
  /** Per-player: net holes won/lost overall */
  overall: Record<string, number>;
  /** Active presses */
  presses: NassauPressResult[];
  /** Current match status text per player */
  statusText: Record<string, string>;
}

export interface NassauPressResult {
  startHole: number;
  triggeredBy: string;
  amount: number;
  status: Record<string, number>;
}

export function computeNassau(
  bet: BetConfig,
  players: PlayerScore[],
  holes: HoleData[]
): NassauResult {
  const betPlayers = players.filter(p => bet.players.includes(p.name));
  if (betPlayers.length < 2) {
    return { front: {}, back: {}, overall: {}, presses: [], statusText: {} };
  }

  const front: Record<string, number> = {};
  const back: Record<string, number> = {};
  const overall: Record<string, number> = {};
  const presses: NassauPressResult[] = [];

  for (const p of betPlayers) {
    front[p.name] = 0;
    back[p.name] = 0;
    overall[p.name] = 0;
  }

  // Process each hole
  for (const hole of holes) {
    const holeNum = hole.holeNumber;
    const scores: { name: string; net: number }[] = [];

    for (const p of betPlayers) {
      const gross = p.scores[holeNum];
      if (gross === undefined) continue;
      const net = netScore(gross, p.handicap, hole.strokeIndex || holeNum, bet.useHandicap);
      scores.push({ name: p.name, net });
    }

    // Need all players to have scored this hole
    if (scores.length < betPlayers.length) continue;

    // Find winner(s) — lowest net wins
    const minNet = Math.min(...scores.map(s => s.net));
    const winners = scores.filter(s => s.net === minNet);

    // If tie, no change. If one winner, they win the hole.
    if (winners.length === 1) {
      const winner = winners[0].name;
      for (const p of betPlayers) {
        if (p.name === winner) {
          overall[p.name]++;
          if (holeNum <= 9) front[p.name]++;
          else back[p.name]++;
        } else {
          overall[p.name]--;
          if (holeNum <= 9) front[p.name]--;
          else back[p.name]--;
        }
      }
    }

    // Check auto-press trigger
    if (bet.autoPressAt && bet.autoPressAt > 0) {
      for (const p of betPlayers) {
        const bucket = holeNum <= 9 ? front : back;
        // If this player is down by autoPressAt, and no existing press from this hole
        if (bucket[p.name] <= -bet.autoPressAt) {
          const alreadyPressed = presses.some(
            pr => pr.triggeredBy === p.name && pr.startHole === holeNum
          );
          if (!alreadyPressed) {
            const pressStatus: Record<string, number> = {};
            for (const pp of betPlayers) pressStatus[pp.name] = 0;
            presses.push({
              startHole: holeNum,
              triggeredBy: p.name,
              amount: bet.amount,
              status: pressStatus,
            });
          }
        }
      }
    }

    // Update press statuses
    for (const press of presses) {
      if (holeNum < press.startHole) continue;
      if (winners.length === 1) {
        const winner = winners[0].name;
        for (const p of betPlayers) {
          if (p.name === winner) press.status[p.name]++;
          else press.status[p.name]--;
        }
      }
    }
  }

  // Generate status text
  const statusText: Record<string, string> = {};
  if (betPlayers.length === 2) {
    const [a, b] = betPlayers;
    const diff = overall[a.name] - overall[b.name];
    if (diff > 0) {
      statusText[a.name] = `${diff} UP`;
      statusText[b.name] = `${diff} DN`;
    } else if (diff < 0) {
      statusText[a.name] = `${-diff} DN`;
      statusText[b.name] = `${-diff} UP`;
    } else {
      statusText[a.name] = 'AS';
      statusText[b.name] = 'AS';
    }
  }

  return { front, back, overall, presses, statusText };
}

// --- Skins Engine ---

export interface SkinsResult {
  /** holeNumber → winner name (only holes that were won) */
  winners: Record<number, string>;
  /** holeNumber → number of skins that hole was worth */
  skinValues: Record<number, number>;
  /** Per-player total skins won */
  totals: Record<string, number>;
  /** Current carryover count */
  carryover: number;
}

export function computeSkins(
  bet: BetConfig,
  players: PlayerScore[],
  holes: HoleData[]
): SkinsResult {
  const betPlayers = players.filter(p => bet.players.includes(p.name));
  const winners: Record<number, string> = {};
  const skinValues: Record<number, number> = {};
  const totals: Record<string, number> = {};

  for (const p of betPlayers) totals[p.name] = 0;

  let carryover = 0;

  for (const hole of holes) {
    const holeNum = hole.holeNumber;
    const scores: { name: string; net: number }[] = [];

    for (const p of betPlayers) {
      const gross = p.scores[holeNum];
      if (gross === undefined) continue;
      const net = netScore(gross, p.handicap, hole.strokeIndex || holeNum, bet.useHandicap);
      scores.push({ name: p.name, net });
    }

    if (scores.length < betPlayers.length) continue;

    const minNet = Math.min(...scores.map(s => s.net));
    const best = scores.filter(s => s.net === minNet);

    if (best.length === 1) {
      // Outright winner — takes the skin + carryovers
      const value = 1 + carryover;
      winners[holeNum] = best[0].name;
      skinValues[holeNum] = value;
      totals[best[0].name] += value;
      carryover = 0;
    } else {
      // Tie — skin carries over
      carryover++;
    }
  }

  return { winners, skinValues, totals, carryover };
}

// --- Settlement Calculator ---

export function settleNassau(
  nassau: NassauResult,
  bet: BetConfig,
  players: PlayerScore[]
): BetSettlement {
  const betPlayers = players.filter(p => bet.players.includes(p.name));
  const netAmounts: Record<string, number> = {};
  const details: BetSettlementDetail[] = [];

  for (const p of betPlayers) netAmounts[p.name] = 0;

  if (betPlayers.length !== 2) {
    // For simplicity, Nassau settlement for 2 players only right now
    return { netAmounts, details };
  }

  const [a, b] = betPlayers;

  // Front 9
  const frontDiff = nassau.front[a.name] - nassau.front[b.name];
  if (frontDiff !== 0) {
    const winner = frontDiff > 0 ? a.name : b.name;
    const loser = frontDiff > 0 ? b.name : a.name;
    details.push({ label: 'Front 9', winner, loser, amount: bet.amount });
    netAmounts[winner] += bet.amount;
    netAmounts[loser] -= bet.amount;
  }

  // Back 9
  const backDiff = nassau.back[a.name] - nassau.back[b.name];
  if (backDiff !== 0) {
    const winner = backDiff > 0 ? a.name : b.name;
    const loser = backDiff > 0 ? b.name : a.name;
    details.push({ label: 'Back 9', winner, loser, amount: bet.amount });
    netAmounts[winner] += bet.amount;
    netAmounts[loser] -= bet.amount;
  }

  // Overall
  const overallDiff = nassau.overall[a.name] - nassau.overall[b.name];
  if (overallDiff !== 0) {
    const winner = overallDiff > 0 ? a.name : b.name;
    const loser = overallDiff > 0 ? b.name : a.name;
    details.push({ label: 'Overall 18', winner, loser, amount: bet.amount });
    netAmounts[winner] += bet.amount;
    netAmounts[loser] -= bet.amount;
  }

  // Presses
  for (const press of nassau.presses) {
    const pressDiff = press.status[a.name] - press.status[b.name];
    if (pressDiff !== 0) {
      const winner = pressDiff > 0 ? a.name : b.name;
      const loser = pressDiff > 0 ? b.name : a.name;
      details.push({
        label: `Press (hole ${press.startHole})`,
        winner,
        loser,
        amount: press.amount,
      });
      netAmounts[winner] += press.amount;
      netAmounts[loser] -= press.amount;
    }
  }

  return { netAmounts, details };
}

export function settleSkins(
  skins: SkinsResult,
  bet: BetConfig,
  players: PlayerScore[]
): BetSettlement {
  const betPlayers = players.filter(p => bet.players.includes(p.name));
  const netAmounts: Record<string, number> = {};
  const details: BetSettlementDetail[] = [];

  for (const p of betPlayers) netAmounts[p.name] = 0;

  // Each skin is worth bet.amount
  const totalSkins = Object.values(skins.totals).reduce((s, v) => s + v, 0);
  if (totalSkins === 0) return { netAmounts, details };

  // Each player pays (totalSkins / numPlayers) * amount into the pot,
  // then gets their skins * amount back.
  // Simplified: net = (mySkins - avgSkins) * amount * numPlayers...
  // Actually simpler: pairwise settlement. Each player with fewer skins pays each player with more.
  const playerList = betPlayers.map(p => ({ name: p.name, skins: skins.totals[p.name] || 0 }));

  for (let i = 0; i < playerList.length; i++) {
    for (let j = i + 1; j < playerList.length; j++) {
      const diff = playerList[i].skins - playerList[j].skins;
      if (diff !== 0) {
        const winner = diff > 0 ? playerList[i].name : playerList[j].name;
        const loser = diff > 0 ? playerList[j].name : playerList[i].name;
        const amount = Math.abs(diff) * bet.amount;
        details.push({ label: `Skins (${Math.abs(diff)} skin diff)`, winner, loser, amount });
        netAmounts[winner] += amount;
        netAmounts[loser] -= amount;
      }
    }
  }

  return { netAmounts, details };
}

/** Generic settle function that dispatches based on bet type */
export function settleBet(
  bet: BetConfig,
  players: PlayerScore[],
  holes: HoleData[]
): BetSettlement {
  switch (bet.type) {
    case 'nassau': {
      const result = computeNassau(bet, players, holes);
      return settleNassau(result, bet, players);
    }
    case 'skins': {
      const result = computeSkins(bet, players, holes);
      return settleSkins(result, bet, players);
    }
    default:
      // Other bet types: return empty settlement for now
      return { netAmounts: {}, details: [] };
  }
}
