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

function getScoreStyle(score: number | undefined, par: number): string {
  if (score === undefined) return '';
  const diff = score - par;
  if (diff <= -2) return 'score-eagle';
  if (diff === -1) return 'score-birdie';
  if (diff === 0) return 'score-par';
  if (diff === 1) return 'score-bogey';
  return 'score-double';
}

function getScoreLabel(score: number | undefined): string {
  return score !== undefined ? score.toString() : '-';
}

function sumScores(player: PlayerScore, holes: HoleData[]): number | null {
  let total = 0;
  let any = false;
  for (const h of holes) {
    const s = player.scores[h.holeNumber];
    if (s !== undefined) { total += s; any = true; }
  }
  return any ? total : null;
}

function sumPar(holes: HoleData[]): number {
  return holes.reduce((s, h) => s + h.par, 0);
}

function relativeDisplay(total: number | null, par: number): string {
  if (total === null) return '-';
  const d = total - par;
  return d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`;
}

// --- Course info header ---

function CourseHeader({ course, currentHole, totalHoles }: { course: CourseData; currentHole: number; totalHoles: number }) {
  return (
    <div className="bg-sky-50 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs sm:text-sm text-green-700 font-medium truncate max-w-[60%]">{course.name}</span>
        <span className="text-xs text-gray-500">Hole {currentHole}/{totalHoles}</span>
      </div>
      {(course.courseRating || course.slopeRating) && (
        <div className="flex gap-3 mt-0.5">
          {course.courseRating && (
            <span className="text-[10px] text-gray-500">Rating: {course.courseRating}</span>
          )}
          {course.slopeRating && (
            <span className="text-[10px] text-gray-500">Slope: {course.slopeRating}</span>
          )}
        </div>
      )}
    </div>
  );
}

// --- No data fallback ---

function NoHoleData({ course, currentHole }: { course: CourseData; currentHole: number }) {
  return (
    <div className="w-full bg-white rounded-xl border border-gray-200 overflow-hidden">
      <CourseHeader course={course} currentHole={currentHole} totalHoles={course.holes.length || 18} />
      <div className="px-4 py-6 text-center">
        <p className="text-gray-500 text-sm">No hole data available for this course.</p>
        <p className="text-gray-500 text-xs mt-1">Try a more well-known course — the API has better data for major courses.</p>
      </div>
    </div>
  );
}

// --- Portrait: 3 holes (prev 2 + current) ---

function PortraitScorecard({ course, currentHole, players, onHoleTap }: ScorecardProps) {
  const visibleHoles = useMemo(() => {
    const holes: HoleData[] = [];
    for (let i = Math.max(1, currentHole - 2); i <= Math.min(currentHole, course.holes.length); i++) {
      const h = course.holes.find(h => h.holeNumber === i);
      if (h) holes.push(h);
    }
    // If we're on hole 1 or 2, pad so we always show up to 3 holes
    if (holes.length < 3 && currentHole < course.holes.length) {
      for (let i = currentHole + 1; holes.length < 3 && i <= course.holes.length; i++) {
        const h = course.holes.find(h => h.holeNumber === i);
        if (h) holes.push(h);
      }
    }
    return holes;
  }, [course, currentHole]);

  if (visibleHoles.length === 0) {
    return <NoHoleData course={course} currentHole={currentHole} />;
  }

  const allHoles = course.holes;
  const totalPar = sumPar(allHoles);

  return (
    <div className="w-full bg-white rounded-xl border border-gray-200 overflow-hidden">
      <CourseHeader course={course} currentHole={currentHole} totalHoles={allHoles.length} />

      <div className="overflow-x-auto">
        <table className="w-full text-center text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-2 py-1.5 text-left text-gray-500 font-normal w-20">Hole</th>
              {visibleHoles.map(h => (
                <th
                  key={h.holeNumber}
                  className={`px-3 py-1.5 font-bold cursor-pointer min-w-[52px] ${
                    h.holeNumber === currentHole
                      ? 'text-green-700 bg-green-50'
                      : 'text-gray-700'
                  }`}
                  onClick={() => onHoleTap?.(h.holeNumber)}
                >
                  {h.holeNumber}
                </th>
              ))}
              <th className="px-2 py-1.5 text-gray-500 font-medium min-w-[42px]">Tot</th>
              <th className="px-2 py-1.5 text-gray-500 font-medium min-w-[42px]">+/-</th>
            </tr>
          </thead>
          <tbody>
            {/* Par row */}
            <tr className="border-b border-gray-100">
              <td className="px-2 py-1 text-left text-gray-500">Par</td>
              {visibleHoles.map(h => (
                <td key={h.holeNumber} className={`py-1 text-gray-500 font-medium ${
                  h.holeNumber === currentHole ? 'bg-green-50' : ''
                }`}>{h.par}</td>
              ))}
              <td className="py-1 text-gray-500">{totalPar}</td>
              <td className="py-1">-</td>
            </tr>

            {/* Yardage row */}
            <tr className="border-b border-gray-100">
              <td className="px-2 py-1 text-left text-gray-500">Yds</td>
              {visibleHoles.map(h => (
                <td key={h.holeNumber} className={`py-1 text-gray-500 ${
                  h.holeNumber === currentHole ? 'bg-green-50' : ''
                }`}>{h.yardage}</td>
              ))}
              <td className="py-1 text-gray-500">{allHoles.reduce((s, h) => s + h.yardage, 0)}</td>
              <td className="py-1">-</td>
            </tr>

            {/* Handicap / Stroke Index row */}
            <tr className="border-b border-gray-200">
              <td className="px-2 py-1 text-left text-gray-500">SI</td>
              {visibleHoles.map(h => (
                <td key={h.holeNumber} className={`py-1 text-gray-400 ${
                  h.holeNumber === currentHole ? 'bg-green-50' : ''
                }`}>{h.strokeIndex || '-'}</td>
              ))}
              <td className="py-1">-</td>
              <td className="py-1">-</td>
            </tr>

            {/* Player rows */}
            {players.map((player) => {
              const total = sumScores(player, allHoles);
              return (
                <tr key={player.name} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-2 py-1.5 text-left">
                    <div className="text-gray-800 font-medium truncate max-w-[72px]">{player.name}</div>
                    <div className="text-gray-500 text-[10px]">{player.handicap} hcp</div>
                  </td>
                  {visibleHoles.map(h => {
                    const score = player.scores[h.holeNumber];
                    return (
                      <td key={h.holeNumber} className={`py-1.5 ${h.holeNumber === currentHole ? 'bg-green-50' : ''}`}>
                        <span className={`inline-flex items-center justify-center w-7 h-7 text-sm font-medium ${getScoreStyle(score, h.par)}`}>
                          {getScoreLabel(score)}
                        </span>
                      </td>
                    );
                  })}
                  <td className="py-1.5 text-gray-800 font-medium">
                    {total !== null ? total : '-'}
                  </td>
                  <td className={`py-1.5 font-medium ${
                    total !== null && total - totalPar < 0 ? 'text-red-600' :
                    total !== null && total - totalPar > 0 ? 'text-amber-600' :
                    'text-gray-500'
                  }`}>
                    {relativeDisplay(total, totalPar)}
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

  if (course.holes.length === 0) {
    return <NoHoleData course={course} currentHole={currentHole} />;
  }

  const has18 = course.holes.length > 9;
  const allHoles = course.holes;

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!has18) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -50) setShowingNine('back');
    if (dx > 50) setShowingNine('front');
  };

  return (
    <div
      className="w-full bg-white rounded-xl border border-gray-200 overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="bg-sky-50 px-3 py-1.5 flex items-center justify-between">
        <div>
          <span className="text-xs text-green-700 font-medium truncate">{course.name}</span>
          {(course.courseRating || course.slopeRating) && (
            <span className="text-[10px] text-gray-500 ml-2">
              {course.courseRating && `R: ${course.courseRating}`}
              {course.courseRating && course.slopeRating && ' / '}
              {course.slopeRating && `S: ${course.slopeRating}`}
            </span>
          )}
        </div>
        {has18 && (
          <div className="flex gap-1">
            <button
              onClick={() => setShowingNine('front')}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                showingNine === 'front' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >OUT</button>
            <button
              onClick={() => setShowingNine('back')}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                showingNine === 'back' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >IN</button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-center text-[11px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-1.5 py-1 text-left text-gray-500 font-normal sticky left-0 bg-white z-10 w-14">Hole</th>
              {nineHoles.map(h => (
                <th
                  key={h.holeNumber}
                  className={`px-1 py-1 font-bold cursor-pointer min-w-[32px] ${
                    h.holeNumber === currentHole ? 'text-green-700 bg-green-50' : 'text-gray-700'
                  }`}
                  onClick={() => onHoleTap?.(h.holeNumber)}
                >{h.holeNumber}</th>
              ))}
              <th className="px-1 py-1 text-gray-500 font-medium min-w-[30px]">{showingNine === 'front' ? 'Out' : 'In'}</th>
              <th className="px-1 py-1 text-gray-500 font-medium min-w-[30px]">Tot</th>
              <th className="px-1 py-1 text-gray-500 font-medium min-w-[28px]">+/-</th>
            </tr>
          </thead>
          <tbody>
            {/* Par */}
            <tr className="border-b border-gray-100">
              <td className="px-1.5 py-0.5 text-left text-gray-500 sticky left-0 bg-white z-10">Par</td>
              {nineHoles.map(h => (
                <td key={h.holeNumber} className={`py-0.5 text-gray-500 ${h.holeNumber === currentHole ? 'bg-green-50' : ''}`}>{h.par}</td>
              ))}
              <td className="py-0.5 text-gray-500 font-medium">{sumPar(nineHoles)}</td>
              <td className="py-0.5 text-gray-500">{sumPar(allHoles)}</td>
              <td className="py-0.5">-</td>
            </tr>

            {/* Yardage */}
            <tr className="border-b border-gray-100">
              <td className="px-1.5 py-0.5 text-left text-gray-500 sticky left-0 bg-white z-10">Yds</td>
              {nineHoles.map(h => (
                <td key={h.holeNumber} className={`py-0.5 text-gray-400 ${h.holeNumber === currentHole ? 'bg-green-50' : ''}`}>{h.yardage}</td>
              ))}
              <td className="py-0.5 text-gray-500">{nineHoles.reduce((s, h) => s + h.yardage, 0)}</td>
              <td className="py-0.5 text-gray-500">{allHoles.reduce((s, h) => s + h.yardage, 0)}</td>
              <td className="py-0.5">-</td>
            </tr>

            {/* Stroke Index */}
            <tr className="border-b border-gray-200">
              <td className="px-1.5 py-0.5 text-left text-gray-400 sticky left-0 bg-white z-10">SI</td>
              {nineHoles.map(h => (
                <td key={h.holeNumber} className={`py-0.5 text-gray-400 ${h.holeNumber === currentHole ? 'bg-green-50' : ''}`}>{h.strokeIndex || '-'}</td>
              ))}
              <td className="py-0.5">-</td>
              <td className="py-0.5">-</td>
              <td className="py-0.5">-</td>
            </tr>

            {/* Player rows */}
            {players.map((player) => {
              const nineTotal = sumScores(player, nineHoles);
              const fullTotal = sumScores(player, allHoles);
              const fullPar = sumPar(allHoles);
              return (
                <tr key={player.name} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-1.5 py-1 text-left sticky left-0 bg-white z-10">
                    <div className="text-gray-800 font-medium text-[10px] truncate max-w-[48px]">{player.name}</div>
                    <div className="text-gray-500 text-[9px]">{player.handicap}</div>
                  </td>
                  {nineHoles.map(h => {
                    const score = player.scores[h.holeNumber];
                    return (
                      <td key={h.holeNumber} className={`py-0.5 ${h.holeNumber === currentHole ? 'bg-green-50' : ''}`}>
                        <span className={`inline-flex items-center justify-center w-6 h-6 text-[11px] font-medium ${getScoreStyle(score, h.par)}`}>
                          {getScoreLabel(score)}
                        </span>
                      </td>
                    );
                  })}
                  <td className="py-0.5 text-gray-800 font-medium">{nineTotal ?? '-'}</td>
                  <td className="py-0.5 text-gray-800 font-bold">{fullTotal ?? '-'}</td>
                  <td className={`py-0.5 font-medium ${
                    fullTotal !== null && fullTotal - fullPar < 0 ? 'text-red-600' :
                    fullTotal !== null && fullTotal - fullPar > 0 ? 'text-amber-600' :
                    'text-gray-500'
                  }`}>
                    {relativeDisplay(fullTotal, fullPar)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {has18 && (
        <div className="text-center text-[10px] text-gray-400 py-0.5">
          ← swipe for {showingNine === 'front' ? 'back' : 'front'} 9 →
        </div>
      )}
    </div>
  );
}

// --- Main export ---

export default function Scorecard(props: ScorecardProps) {
  const orientation = useOrientation();
  return orientation === 'landscape'
    ? <LandscapeScorecard {...props} />
    : <PortraitScorecard {...props} />;
}
