'use client';

import { useState } from 'react';
import { BET_TYPE_LIST } from '@/lib/betting/bet-types';
import { BetTypeInfo } from '@/lib/betting/types';

function BetExplainer({ info }: { info: BetTypeInfo }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-3xl">{info.emoji}</span>
        <div>
          <h2 className="text-xl font-bold text-gray-800">{info.name}</h2>
          <p className="text-sm text-green-700">{info.tagline}</p>
        </div>
        <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-medium ${
          info.popularity === 'essential' ? 'bg-green-100 text-green-700' :
          info.popularity === 'popular' ? 'bg-sky-100 text-sky-700' :
          'bg-gray-100 text-gray-500'
        }`}>
          {info.popularity}
        </span>
      </div>

      <p className="text-sm text-gray-700 mb-4">{info.description}</p>

      <h3 className="text-sm font-medium text-gray-500 mb-2">How to Play</h3>
      <div className="space-y-2 mb-4">
        {info.howToPlay.map((step, i) => (
          <div key={i} className="flex gap-2 text-sm">
            <span className="text-green-700 font-bold shrink-0">{i + 1}.</span>
            <span className="text-gray-700">{step}</span>
          </div>
        ))}
      </div>

      <h3 className="text-sm font-medium text-gray-500 mb-2">Settlement</h3>
      <p className="text-sm text-gray-700 mb-4">{info.settlement}</p>

      <div className="flex flex-wrap gap-3 text-xs text-gray-500 border-t border-gray-200 pt-3">
        <span>Players: {info.minPlayers}-{info.maxPlayers}</span>
        <span>Default: ${info.defaultAmount}</span>
        {info.supportsPress && <span className="text-amber-600">Auto-press available</span>}
        {info.usesHandicap && <span className="text-sky-600">Handicap strokes</span>}
      </div>
    </div>
  );
}

export default function BetsPage() {
  const [filter, setFilter] = useState<'all' | 'essential' | 'popular' | 'classic'>('all');

  const filtered = filter === 'all'
    ? BET_TYPE_LIST
    : BET_TYPE_LIST.filter(t => t.popularity === filter);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <a href="/" className="text-green-700 text-sm hover:underline mb-2 inline-block">
            ← Back to Caddy
          </a>
          <h1 className="text-3xl font-bold text-green-700 mb-1">Golf Bets Explained</h1>
          <p className="text-gray-500">
            Everything you need to know about the most popular golf wagers. Pick a game, set the stakes, play.
          </p>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {(['all', 'essential', 'popular', 'classic'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                filter === f
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-50 text-gray-600 border border-gray-300 hover:border-green-500'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Bet Cards */}
        {filtered.map(info => (
          <BetExplainer key={info.id} info={info} />
        ))}

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 mt-8 pb-4">
          mAI Caddy tracks your bets automatically during the round.
          Just pick your game and play — we handle the math.
        </div>
      </div>
    </div>
  );
}
