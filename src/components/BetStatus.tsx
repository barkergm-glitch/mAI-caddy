'use client';

import { useMemo } from 'react';
import { BetConfig } from '@/lib/betting/types';
import { computeNassau, computeSkins, NassauResult, SkinsResult } from '@/lib/betting/engine';
import { BET_TYPES } from '@/lib/betting/bet-types';
import { PlayerScore } from './Scorecard';
import { HoleData } from '@/lib/types';

interface BetStatusProps {
  bet: BetConfig;
  players: PlayerScore[];
  holes: HoleData[];
  currentHole: number;
  onRemoveBet: () => void;
}

function NassauStatus({ result, bet, currentHole }: {
  result: NassauResult;
  bet: BetConfig;
  currentHole: number;
}) {
  const isFront = currentHole <= 9;
  const activeBucket = isFront ? result.front : result.back;

  return (
    <div className="space-y-1.5">
      {/* Player standings */}
      {bet.players.map(name => {
        const overall = result.overall[name] || 0;
        const current = activeBucket[name] || 0;
        const status = result.statusText[name] || 'AS';

        return (
          <div key={name} className="flex items-center justify-between">
            <span className="text-xs text-gray-300">{name}</span>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${
                current > 0 ? 'text-green-400' : current < 0 ? 'text-red-400' : 'text-gray-500'
              }`}>
                {isFront ? 'F' : 'B'}: {current > 0 ? `+${current}` : current}
              </span>
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                overall > 0 ? 'bg-green-900 text-green-400' :
                overall < 0 ? 'bg-red-900 text-red-400' :
                'bg-gray-800 text-gray-400'
              }`}>
                {status}
              </span>
            </div>
          </div>
        );
      })}
      {/* Presses */}
      {result.presses.length > 0 && (
        <div className="text-[10px] text-yellow-400 mt-1">
          {result.presses.length} press{result.presses.length > 1 ? 'es' : ''} active
        </div>
      )}
    </div>
  );
}

function SkinsStatus({ result, bet }: {
  result: SkinsResult;
  bet: BetConfig;
}) {
  const totalSkins = Object.values(result.totals).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-1.5">
      {bet.players.map(name => {
        const skins = result.totals[name] || 0;
        return (
          <div key={name} className="flex items-center justify-between">
            <span className="text-xs text-gray-300">{name}</span>
            <span className={`text-xs font-bold ${
              skins > 0 ? 'text-green-400' : 'text-gray-500'
            }`}>
              {skins} skin{skins !== 1 ? 's' : ''} (${skins * bet.amount})
            </span>
          </div>
        );
      })}
      {result.carryover > 0 && (
        <div className="text-[10px] text-yellow-400">
          {result.carryover} skin{result.carryover > 1 ? 's' : ''} carrying over — next hole worth {result.carryover + 1}!
        </div>
      )}
    </div>
  );
}

export default function BetStatus({ bet, players, holes, currentHole, onRemoveBet }: BetStatusProps) {
  const typeInfo = BET_TYPES[bet.type];

  const nassauResult = useMemo(() => {
    if (bet.type !== 'nassau') return null;
    return computeNassau(bet, players, holes);
  }, [bet, players, holes]);

  const skinsResult = useMemo(() => {
    if (bet.type !== 'skins') return null;
    return computeSkins(bet, players, holes);
  }, [bet, players, holes]);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-green-400 font-medium">
          {typeInfo.emoji} {typeInfo.name} · ${bet.amount}
        </span>
        <button
          onClick={onRemoveBet}
          className="text-[10px] text-gray-600 hover:text-red-400 transition-colors"
        >
          Remove
        </button>
      </div>

      {nassauResult && (
        <NassauStatus result={nassauResult} bet={bet} currentHole={currentHole} />
      )}

      {skinsResult && (
        <SkinsStatus result={skinsResult} bet={bet} />
      )}

      {!nassauResult && !skinsResult && (
        <p className="text-xs text-gray-500">Tracking in progress...</p>
      )}
    </div>
  );
}
