'use client';

import { useState } from 'react';
import { BetConfig, BetType, BetTypeInfo } from '@/lib/betting/types';
import { BET_TYPE_LIST, COMMON_AMOUNTS } from '@/lib/betting/bet-types';
import { PlayerScore } from './Scorecard';

interface BetSetupProps {
  players: PlayerScore[];
  onConfirm: (bet: BetConfig) => void;
  onCancel: () => void;
}

export default function BetSetup({ players, onConfirm, onCancel }: BetSetupProps) {
  const [selectedType, setSelectedType] = useState<BetTypeInfo>(BET_TYPE_LIST[0]);
  const [amount, setAmount] = useState(BET_TYPE_LIST[0].defaultAmount);
  const [customAmount, setCustomAmount] = useState('');
  const [useHandicap, setUseHandicap] = useState(true);
  const [autoPressAt, setAutoPressAt] = useState(2);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>(players.map(p => p.name));
  const [showExplainer, setShowExplainer] = useState(false);

  const togglePlayer = (name: string) => {
    setSelectedPlayers(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const handleTypeChange = (typeId: string) => {
    const info = BET_TYPE_LIST.find(t => t.id === typeId);
    if (info) {
      setSelectedType(info);
      setAmount(info.defaultAmount);
    }
  };

  const handleConfirm = () => {
    const finalAmount = customAmount ? parseFloat(customAmount) : amount;
    if (isNaN(finalAmount) || finalAmount <= 0) return;
    if (selectedPlayers.length < selectedType.minPlayers) return;

    onConfirm({
      type: selectedType.id,
      amount: finalAmount,
      useHandicap: selectedType.usesHandicap ? useHandicap : false,
      autoPressAt: selectedType.supportsPress ? autoPressAt : undefined,
      players: selectedPlayers,
    });
  };

  const validPlayerCount =
    selectedPlayers.length >= selectedType.minPlayers &&
    selectedPlayers.length <= selectedType.maxPlayers;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-5 max-w-sm w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-green-700 mb-4">Set Up a Bet</h3>

        {/* Bet Type Selector */}
        <label className="text-xs text-gray-500 mb-1 block">Wager Type</label>
        <div className="relative mb-3">
          <select
            value={selectedType.id}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-green-500 appearance-none"
          >
            {BET_TYPE_LIST.map(t => (
              <option key={t.id} value={t.id}>
                {t.emoji} {t.name} — {t.tagline}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowExplainer(!showExplainer)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-green-600 hover:text-green-500"
          >
            {showExplainer ? 'Hide' : 'How?'}
          </button>
        </div>

        {/* Explainer */}
        {showExplainer && (
          <div className="bg-sky-50 rounded-lg p-3 mb-3 border border-sky-200">
            <p className="text-sm text-gray-700 mb-2">{selectedType.description}</p>
            <div className="space-y-1">
              {selectedType.howToPlay.map((step, i) => (
                <p key={i} className="text-xs text-gray-600">
                  <span className="text-green-700 font-medium">{i + 1}.</span> {step}
                </p>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-sky-200">
              <span className="text-gray-600 font-medium">Settlement:</span> {selectedType.settlement}
            </p>
          </div>
        )}

        {/* Wager Amount */}
        <label className="text-xs text-gray-500 mb-1 block">Amount per {selectedType.name === 'Skins' ? 'skin' : 'bet'}</label>
        <div className="flex gap-1.5 mb-1">
          {COMMON_AMOUNTS.map(a => (
            <button
              key={a}
              onClick={() => { setAmount(a); setCustomAmount(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                amount === a && !customAmount
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-50 text-gray-600 border border-gray-300 hover:border-green-500'
              }`}
            >
              ${a}
            </button>
          ))}
        </div>
        <input
          type="number"
          value={customAmount}
          onChange={(e) => { setCustomAmount(e.target.value); }}
          placeholder="Custom amount..."
          className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 mb-3"
        />

        {/* Players */}
        <label className="text-xs text-gray-500 mb-1 block">
          Players ({selectedType.minPlayers}-{selectedType.maxPlayers})
        </label>
        <div className="flex flex-wrap gap-2 mb-3">
          {players.map(p => (
            <button
              key={p.name}
              onClick={() => togglePlayer(p.name)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedPlayers.includes(p.name)
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-50 text-gray-600 border border-gray-300'
              }`}
            >
              {p.name} ({p.handicap})
            </button>
          ))}
        </div>
        {!validPlayerCount && (
          <p className="text-xs text-amber-600 mb-3">
            {selectedType.name} needs {selectedType.minPlayers}-{selectedType.maxPlayers} players
          </p>
        )}

        {/* Handicap Toggle */}
        {selectedType.usesHandicap && (
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-600">Use handicap strokes</span>
            <button
              onClick={() => setUseHandicap(!useHandicap)}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                useHandicap ? 'bg-green-600' : 'bg-gray-300'
              }`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                useHandicap ? 'left-6' : 'left-0.5'
              }`} />
            </button>
          </div>
        )}

        {/* Auto-Press (Nassau only) */}
        {selectedType.supportsPress && (
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-600">Auto-press when down by</span>
            <div className="flex gap-1">
              {[0, 2, 3].map(n => (
                <button
                  key={n}
                  onClick={() => setAutoPressAt(n)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    autoPressAt === n
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-50 text-gray-600 border border-gray-300'
                  }`}
                >
                  {n === 0 ? 'Off' : n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Total at risk */}
        <div className="bg-green-50 rounded-lg p-3 mb-4 text-center border border-green-200">
          <span className="text-xs text-gray-500">Total at risk: </span>
          <span className="text-green-700 font-bold">
            ${selectedType.id === 'nassau'
              ? (customAmount ? parseFloat(customAmount) : amount) * 3
              : selectedType.id === 'skins'
                ? (customAmount ? parseFloat(customAmount) : amount) * 18
                : selectedType.id === 'bingo_bango_bongo'
                  ? (customAmount ? parseFloat(customAmount) : amount) * 54
                  : (customAmount ? parseFloat(customAmount) : amount)
            }
          </span>
          {selectedType.id === 'nassau' && (
            <span className="text-xs text-gray-400 block mt-0.5">
              (${customAmount || amount} × 3 legs{autoPressAt > 0 ? ' + presses' : ''})
            </span>
          )}
          {selectedType.id === 'skins' && (
            <span className="text-xs text-gray-400 block mt-0.5">
              (${customAmount || amount} × 18 holes, max exposure)
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl font-medium border border-gray-300 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!validPlayerCount}
            className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-200 disabled:text-gray-400 text-white py-2.5 rounded-xl font-medium transition-colors"
          >
            Lock It In
          </button>
        </div>
      </div>
    </div>
  );
}
