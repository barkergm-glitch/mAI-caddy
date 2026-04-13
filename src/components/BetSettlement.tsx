'use client';

import { useMemo } from 'react';
import { BetConfig, BetSettlement as BetSettlementType } from '@/lib/betting/types';
import { settleBet } from '@/lib/betting/engine';
import { BET_TYPES } from '@/lib/betting/bet-types';
import { PlayerScore } from './Scorecard';
import { HoleData } from '@/lib/types';

interface BetSettlementProps {
  bets: BetConfig[];
  players: PlayerScore[];
  holes: HoleData[];
}

export default function BetSettlement({ bets, players, holes }: BetSettlementProps) {
  const settlements = useMemo(() => {
    return bets.map(bet => ({
      bet,
      settlement: settleBet(bet, players, holes),
      typeInfo: BET_TYPES[bet.type],
    }));
  }, [bets, players, holes]);

  // Aggregate net across all bets
  const totalNet = useMemo(() => {
    const net: Record<string, number> = {};
    for (const p of players) net[p.name] = 0;

    for (const { settlement } of settlements) {
      for (const [name, amount] of Object.entries(settlement.netAmounts)) {
        net[name] = (net[name] || 0) + amount;
      }
    }
    return net;
  }, [settlements, players]);

  if (bets.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-green-700">Bet Settlement</h3>

      {/* Per-bet breakdown */}
      {settlements.map(({ bet, settlement, typeInfo }, idx) => (
        <div key={idx} className="bg-sky-50 rounded-xl p-4 border border-sky-200">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium text-gray-800">
              {typeInfo.emoji} {typeInfo.name}
            </span>
            <span className="text-xs text-gray-500">${bet.amount}/bet</span>
          </div>

          {settlement.details.length > 0 ? (
            <div className="space-y-2">
              {settlement.details.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{d.label}</span>
                  <div>
                    <span className="text-green-700 font-medium">{d.winner}</span>
                    <span className="text-gray-400 mx-1">beats</span>
                    <span className="text-red-600">{d.loser}</span>
                    <span className="text-gray-500 ml-2">${d.amount}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500">No results to settle — all square or insufficient scores.</p>
          )}
        </div>
      ))}

      {/* Total settlement */}
      <div className="bg-green-50 rounded-xl p-4 border border-green-300">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Final Settlement</h4>
        <div className="space-y-2">
          {Object.entries(totalNet)
            .sort(([, a], [, b]) => b - a)
            .map(([name, amount]) => (
              <div key={name} className="flex items-center justify-between">
                <span className="text-sm text-gray-800">{name}</span>
                <span className={`text-lg font-bold ${
                  amount > 0 ? 'text-green-700' :
                  amount < 0 ? 'text-red-600' :
                  'text-gray-500'
                }`}>
                  {amount > 0 ? '+' : ''}{amount === 0 ? 'Even' : `$${amount}`}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
