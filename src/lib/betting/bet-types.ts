// ============================================
// mAI Caddy — Bet Type Definitions & Explainers
// ============================================

import { BetType, BetTypeInfo } from './types';

export const BET_TYPES: Record<BetType, BetTypeInfo> = {
  nassau: {
    id: 'nassau',
    name: 'Nassau',
    emoji: '🏆',
    tagline: 'The king of golf bets',
    description:
      'Three bets in one: front 9, back 9, and overall 18. Each is a separate wager. ' +
      'The most popular golf bet in the world — if you only know one bet, this is it.',
    howToPlay: [
      'Agree on a wager amount (e.g., $5). This means $5 on the front, $5 on the back, $5 on the overall — $15 total at risk.',
      'Each hole is match play: lowest net score wins the hole. Ties push.',
      'Whoever is "up" (winning more holes) on the front 9 after hole 9 wins the front bet.',
      'Same for the back 9 (holes 10-18) and overall (all 18).',
      'With auto-press: if you fall behind by 2 (or your set number), a new side bet automatically starts from that hole forward at the same wager amount.',
    ],
    settlement:
      'Each leg (front, back, overall) pays independently. If you win the front but lose the back and overall, you win $5 but lose $10 — net -$5. Presses are separate bets settled individually.',
    popularity: 'essential',
    minPlayers: 2,
    maxPlayers: 4,
    defaultAmount: 5,
    supportsPress: true,
    usesHandicap: true,
  },

  skins: {
    id: 'skins',
    name: 'Skins',
    emoji: '💰',
    tagline: 'Win the hole, win the pot',
    description:
      'Each hole has a "skin" worth the wager amount. Win the hole outright and you take the skin. ' +
      'If two or more players tie, the skin carries over to the next hole — making it worth double (or more).',
    howToPlay: [
      'Set a per-skin amount (e.g., $2 per hole = $36 total across 18 holes).',
      'On each hole, the player with the lowest net score wins the skin.',
      'If two or more players tie for lowest, nobody wins — the skin carries over and adds to the next hole.',
      'Carryovers can stack: if holes 1 and 2 tie, hole 3 is worth 3 skins.',
      'Last hole carryovers: if hole 18 ties, the skins carry (some groups do a playoff or split).',
    ],
    settlement:
      'Count up each player\'s skins won. Multiply by the per-skin amount. Each player pays the difference to players with more skins.',
    popularity: 'essential',
    minPlayers: 2,
    maxPlayers: 8,
    defaultAmount: 2,
    supportsPress: false,
    usesHandicap: true,
  },

  match_play: {
    id: 'match_play',
    name: 'Match Play',
    emoji: '⚔️',
    tagline: 'Head-to-head, hole by hole',
    description:
      'Pure 1v1 competition. Win the hole, go "1 up." Lose it, go "1 down." ' +
      'The match ends when one player is up by more holes than remain (e.g., "3 and 2" means 3 up with 2 to play).',
    howToPlay: [
      'Two players go head-to-head with a single wager on the match.',
      'Each hole: lowest net score wins the hole. Ties are halved (no change).',
      'Track status as "X up" or "X down" or "all square."',
      'Match can end early if one player is up by more holes than remain.',
      'If all square after 18, the match is halved (tie) — or play sudden death if agreed.',
    ],
    settlement:
      'Winner takes the full wager. If the match is halved, no money changes hands.',
    popularity: 'popular',
    minPlayers: 2,
    maxPlayers: 2,
    defaultAmount: 10,
    supportsPress: true,
    usesHandicap: true,
  },

  wolf: {
    id: 'wolf',
    name: 'Wolf',
    emoji: '🐺',
    tagline: 'Pick your partner — or go alone',
    description:
      'A rotating "wolf" tees off first each hole and watches the other players hit. ' +
      'The wolf then chooses a partner for that hole — or goes "lone wolf" against the group for double stakes.',
    howToPlay: [
      'Rotate wolf order each hole (1-2-3-4, 1-2-3-4...).',
      'The wolf tees off first, then watches each player tee off in order.',
      'After any player\'s tee shot, the wolf can pick them as a partner. Once you pass, you can\'t go back.',
      'If the wolf picks nobody, they\'re the "lone wolf" — playing 1 vs. 3 for double the bet.',
      'The team with the lower best-ball score wins the hole. Wolf team vs. non-wolf team.',
      'Optional "blind wolf": call it before anyone hits for triple stakes.',
    ],
    settlement:
      'Track points per hole. Wolf team wins: +1 each (lone wolf: +3). Wolf team loses: -1 each (lone wolf: -3). Multiply net points by wager.',
    popularity: 'classic',
    minPlayers: 4,
    maxPlayers: 4,
    defaultAmount: 2,
    supportsPress: false,
    usesHandicap: true,
  },

  bingo_bango_bongo: {
    id: 'bingo_bango_bongo',
    name: 'Bingo Bango Bongo',
    emoji: '🎯',
    tagline: 'Three ways to win every hole',
    description:
      'Three points available on every hole: Bingo (first on the green), Bango (closest to the pin once all are on), ' +
      'Bongo (first in the hole). Great equalizer — even high handicappers win points regularly.',
    howToPlay: [
      'Three points per hole, each worth the wager amount.',
      'BINGO: First player to get their ball on the green. (Play in proper order — farthest from hole hits first.)',
      'BANGO: Once all players are on the green, the player closest to the pin gets a point.',
      'BONGO: First player to hole out.',
      'Important: proper golf etiquette (away plays first) must be followed for this bet to work.',
    ],
    settlement:
      'Total points after 18 holes. Each point is worth the wager amount. Settle the differences.',
    popularity: 'classic',
    minPlayers: 3,
    maxPlayers: 4,
    defaultAmount: 1,
    supportsPress: false,
    usesHandicap: false,
  },

  dots: {
    id: 'dots',
    name: 'Dots (Trash / Junk)',
    emoji: '🎪',
    tagline: 'Side action on everything',
    description:
      'A collection of bonus bets that run alongside your main game. ' +
      'Earn or lose "dots" (points) for specific achievements or disasters during the round.',
    howToPlay: [
      'Each dot is worth the agreed amount (e.g., $1/dot).',
      'Common dots: Birdie (+1), Eagle (+3), Sandy (par from bunker, +1), Greenie (closest to pin on par 3, +1).',
      'Negative dots: Three-putt (-1), Water ball (-1), OB (-1), Snowman (8+, -2).',
      'Bonus dots: Birdie after bogey (+1 "bounce back"), Natural birdie on a par 5 (+1).',
      'You can customize which dots are active for your group.',
    ],
    settlement:
      'Net dots × dollar amount. Simple: if you\'re +5 dots and your buddy is -3, he pays you $8.',
    popularity: 'popular',
    minPlayers: 2,
    maxPlayers: 8,
    defaultAmount: 1,
    supportsPress: false,
    usesHandicap: false,
  },
};

/** Bet types sorted by popularity for dropdown display */
export const BET_TYPE_LIST: BetTypeInfo[] = [
  BET_TYPES.nassau,
  BET_TYPES.skins,
  BET_TYPES.match_play,
  BET_TYPES.wolf,
  BET_TYPES.bingo_bango_bongo,
  BET_TYPES.dots,
];

/** Common wager amounts for quick-pick */
export const COMMON_AMOUNTS = [1, 2, 5, 10, 20, 50];
