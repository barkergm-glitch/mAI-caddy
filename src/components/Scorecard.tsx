'use client';

import { useMemo, useRef, useState } from 'react';
import { useOrientation } from '@/lib/hooks/use-orientation';
import { CourseData, HoleData } from '@/lib/types';

// --- Types ---

export interface PlayerScore {
  name: string;
  handicap: number;
  scores: Record<number, number>; // holeNumber → strokes
}

interface ScorecardProps {
  course: CourseData;
  currentHole: number;
  players: PlayerScore[];
  onHoleTap?: (holeNumber: number) => void;
}

// --- Golf notation helpers ---

function scoreRelativeToPar(score: number, par: number): number {
  return score - par;
}

function getScoreStyle(score: number | undefined, par: number): string {
  if (score === undefined) return '';
  const diff = scoreRelativeToPar(score, par);
  if (diff <= -2) return 'score-eagle';    // double circle
  if (diff === -1) return 'score-birdie';   // circle
  if (diff === 0) return 'score-par';       // plain
  if (diff === 1) return 'score-bogey';     // square
  return 'score-double';                     // double square
}

function getScoreLabel(score: number | undefined): string {
  if (score === undefined) return '-';
  return score.toString();
}

function getTotalScore(player: PlayerScore, holes: HoleData[]): number | null {
  let total = 0;
  let hasAny = false;
  for (const hole of holes) {
    const s = player.scores[hole.holeNumber];
    if (s !== undefined) {
      total += s;
      hasAny = true;
    }
  }
  return hasAny ? total : null;
}

function getTotalPar(holes: HoleData[]): number {
  return holes.reduce((sum, h) => sum + h.par, 0);
}

function getRelativeDisplay(total: number | null, parTotal: number): string {
  if (total === null) return '-';
  const diff = total - parTotal;
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

// --- Portrait: 3 holes (prev 2 + current) ---

function PortraitScorecard({ course, currentHole, players, onHoleTap }: ScorecardProps) {
  // Show previous 2 holes + current hole
  const visibleHoles = useMemo(() => {
    const holes: HoleData[] = [];
    for (let i = Math.max(1, currentHole - 2); i <= currentHole; i++) {
      const h = course.holes.find(h => h.holeNumber === i);
      if (h) holes.push(h);
    }
    return holes;
  }, [course, currentHole]);

  const allHoles = course.holes;

  return (
    <div className="w-full bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      {/* Course name + total */}
      <div className="bg-gray-800 px-3 py-2 flex items-center justify-between">
        <span className="text-xs text-green-400 font-medium truncate">{course.name}</span>
        <span className="text-xs text-gray-400">Hole {currentHole} of {course.holes.length}</span>
      </div>

      {/* Scorecard grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-center text-xs">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="px-2 py-1.5 text-left text-gray-500 font-normal w-20">Hole</th>
              {visibleHoles.map(h => (
                <th
                  key={h.holeNumber}
                  className={`px-3 py-1.5 font-bold cursor-pointer transition-colors min-w-[44px] ${
                    h.holeNumber === currentHole
                      ? 'text-green-400 bg-green-900/30'
                      : 'text-gray-300'
                  }`}
                  onClick={() => onHoleTap?.(h.holeNumber)}
                >
                  {h.holeNumber}
                </th>
              ))}
              <th className="px-2 py-1.5 text-gray-400 font-medium min-w-[44px]">Tot</th>
              <th className="px-2 py-1.5 text-gray-400 font-medium min-w-[44px]">+/-</th>
            </tr>
          </thead>
          <tbody>
            {/* Par row */}
            <tr className="border-b border-gray-800">
              <td className="px-2 py-1 text-left text-gray-500">Par</td>
              {visibleHoles.map(h => (
                <td key={h.holeNumber} className={`py-1 text-gray-400 ${
                  h.holeNumber === currentHole ? 'bg-green-900/30' : ''
                }`}>
                  {h.par}
                </td>
              ))}
              <td className="py-1 text-gray-400">{getTotalPar(allHoles)}</td>
              <td className="py-1 text-gray-500">-</td>
            </tr>

            {/* Yardage row */}
            <tr className="border-b border-gray-700">
              <td className="px-2 py-1 text-left text-gray-500">Yds</td>
              {visibleHoles.map(h => (
                <td key={h.holeNumber} className={`py-1 text-gray-500 ${
                  h.holeNumber === currentHole ? 'bg-green-900/30' : ''
                }`}>
                  {h.yardage}
                </td>
              ))}
              <td className="py-1 text-gray-500">{allHoles.reduce((s, h) => s + h.yardage, 0)}</td>
              <td className="py-1">-</td>
            </tr>

            {/* Player rows */}
            {players.map((player) => {
              const total = getTotalScore(player, allHoles);
              return (
                <tr key={player.name} className="border-b border-gray-800 last:border-b-0">
                  <td className="px-2 py-1.5 text-left">
                    <div className="text-gray-200 font-medium truncate max-w-[72px]">{player.name}</div>
                    <div className="text-gray-500 text-[10px]">{player.handicap} hcp</div>
                  </td>
                  {visibleHoles.map(h => {
                    const score = player.scores[h.holeNumber];
                    return (
                      <td
                        key={h.holeNumber}
                        className={`py-1.5 ${h.holeNumber === currentHole ? 'bg-green-900/30' : ''}`}
                      >
                        <span className={`inline-flex items-center justify-center w-7 h-7 text-sm font-medium ${getScoreStyle(score, h.par)}`}>
                          {getScoreLabel(score)}
                        </span>
                      </td>
                    );
                  })}
                  <td className="py-1.5 text-gray-200 font-medium">
                    {total !== null ? total : '-'}
                  </td>
                  <td className={`py-1.5 font-medium ${
                    total !== null && total - getTotalPar(allHoles) < 0 ? 'text-red-400' :
                    total !== null && total - getTotalPar(allHoles) > 0 ? 'text-yellow-400' :
                    'text-gray-400'
                  }`}>
                    {getRelativeDisplay(total, getTotalPar(allHoles))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Landscape: 9 holes, swipeable front/back ---

function LandscapeScorecard({ course, currentHole, players, onHoleTap }: ScorecardProps) {
  const [showingNine, setShowingNine] = useState<'front' | 'back'>(currentHole <= 9 ? 'front' : 'back');
  const touchStartX = useRef(0);

  const nineHoles = useMemo(() => {
    const start = showingNine === 'front' ? 1 : 10;
    const end = showingNine === 'front' ? 9 : 18;
    return course.holes.filter(h => h.holeNumber >= start && h.holeNumber <= end);
  }, [course, showingNine]);

  const has18 = course.holes.length > 9;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!has18) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -50) setShowingNine('back');
    if (dx > 50) setShowingNine('front');
  };

  return (
    <div
      className="w-full bg-gray-900 rounded-xl border border-gray-700 overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header with nine toggle */}
      <div className="bg-gray-800 px-3 py-1.5 flex items-center justify-between">
        <span className="text-xs text-green-400 font-medium truncate">{course.name}</span>
        {has18 && (
          <div className="flex gap-1">
            <button
              onClick={() => setShowingNine('front')}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                showingNine === 'front'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-400'
              }`}
            >
              Front 9
            </button>
            <button
              onClick={() => setShowingNine('back')}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                showingNine === 'back'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-400'
              }`}
            >
              Back 9
            </button>
          </div>
        )}
      </div>

      {/* Landscape table */}
      <div className="overflow-x-auto">
        <table className="w-full text-center text-xs">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="px-2 py-1 text-left text-gray-500 font-normal sticky left-0 bg-gray-900 z-10 w-16">Hole</th>
              {nineHoles.map(h => (
                <th
                  key={h.holeNumber}
                  className={`px-1.5 py-1 font-bold cursor-pointer min-w-[36px] ${
                    h.holeNumber === currentHole
                      ? 'text-green-400 bg-green-900/30'
                      : 'text-gray-300'
                  }`}
                  onClick={() => onHoleTap?.(h.holeNumber)}
                >
                  {h.holeNumber}
                </th>
              ))}
              <th className="px-1.5 py-1 text-gray-400 font-medium min-w-[32px]">Out/In</th>
              <th className="px-1.5 py-1 text-gray-400 font-medium min-w-[32px]">Tot</th>
            </tr>
          </thead>
          <tbody>
            {/* Par row */}
            <tr className="border-b border-gray-800">
              <td className="px-2 py-1 text-left text-gray-500 sticky left-0 bg-gray-900 z-10">Par</td>
              {nineHoles.map(h => (
                <td key={h.holeNumber} className={`py-1 text-gray-400 ${
                  h.holeNumber === currentHole ? 'bg-green-900/30' : ''
                }`}>{h.par}</td>
              ))}
              <td className="py-1 text-gray-400">{getTotalPar(nineHoles)}</td>
              <td className="py-1 text-gray-400">{getTotalPar(course.holes)}</td>
            </tr>

            {/* Player rows */}
            {players.map((player) => {
              const nineTotal = getTotalScore(player, nineHoles);
              const fullTotal = getTotalScore(player, course.holes);
              return (
                <tr key={player.name} className="border-b border-gray-800 last:border-b-0">
                  <td className="px-2 py-1 text-left sticky left-0 bg-gray-900 z-10">
                    <div className="text-gray-200 font-medium text-[11px] truncate max-w-[56px]">{player.name}</div>
                    <div className="text-gray-500 text-[9px]">{player.handicap}</div>
                  </td>
                  {nineHoles.map(h => {
                    const score = player.scores[h.holeNumber];
                    return (
                      <td
                        key={h.holeNumber}
                        className={`py-1 ${h.holeNumber === currentHole ? 'bg-green-900/30' : ''}`}
                      >
                        <span className={`inline-flex items-center justify-center w-6 h-6 text-[11px] font-medium ${getScoreStyle(score, h.par)}`}>
                          {getScoreLabel(score)}
                        </span>
                      </td>
                    );
                  })}
                  <td className="py-1 text-gray-200 font-medium text-[11px]">
                    {nineTotal !== null ? nineTotal : '-'}
                  </td>
                  <td className="py-1 text-gray-200 font-bold text-[11px]">
                    {fullTotal !== null ? fullTotal : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Swipe hint */}
      {has18 && (
        <div className="text-center text-[10px] text-gray-600 py-1">
          ← swipe for {showingNine === 'front' ? 'back' : 'front'} 9 →
        </div>
      )}
    </div>
  );
}

// --- Main Scorecard: switches between portrait and landscape ---

export default function Scorecard(props: ScorecardProps) {
  const orientation = useOrientation();

  return orientation === 'landscape'
    ? <LandscapeScorecard {...props} />
    : <PortraitScorecard {...props} />;
}
