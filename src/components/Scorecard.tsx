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
  /** Called when a player's score for a specific hole is changed via tap-to-edit. */
  onScoreChange?: (playerName: string, holeNumber: number, score: number | null) => void;
  /** Currently selected tee name. If undefined, falls back to course.holes. */
  selectedTeeName?: string;
  /** Called when the user picks a different tee from the selector strip. */
  onSelectTee?: (teeName: string) => void;
}

// --- Tap-to-edit score picker ---
interface ScoreCellProps {
  score: number | undefined;
  par: number;
  onChange?: (score: number | null) => void;
  sizeClass: string;
}

function ScoreCell({ score, par, onChange, sizeClass }: ScoreCellProps) {
  const [open, setOpen] = useState(false);

  if (!onChange) {
    // Read-only rendering
    return (
      <span className={`inline-flex items-center justify-center ${sizeClass} font-medium ${getScoreStyle(score, par)}`}>
        {getScoreLabel(score)}
      </span>
    );
  }

  const pick = (n: number | null) => { onChange(n); setOpen(false); };

  // Options centered around par: par-2 .. par+4, clamped to 1..12
  const options: number[] = [];
  for (let n = Math.max(1, par - 2); n <= par + 4; n++) options.push(n);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className={`inline-flex items-center justify-center ${sizeClass} font-medium rounded hover:ring-2 hover:ring-green-400 transition ${getScoreStyle(score, par)}`}
      >
        {getScoreLabel(score)}
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            aria-label="Close score picker"
            onClick={() => setOpen(false)}
          />
          <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-1 flex gap-0.5">
            {options.map(n => (
              <button
                key={n}
                type="button"
                onClick={(e) => { e.stopPropagation(); pick(n); }}
                className={`w-7 h-7 text-xs rounded font-medium hover:bg-green-100 ${getScoreStyle(n, par)}`}
              >
                {n}
              </button>
            ))}
            {score !== undefined && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); pick(null); }}
                className="w-7 h-7 text-xs rounded font-medium text-gray-400 hover:bg-gray-100"
                title="Clear"
              >
                −
              </button>
            )}
          </div>
        </>
      )}
    </span>
  );
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

// --- Helpers ---

/** Resolve which holes array to display for the chosen tee. Falls back to course.holes. */
function getActiveHoles(course: CourseData, selectedTeeName?: string): HoleData[] {
  if (!selectedTeeName || !course.tees) return course.holes;
  const tee = course.tees.find(t => t.name === selectedTeeName);
  return tee?.holes && tee.holes.length > 0 ? tee.holes : course.holes;
}

/** Resolve the active tee object (for rating/slope/totals display). */
function getActiveTee(course: CourseData, selectedTeeName?: string) {
  if (!selectedTeeName || !course.tees) return null;
  return course.tees.find(t => t.name === selectedTeeName) || null;
}

// --- Course info header ---

function CourseHeader({
  course,
  currentHole,
  totalHoles,
  selectedTeeName,
  onSelectTee,
}: {
  course: CourseData;
  currentHole: number;
  totalHoles: number;
  selectedTeeName?: string;
  onSelectTee?: (name: string) => void;
}) {
  const activeTee = getActiveTee(course, selectedTeeName);
  const rating = activeTee?.courseRating ?? course.courseRating;
  const slope = activeTee?.slopeRating ?? course.slopeRating;

  return (
    <div className="bg-sky-50 px-3 py-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs sm:text-sm text-green-700 font-medium truncate max-w-[60%]">{course.name}</span>
        <span className="text-xs text-gray-500">Hole {currentHole}/{totalHoles}</span>
      </div>
      {(course.tees && course.tees.length > 0) && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-gray-400 mr-1">Tee:</span>
          {course.tees.map(tee => {
            const isActive = tee.name === selectedTeeName;
            return (
              <button
                key={tee.name}
                onClick={() => onSelectTee?.(tee.name)}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  isActive
                    ? 'bg-green-600 text-white border-green-700'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-green-500'
                }`}
                title={tee.totalYards ? `${tee.totalYards} yds${tee.courseRating ? ` · R ${tee.courseRating}` : ''}${tee.slopeRating ? ` / S ${tee.slopeRating}` : ''}` : undefined}
              >
                {tee.name}{tee.totalYards ? ` · ${tee.totalYards}` : ''}
              </button>
            );
          })}
        </div>
      )}
      {(rating || slope) && (
        <div className="flex gap-3">
          {rating && <span className="text-[10px] text-gray-500">Rating: {rating}</span>}
          {slope && <span className="text-[10px] text-gray-500">Slope: {slope}</span>}
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

function PortraitScorecard({ course, currentHole, players, onHoleTap, onScoreChange, selectedTeeName, onSelectTee }: ScorecardProps) {
  const allHoles = useMemo(() => getActiveHoles(course, selectedTeeName), [course, selectedTeeName]);

  const visibleHoles = useMemo(() => {
    const holes: HoleData[] = [];
    for (let i = Math.max(1, currentHole - 2); i <= Math.min(currentHole, allHoles.length); i++) {
      const h = allHoles.find(h => h.holeNumber === i);
      if (h) holes.push(h);
    }
    // If we're on hole 1 or 2, pad so we always show up to 3 holes
    if (holes.length < 3 && currentHole < allHoles.length) {
      for (let i = currentHole + 1; holes.length < 3 && i <= allHoles.length; i++) {
        const h = allHoles.find(h => h.holeNumber === i);
        if (h) holes.push(h);
      }
    }
    return holes;
  }, [allHoles, currentHole]);

  if (visibleHoles.length === 0) {
    return <NoHoleData course={course} currentHole={currentHole} />;
  }

  const totalPar = sumPar(allHoles);

  return (
    <div className="w-full bg-white rounded-xl border border-gray-200 overflow-hidden">
      <CourseHeader
        course={course}
        currentHole={currentHole}
        totalHoles={allHoles.length}
        selectedTeeName={selectedTeeName}
        onSelectTee={onSelectTee}
      />

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
                        <ScoreCell
                          score={score}
                          par={h.par}
                          sizeClass="w-7 h-7 text-sm"
                          onChange={onScoreChange ? (n) => onScoreChange(player.name, h.holeNumber, n) : undefined}
                        />
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

function LandscapeScorecard({ course, currentHole, players, onHoleTap, onScoreChange, selectedTeeName, onSelectTee }: ScorecardProps) {
  const [showingNine, setShowingNine] = useState<'front' | 'back'>(currentHole <= 9 ? 'front' : 'back');
  const touchStartX = useRef(0);

  const allHoles = useMemo(() => getActiveHoles(course, selectedTeeName), [course, selectedTeeName]);

  const nineHoles = useMemo(() => {
    const start = showingNine === 'front' ? 1 : 10;
    const end = showingNine === 'front' ? 9 : 18;
    return allHoles.filter(h => h.holeNumber >= start && h.holeNumber <= end);
  }, [allHoles, showingNine]);

  if (allHoles.length === 0) {
    return <NoHoleData course={course} currentHole={currentHole} />;
  }

  const has18 = allHoles.length > 9;
  const activeTee = getActiveTee(course, selectedTeeName);
  const rating = activeTee?.courseRating ?? course.courseRating;
  const slope = activeTee?.slopeRating ?? course.slopeRating;

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
      <div className="bg-sky-50 px-3 py-1.5 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-green-700 font-medium truncate">{course.name}</span>
            {(rating || slope) && (
              <span className="text-[10px] text-gray-500">
                {rating && `R: ${rating}`}
                {rating && slope && ' / '}
                {slope && `S: ${slope}`}
              </span>
            )}
          </div>
          {course.tees && course.tees.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 mt-0.5">
              {course.tees.map(tee => (
                <button
                  key={tee.name}
                  onClick={() => onSelectTee?.(tee.name)}
                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                    tee.name === selectedTeeName
                      ? 'bg-green-600 text-white border-green-700'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-green-500'
                  }`}
                >
                  {tee.name}{tee.totalYards ? ` · ${tee.totalYards}` : ''}
                </button>
              ))}
            </div>
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
                        <ScoreCell
                          score={score}
                          par={h.par}
                          sizeClass="w-6 h-6 text-[11px]"
                          onChange={onScoreChange ? (n) => onScoreChange(player.name, h.holeNumber, n) : undefined}
                        />
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
