'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { CourseData, HoleData } from '@/lib/types';
import { DEMO_PROFILE, SUGGESTED_PROMPTS, UI_MESSAGES, API_SETTINGS } from '@/lib/config';
import { useVoice } from '@/lib/hooks/use-voice';
import Scorecard, { PlayerScore } from '@/components/Scorecard';
import BetSetup from '@/components/BetSetup';
import BetStatus from '@/components/BetStatus';
import BetSettlement from '@/components/BetSettlement';
import { BetConfig } from '@/lib/betting/types';
import {
  detectStrokeEvents,
  isAffirmative,
  isNegative,
  extractCorrectionNumber,
} from '@/lib/caddie/stroke-counter';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface CourseSearchResult {
  id: string;
  name: string;
  city?: string;
  state?: string;
}

// --- Round persistence via localStorage ---

const ROUND_STORAGE_KEY = 'mai-caddy-round';

interface PendingScore {
  hole: number;
  strokes: number;
  /** Who the pending score is for — normally the primary golfer */
  playerName: string;
}

interface SavedRound {
  course: CourseData;
  currentHole: number;
  players: PlayerScore[];
  messages: Message[];
  bets: BetConfig[];
  startedAt: string; // ISO timestamp
  /** Per-hole running stroke tally derived from the conversation */
  holeStrokes?: Record<number, number>;
  /** Pending "X, right?" confirmation, if any */
  pendingScore?: PendingScore | null;
}

function saveRound(round: SavedRound) {
  try {
    localStorage.setItem(ROUND_STORAGE_KEY, JSON.stringify(round));
  } catch { /* storage full or unavailable — fail silently */ }
}

function loadRound(): SavedRound | null {
  try {
    const raw = localStorage.getItem(ROUND_STORAGE_KEY);
    if (!raw) return null;
    const round: SavedRound = JSON.parse(raw);
    // Sanity check: must have a course with an id
    if (!round.course?.id) return null;
    return round;
  } catch {
    return null;
  }
}

function clearSavedRound() {
  try {
    localStorage.removeItem(ROUND_STORAGE_KEY);
  } catch { /* fail silently */ }
}

// Words like "a 5" → 5. Also accept spelled-out numbers ("five" → 5).
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

// Golf score terms relative to par
const GOLF_TERMS: Record<string, number> = {
  // par-relative offsets: value is strokes relative to par
  ace: -999, // handled as 1 specifically
  'hole in one': -999,
  'hole-in-one': -999,
  eagle: -2,
  birdie: -1,
  par: 0,
  bogey: 1,
  'double bogey': 2,
  'double-bogey': 2,
  'triple bogey': 3,
  'triple-bogey': 3,
};

function wordToNumber(raw: string): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (!isNaN(n)) return n;
  const w = NUMBER_WORDS[raw.toLowerCase()];
  return w ?? null;
}

/**
 * Parse a score command. Defaults:
 * - If no explicit hole number is mentioned, assume currentHole.
 * - If no player name is mentioned, assume the first player (primary golfer).
 * - Accepts golf terms like "par", "bogey", "birdie" (resolved using par for that hole).
 *
 * Examples that now work:
 *   "I got a 5"           → primary, current hole, 5
 *   "bogey"               → primary, current hole, par + 1
 *   "birdie on 3"         → primary, hole 3, par(3) - 1
 *   "Dave 6"              → Dave, current hole, 6
 *   "hole 5 Mike 4"       → Mike, hole 5, 4
 */
function parseScoreCommand(
  text: string,
  ctx: { currentHole: number; holePar: number | undefined; primaryName: string; knownNames: string[] }
): { name: string; hole: number; score: number } | null {
  const lower = text.toLowerCase().trim();

  // --- 1. Explicit patterns with name + hole + score ---

  // "[name] hole [n] scored/got/made [a] [n]"
  const p1 = lower.match(/(\w+)\s+hole\s+(\d+)\s+(?:scored|got|made|shot)\s+(?:a\s+)?(\d+)/);
  if (p1) return { name: p1[1], hole: parseInt(p1[2]), score: parseInt(p1[3]) };

  // "[name] got/scored/made [a] [n] on hole [n]"
  const p2 = lower.match(/(\w+)\s+(?:got|scored|made|shot)\s+(?:a\s+)?(\d+)\s+on\s+hole\s+(\d+)/);
  if (p2) return { name: p2[1], hole: parseInt(p2[3]), score: parseInt(p2[2]) };

  // "hole [n] [name] [n]"
  const p3 = lower.match(/hole\s+(\d+)\s+(\w+)\s+(\d+)/);
  if (p3) return { name: p3[2], hole: parseInt(p3[1]), score: parseInt(p3[3]) };

  // --- 2. Resolve a hole reference (explicit "hole N" or "on N") ---

  let hole = ctx.currentHole;
  const holeMatch = lower.match(/(?:on\s+)?hole\s+(\d+)/) || lower.match(/\bon\s+(\d{1,2})\b/);
  if (holeMatch) hole = parseInt(holeMatch[1]);

  // --- 3. Resolve a name (must be a known player; otherwise default to primary) ---

  let name = ctx.primaryName;
  const knownLower = ctx.knownNames.map(n => n.toLowerCase());
  const words = lower.split(/\s+/);
  const hitName = words.find(w => knownLower.includes(w));
  if (hitName) name = hitName;

  // "[name] X" where name is known (e.g., "dave 6")
  // Handled by the hitName branch above.

  // --- 4. Resolve a score ---

  // Golf term (ace, eagle, birdie, par, bogey, double/triple bogey)
  if (ctx.holePar !== undefined) {
    // Two-word terms first
    for (const term of ['hole in one', 'hole-in-one', 'double bogey', 'double-bogey', 'triple bogey', 'triple-bogey']) {
      if (lower.includes(term)) {
        if (term.startsWith('hole')) return { name, hole, score: 1 };
        return { name, hole, score: ctx.holePar + GOLF_TERMS[term] };
      }
    }
    // Single-word terms — require whole-word match to avoid matching "apart" containing "par"
    const singleTerms = ['ace', 'eagle', 'birdie', 'par', 'bogey'];
    const tokens = lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
    for (const term of singleTerms) {
      if (tokens.includes(term)) {
        if (term === 'ace') return { name, hole, score: 1 };
        return { name, hole, score: ctx.holePar + GOLF_TERMS[term] };
      }
    }
  }

  // Spoken verbs: "got a 5", "made 4", "shot a six"
  const verbMatch = lower.match(/(?:got|scored|made|shot|took|had)\s+(?:a\s+|an\s+)?(\w+)/);
  if (verbMatch) {
    const n = wordToNumber(verbMatch[1]);
    if (n !== null && n >= 1 && n <= 20) return { name, hole, score: n };
  }

  // Just "[name] [digit]" style (e.g., "dave 6") — only if name is a known player
  if (hitName) {
    const after = lower.split(hitName)[1] || '';
    const numMatch = after.match(/\b(\d{1,2})\b/);
    if (numMatch) {
      const n = parseInt(numMatch[1]);
      if (n >= 1 && n <= 20) return { name, hole, score: n };
    }
  }

  // Bare single number as the whole utterance ("5", "six")
  const bare = lower.match(/^(\w+)$/);
  if (bare) {
    const n = wordToNumber(bare[1]);
    if (n !== null && n >= 1 && n <= 20) return { name, hole, score: n };
  }

  return null;
}

// --- Round Summary Component ---

function RoundSummary({ course, players, bets, onNewRound }: {
  course: CourseData;
  players: PlayerScore[];
  bets: BetConfig[];
  onNewRound: () => void;
}) {
  const totalPar = course.holes.reduce((s, h) => s + h.par, 0);

  return (
    <div className="h-screen bg-white text-gray-900 flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 shadow-lg p-6">
        <h2 className="text-2xl font-bold text-green-700 text-center mb-1">Round Complete</h2>
        <p className="text-gray-500 text-center text-sm mb-6">{course.name}</p>

        <div className="space-y-4 mb-6">
          {players.map(player => {
            const holesPlayed = Object.keys(player.scores).length;
            const totalStrokes = Object.values(player.scores).reduce((s, v) => s + v, 0);
            const scoredHoles = course.holes.filter(h => player.scores[h.holeNumber] !== undefined);
            const scoredPar = scoredHoles.reduce((s, h) => s + h.par, 0);
            const diff = totalStrokes - scoredPar;
            const diffStr = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`;

            return (
              <div key={player.name} className="flex items-center justify-between border-b border-gray-200 pb-3 last:border-b-0">
                <div>
                  <div className="text-gray-800 font-medium">{player.name}</div>
                  <div className="text-gray-500 text-xs">{player.handicap} hcp · {holesPlayed} holes scored</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900">{holesPlayed > 0 ? totalStrokes : '-'}</div>
                  <div className={`text-sm font-medium ${
                    diff < 0 ? 'text-red-600' : diff > 0 ? 'text-amber-600' : 'text-gray-500'
                  }`}>
                    {holesPlayed > 0 ? diffStr : '-'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center text-xs text-gray-400 mb-4">
          Course par: {totalPar} · {course.holes.length} holes
          {course.courseRating && ` · Rating: ${course.courseRating}`}
          {course.slopeRating && ` / Slope: ${course.slopeRating}`}
        </div>

        {/* Bet Settlement */}
        {bets.length > 0 && (
          <div className="mb-4">
            <BetSettlement bets={bets} players={players} holes={course.holes} />
          </div>
        )}

        <button
          onClick={onNewRound}
          className="w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-medium transition-colors"
        >
          New Round
        </button>
      </div>
    </div>
  );
}

// --- Main App ---

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const personality = 'pro_jock' as const;
  const [mode, setMode] = useState<'chat' | 'voice'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Course state
  const [courseSearch, setCourseSearch] = useState('');
  const [courseResults, setCourseResults] = useState<CourseSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseData | null>(null);
  const [currentHole, setCurrentHole] = useState(1);
  const [showCoursePanel, setShowCoursePanel] = useState(false);

  // Scorecard state
  const [players, setPlayers] = useState<PlayerScore[]>([
    { name: DEMO_PROFILE.name, handicap: DEMO_PROFILE.handicap ?? 15, scores: {} },
  ]);
  const [showScorecard, setShowScorecard] = useState(false);
  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);

  // Stroke counter state
  const [holeStrokes, setHoleStrokes] = useState<Record<number, number>>({});
  const [pendingScore, setPendingScore] = useState<PendingScore | null>(null);
  const holeStrokesRef = useRef(holeStrokes);
  const pendingScoreRef = useRef(pendingScore);
  useEffect(() => { holeStrokesRef.current = holeStrokes; }, [holeStrokes]);
  useEffect(() => { pendingScoreRef.current = pendingScore; }, [pendingScore]);

  // Bet state
  const [bets, setBets] = useState<BetConfig[]>([]);
  const [showBetSetup, setShowBetSetup] = useState(false);

  // Round state
  const [roundStartedAt, setRoundStartedAt] = useState<string | null>(null);
  const [showRoundSummary, setShowRoundSummary] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // --- Restore round from localStorage on mount ---
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const saved = loadRound();
    if (saved) {
      setSelectedCourse(saved.course);
      setCurrentHole(saved.currentHole);
      setPlayers(saved.players);
      setMessages(saved.messages);
      setBets(saved.bets || []);
      setRoundStartedAt(saved.startedAt);
      setShowScorecard(true);
      setHoleStrokes(saved.holeStrokes || {});
      setPendingScore(saved.pendingScore ?? null);
    }
  }, []);

  // --- Auto-save round state on changes ---
  useEffect(() => {
    if (!selectedCourse || !roundStartedAt) return;
    saveRound({
      course: selectedCourse,
      currentHole,
      players,
      messages: messages.slice(-50),
      bets,
      startedAt: roundStartedAt,
      holeStrokes,
      pendingScore,
    });
  }, [selectedCourse, currentHole, players, messages, bets, roundStartedAt, holeStrokes, pendingScore]);

  /**
   * Commit a score for a player at a hole and clear any running stroke
   * tally + pending confirmation for that hole.
   */
  const commitScore = useCallback((playerName: string, hole: number, score: number) => {
    setPlayers(prev => prev.map(p => {
      if (p.name !== playerName) return p;
      return { ...p, scores: { ...p.scores, [hole]: score } };
    }));
    setHoleStrokes(prev => {
      const next = { ...prev };
      delete next[hole];
      return next;
    });
    setPendingScore(prev => (prev && prev.hole === hole ? null : prev));
  }, []);

  /**
   * Run stroke detection on the user's message. Updates holeStrokes and,
   * if the hole looks complete (or user reported a score), sets up a
   * pendingScore with a "X, right?" assistant message so the user can
   * confirm before we write to the scorecard.
   *
   * Returns true if the message was consumed (affirmation / correction
   * of a pending score) and the assistant should NOT call the API for it.
   */
  const processStrokeSignals = useCallback((text: string): { handled: boolean; confirmationMsg?: string } => {
    const hole = currentHoleRef.current;
    const primary = playersRef.current[0]?.name ?? DEMO_PROFILE.name;
    const pending = pendingScoreRef.current;

    // --- 1. If there's a pending "X, right?" prompt, check this reply ---
    if (pending && pending.hole === hole) {
      // Explicit number in reply → use that
      const correction = extractCorrectionNumber(text);
      if (correction !== null) {
        commitScore(pending.playerName, pending.hole, correction);
        return {
          handled: true,
          confirmationMsg: `Got it — ${correction} on hole ${pending.hole}. On to the next.`,
        };
      }
      // Plain affirmation → commit the pending count
      if (isAffirmative(text)) {
        commitScore(pending.playerName, pending.hole, pending.strokes);
        return {
          handled: true,
          confirmationMsg: `${pending.strokes} locked in.`,
        };
      }
      // Plain negation → keep pending and ask
      if (isNegative(text)) {
        setPendingScore(null);
        return {
          handled: true,
          confirmationMsg: `My bad — what did you make?`,
        };
      }
      // Otherwise fall through: the user moved on without confirming.
    }

    // --- 2. Detect stroke signals from the utterance ---
    const ev = detectStrokeEvents(text);
    if (ev.shots === 0 && ev.penalties === 0 && !ev.holeComplete && ev.reportedScore === null) {
      return { handled: false };
    }

    // If user reported a final score explicitly ("I made a 5"), confirm it
    if (ev.reportedScore !== null) {
      setPendingScore({ hole, strokes: ev.reportedScore, playerName: primary });
      return { handled: false, confirmationMsg: `${ev.reportedScore}, right?` };
    }

    // Increment the running tally
    const prior = holeStrokesRef.current[hole] || 0;
    const newTotal = prior + ev.shots + ev.penalties;
    setHoleStrokes(prev => ({ ...prev, [hole]: newTotal }));

    // If this utterance also signals hole completion, ask "X, right?"
    if (ev.holeComplete) {
      setPendingScore({ hole, strokes: newTotal, playerName: primary });
      return { handled: false, confirmationMsg: `${newTotal}, right?` };
    }

    return { handled: false };
  }, [commitScore]);

  // Try to parse score commands from user messages before sending to API
  const tryParseScore = useCallback((text: string): boolean => {
    const course = selectedCourseRef.current;
    const hole = currentHoleRef.current;
    const holePar = course?.holes.find(h => h.holeNumber === hole)?.par;
    const current = playersRef.current;
    const primary = current[0]?.name ?? DEMO_PROFILE.name;
    const known = current.map(p => p.name);

    const parsed = parseScoreCommand(text, {
      currentHole: hole,
      holePar,
      primaryName: primary,
      knownNames: known,
    });
    if (!parsed) return false;
    if (parsed.score < 1 || parsed.score > 20) return false;

    setPlayers(prev => {
      const updated = [...prev];
      let playerIdx = updated.findIndex(p =>
        p.name.toLowerCase().startsWith(parsed.name.toLowerCase())
      );
      if (playerIdx === -1) {
        const capitalized = parsed.name.charAt(0).toUpperCase() + parsed.name.slice(1);
        updated.push({ name: capitalized, handicap: 15, scores: {} });
        playerIdx = updated.length - 1;
      }
      updated[playerIdx] = {
        ...updated[playerIdx],
        scores: { ...updated[playerIdx].scores, [parsed.hole]: parsed.score },
      };
      return updated;
    });
    return true;
  }, []);

  // Refs to access latest state in voice callbacks
  const messagesRef = useRef<Message[]>([]);
  const modeRef = useRef(mode);
  const personalityRef = useRef(personality);
  const selectedCourseRef = useRef(selectedCourse);
  const currentHoleRef = useRef(currentHole);
  const isLoadingRef = useRef(false);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { selectedCourseRef.current = selectedCourse; }, [selectedCourse]);
  useEffect(() => { currentHoleRef.current = currentHole; }, [currentHole]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  // Core send logic (shared by text and voice)
  const sendToAPI = useCallback(async (userMessage: string) => {
    if (!userMessage.trim() || isLoadingRef.current) return;

    const trimmed = userMessage.trim();

    // Stroke detection + pending-score confirmation runs BEFORE we hit the
    // caddy API. If the message is just a yes/no to an outstanding "X,
    // right?" prompt, we short-circuit and reply locally.
    const strokeResult = processStrokeSignals(trimmed);

    // Parallel: keep the existing explicit score-command parser so
    // "Dave 6" / "birdie on 3" still work for multi-player groups.
    tryParseScore(trimmed);

    if (strokeResult.handled) {
      setMessages(prev => [
        ...prev,
        { role: 'user', content: trimmed },
        { role: 'assistant', content: strokeResult.confirmationMsg || 'Got it.' },
      ]);
      if (modeRef.current === 'voice' && strokeResult.confirmationMsg) {
        // caller may also call speak() via its return value
      }
      return strokeResult.confirmationMsg;
    }

    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setIsLoading(true);

    const course = selectedCourseRef.current;
    const hole = currentHoleRef.current;
    const holeData = course?.holes.find(h => h.holeNumber === hole) || null;

    try {
      const response = await fetch('/api/caddie/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          profile: DEMO_PROFILE,
          mode: modeRef.current,
          personality: personalityRef.current,
          conversationHistory: messagesRef.current.slice(-10),
          currentHole: holeData,
          round: course ? {
            courseData: course,
            currentHole: hole,
            teeBox: 'white',
            scores: [],
            shotNumber: (holeStrokesRef.current[hole] || 0) + 1,
            lie: 'tee',
          } : null,
        }),
      });

      const data = await response.json();
      let reply = data.error ? UI_MESSAGES.connectionError : data.message;

      // If stroke detection produced a confirmation message ("5, right?"),
      // append it so the caddy's response + the confirm ask flow together.
      if (strokeResult.confirmationMsg) {
        reply = `${reply}\n\n${strokeResult.confirmationMsg}`;
      }

      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      return reply;
    } catch {
      const errMsg = 'Connection error. Check your signal and try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg }]);
      return errMsg;
    } finally {
      setIsLoading(false);
    }
  }, [processStrokeSignals]);

  // Ref to hold speak function
  const speakRef = useRef<((text: string) => Promise<void>) | undefined>(undefined);

  const handleTranscript = useCallback(async (text: string) => {
    if (modeRef.current !== 'voice') return;
    const reply = await sendToAPI(text);
    if (reply && speakRef.current) {
      speakRef.current(reply);
    }
  }, [sendToAPI]);

  // Hands-free (wake-word) mode. Persisted across reloads.
  const [handsFree, setHandsFree] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mai-caddy-hands-free');
      if (saved === '1') setHandsFree(true);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('mai-caddy-hands-free', handsFree ? '1' : '0'); } catch { /* ignore */ }
    if (handsFree) setMode('voice');
  }, [handsFree]);

  const voice = useVoice({
    onTranscript: handleTranscript,
    handsFree,
  });

  useEffect(() => {
    speakRef.current = voice.speak;
  }, [voice.speak]);

  // iOS Safari TTS warmup
  const ttsWarmedUp = useRef(false);
  const warmUpTTS = useCallback(() => {
    if (ttsWarmedUp.current) return;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const silent = new SpeechSynthesisUtterance('');
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
      ttsWarmedUp.current = true;
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Debounced course search
  useEffect(() => {
    if (courseSearch.length < API_SETTINGS.courseSearchMinLength) {
      setCourseResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/course/search?q=${encodeURIComponent(courseSearch)}`);
        const data = await res.json();
        setCourseResults(data.courses || []);
      } catch {
        setCourseResults([]);
      } finally {
        setIsSearching(false);
      }
    }, API_SETTINGS.courseSearchDebounceMs);
    return () => clearTimeout(timer);
  }, [courseSearch]);

  const selectCourse = async (courseId: string) => {
    try {
      const res = await fetch(`/api/course/${courseId}`);
      const data = await res.json();
      if (data.course) {
        setSelectedCourse(data.course);
        setCurrentHole(1);
        setCourseSearch('');
        setCourseResults([]);
        setShowCoursePanel(false);
        setShowScorecard(true);
        setRoundStartedAt(new Date().toISOString());

        const holeName = data.course.holes?.[0];
        const announcement = `Loaded ${data.course.name}${data.course.city ? ` in ${data.course.city}${data.course.state ? ', ' + data.course.state : ''}` : ''}. ${data.course.holes?.length || 0} holes ready. You're on hole 1 — par ${holeName?.par || 4}, ${holeName?.yardage || '???'} yards. What do you need?`;
        setMessages(prev => [...prev, { role: 'assistant', content: announcement }]);

        if (mode === 'voice') {
          voice.speak(announcement);
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: UI_MESSAGES.courseLoadError }]);
    }
  };

  const getCurrentHoleData = (): HoleData | null => {
    if (!selectedCourse) return null;
    return selectedCourse.holes.find(h => h.holeNumber === currentHole) || null;
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setInput('');

    const reply = await sendToAPI(userMessage);
    if (mode === 'voice' && reply) {
      voice.speak(reply);
    }
  };

  // --- End Round ---
  const endRound = () => {
    setShowEndConfirm(false);
    setShowRoundSummary(true);
    clearSavedRound();
    voice.stopListening();
    voice.stopSpeaking();
  };

  const startNewRound = () => {
    setShowRoundSummary(false);
    setSelectedCourse(null);
    setCurrentHole(1);
    setPlayers([{ name: DEMO_PROFILE.name, handicap: DEMO_PROFILE.handicap ?? 15, scores: {} }]);
    setMessages([]);
    setBets([]);
    setRoundStartedAt(null);
    setShowScorecard(false);
    setShowCoursePanel(false);
    setHoleStrokes({});
    setPendingScore(null);
    setMode('chat');
    clearSavedRound();
  };

  const toggleMode = () => {
    if (mode === 'chat') {
      setMode('voice');
      warmUpTTS();
      setTimeout(() => voice.startListening(), 300);
    } else {
      setMode('chat');
      voice.stopListening();
      voice.stopSpeaking();
    }
  };

  const holeData = getCurrentHoleData();

  const getVoiceStatusText = () => {
    if (handsFree) {
      if (voice.wakeArmed) return 'Listening... go ahead';
      if (voice.isListening) return 'Say "Caddy ..." to ask';
      if (voice.isSpeaking) return 'Caddy is speaking...';
      return 'Hands-free armed';
    }
    switch (voice.status) {
      case 'listening': return 'Listening...';
      case 'speaking': return 'Caddy is speaking...';
      case 'error': return voice.error || 'Voice error';
      default: return 'Tap mic to talk';
    }
  };

  // --- Round Summary screen ---
  if (showRoundSummary && selectedCourse) {
    return (
      <RoundSummary
        course={selectedCourse}
        players={players}
        bets={bets}
        onNewRound={startNewRound}
      />
    );
  }

  return (
    <div className="h-screen bg-white text-gray-900 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
        <div className="max-w-3xl mx-auto">
          {/* Top row: logo + mode toggle */}
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl sm:text-2xl font-bold text-green-700">mAI Caddy</h1>
            <div className="flex items-center gap-2">
              {/* End Round button — only during active round */}
              {selectedCourse && (
                <button
                  onClick={() => setShowEndConfirm(true)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white text-red-600 border border-gray-300 hover:border-red-500 transition-colors"
                >
                  End Round
                </button>
              )}
              <button
                onClick={toggleMode}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'voice'
                    ? 'bg-green-600 text-white ring-2 ring-green-400 ring-opacity-50'
                    : 'bg-gray-100 text-gray-600 border border-gray-300'
                }`}
              >
                {mode === 'voice' ? '🎤 Voice' : '💬 Chat'}
              </button>
            </div>
          </div>

          {/* Controls row: course + scorecard */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowCoursePanel(!showCoursePanel)}
              className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                selectedCourse
                  ? 'bg-green-100 text-green-800 border border-green-400'
                  : 'bg-gray-100 text-gray-600 border border-gray-300 hover:border-green-500'
              }`}
            >
              {selectedCourse ? `⛳ ${selectedCourse.name.substring(0, 15)}` : `⛳ ${UI_MESSAGES.selectCourse}`}
            </button>

            {selectedCourse && (
              <button
                onClick={() => setShowScorecard(!showScorecard)}
                className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  showScorecard
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-600 border border-gray-300'
                }`}
              >
                📋 Card
              </button>
            )}

            {/* Bet Button */}
            {selectedCourse && (
              <button
                onClick={() => setShowBetSetup(true)}
                className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  bets.length > 0
                    ? 'bg-amber-100 text-amber-800 border border-amber-400'
                    : 'bg-gray-100 text-gray-600 border border-gray-300 hover:border-amber-500'
                }`}
              >
                {bets.length > 0 ? `🎰 ${bets.length} Bet${bets.length > 1 ? 's' : ''}` : '🎰 Add Bet'}
              </button>
            )}

            {/* Bet Explainer Link */}
            <a
              href="/bets"
              target="_blank"
              className="px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-gray-100 text-gray-400 border border-gray-300 hover:text-green-600 hover:border-green-500 transition-colors"
            >
              ?
            </a>
          </div>
        </div>

        {/* Course Panel */}
        {showCoursePanel && (
          <div className="max-w-3xl mx-auto mt-2 bg-sky-50 rounded-xl border border-sky-200 p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                placeholder="Search for a golf course..."
                className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500"
                autoFocus
              />
              {isSearching && (
                <div className="text-xs text-gray-400">Searching...</div>
              )}
            </div>

            {courseResults.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto mb-3">
                {courseResults.slice(0, API_SETTINGS.courseSearchMaxResults).map(course => (
                  <button
                    key={course.id}
                    onClick={() => selectCourse(course.id)}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-sky-100 transition-colors"
                  >
                    <span className="text-gray-800">{course.name}</span>
                    {(course.city || course.state) && (
                      <span className="text-gray-400 ml-2">
                        {[course.city, course.state].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {selectedCourse && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">
                    {selectedCourse.name}
                    {selectedCourse.courseRating && ` · Rating: ${selectedCourse.courseRating}`}
                    {selectedCourse.slopeRating && ` / Slope: ${selectedCourse.slopeRating}`}
                  </span>
                  <button
                    onClick={() => { setSelectedCourse(null); setCourseSearch(''); setRoundStartedAt(null); clearSavedRound(); }}
                    className="text-xs text-gray-400 hover:text-gray-700"
                  >
                    Change course
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedCourse.holes.map(hole => (
                    <button
                      key={hole.holeNumber}
                      onClick={() => {
                        setCurrentHole(hole.holeNumber);
                        setShowCoursePanel(false);
                        const msg = `Hole ${hole.holeNumber} — par ${hole.par}, ${hole.yardage} yards.${hole.strokeIndex ? ` Stroke index ${hole.strokeIndex}.` : ''} What do you need?`;
                        setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
                        if (mode === 'voice') voice.speak(msg);
                      }}
                      className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                        hole.holeNumber === currentHole
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-sky-100'
                      }`}
                    >
                      {hole.holeNumber}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Active Hole Bar */}
        {selectedCourse && holeData && !showCoursePanel && (
          <div className="max-w-3xl mx-auto mt-2 space-y-1.5">
            <div className="flex items-center gap-4 text-sm">
              <button
                onClick={() => {
                  if (currentHole > 1) {
                    const newHole = currentHole - 1;
                    setCurrentHole(newHole);
                    const h = selectedCourse.holes.find(h => h.holeNumber === newHole);
                    if (h) {
                      const msg = `Hole ${h.holeNumber} — par ${h.par}, ${h.yardage} yards. Let's go.`;
                      setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
                      if (mode === 'voice') voice.speak(msg);
                    }
                  }
                }}
                disabled={currentHole <= 1}
                className="text-gray-400 hover:text-green-600 disabled:opacity-30"
              >
                ‹ Prev
              </button>
              <div className="flex items-center gap-3 text-gray-600">
                <span className="text-green-700 font-bold">Hole {currentHole}</span>
                <span>Par {holeData.par}</span>
                <span>{holeData.yardage} yds</span>
                {holeData.strokeIndex && (
                  <span className="text-gray-500">SI {holeData.strokeIndex}</span>
                )}
                {(holeStrokes[currentHole] || 0) > 0 && !pendingScore && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    ● {holeStrokes[currentHole]} shot{holeStrokes[currentHole] === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  // If there's an active stroke count for this hole and no
                  // pending confirmation yet, turn it into "X, right?" instead
                  // of silently advancing — that's the auto-count UX.
                  const running = holeStrokes[currentHole] || 0;
                  const primary = players[0]?.name ?? DEMO_PROFILE.name;
                  const alreadyScored = players[0]?.scores[currentHole] !== undefined;
                  if (running > 0 && !pendingScore && !alreadyScored) {
                    setPendingScore({ hole: currentHole, strokes: running, playerName: primary });
                    const ask = `${running}, right?`;
                    setMessages(prev => [...prev, { role: 'assistant', content: ask }]);
                    if (mode === 'voice') voice.speak(ask);
                    return;
                  }
                  if (currentHole < selectedCourse.holes.length) {
                    const newHole = currentHole + 1;
                    setCurrentHole(newHole);
                    const h = selectedCourse.holes.find(h => h.holeNumber === newHole);
                    if (h) {
                      const msg = `Hole ${h.holeNumber} — par ${h.par}, ${h.yardage} yards. What do you need?`;
                      setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
                      if (mode === 'voice') voice.speak(msg);
                    }
                  }
                }}
                disabled={currentHole >= selectedCourse.holes.length && !pendingScore}
                className="text-gray-400 hover:text-green-600 disabled:opacity-30"
              >
                Next ›
              </button>
            </div>

            {/* Pending "X, right?" confirmation strip */}
            {pendingScore && pendingScore.hole === currentHole && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-sm">
                <span className="text-gray-700">
                  Hole {pendingScore.hole}: <span className="font-bold text-green-700">{pendingScore.strokes}</span>, right?
                </span>
                <button
                  onClick={() => {
                    commitScore(pendingScore.playerName, pendingScore.hole, pendingScore.strokes);
                    const ack = `${pendingScore.strokes} locked in.`;
                    setMessages(prev => [...prev, { role: 'assistant', content: ack }]);
                    if (mode === 'voice') voice.speak(ack);
                  }}
                  className="ml-auto px-2.5 py-0.5 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-500"
                >
                  Yes
                </button>
                <button
                  onClick={() => {
                    setPendingScore(null);
                    setShowScorecard(true);
                    const msg = `Tap the ${pendingScore.playerName} cell for hole ${pendingScore.hole} to fix it.`;
                    setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
                  }}
                  className="px-2.5 py-0.5 rounded-md bg-white text-gray-600 border border-gray-300 text-xs font-medium hover:bg-gray-50"
                >
                  Fix
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* End Round Confirmation Modal */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-800 mb-2">End Round?</h3>
            <p className="text-gray-500 text-sm mb-6">
              This will finalize your scores and show your round summary.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl font-medium border border-gray-300 hover:bg-gray-200 transition-colors"
              >
                Keep Playing
              </button>
              <button
                onClick={endRound}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-xl font-medium transition-colors"
              >
                End Round
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bet Setup Modal */}
      {showBetSetup && (
        <BetSetup
          players={players}
          onConfirm={(bet) => {
            setBets(prev => [...prev, bet]);
            setShowBetSetup(false);
            const msg = `${bet.type === 'nassau' ? 'Nassau' : bet.type === 'skins' ? 'Skins' : bet.type.replace('_', ' ')} — $${bet.amount}. Game on.`;
            setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
          }}
          onCancel={() => setShowBetSetup(false)}
        />
      )}

      {/* Scorecard */}
      {showScorecard && selectedCourse && (
        <div className="shrink-0 px-4 py-2 sm:px-6">
          <div className="max-w-3xl mx-auto">
            <Scorecard
              course={selectedCourse}
              currentHole={currentHole}
              players={players}
              onHoleTap={(hole) => {
                setCurrentHole(hole);
                const h = selectedCourse.holes.find(h => h.holeNumber === hole);
                if (h) {
                  const msg = `Hole ${h.holeNumber} — par ${h.par}, ${h.yardage} yards.`;
                  setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
                }
              }}
              onScoreChange={(playerName, holeNumber, score) => {
                setPlayers(prev => prev.map(p => {
                  if (p.name !== playerName) return p;
                  const scores = { ...p.scores };
                  if (score === null) delete scores[holeNumber];
                  else scores[holeNumber] = score;
                  return { ...p, scores };
                }));
              }}
            />
          </div>
        </div>
      )}

      {/* Bet Status — during active round */}
      {bets.length > 0 && selectedCourse && (
        <div className="shrink-0 px-4 py-2 sm:px-6">
          <div className="max-w-3xl mx-auto space-y-2">
            {bets.map((bet, idx) => (
              <BetStatus
                key={idx}
                bet={bet}
                players={players}
                holes={selectedCourse.holes}
                currentHole={currentHole}
                onRemoveBet={() => setBets(prev => prev.filter((_, i) => i !== idx))}
              />
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <main className="flex-1 min-h-0 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
        <div className="max-w-3xl mx-auto space-y-3 sm:space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12 sm:py-20">
              <div className="text-5xl sm:text-6xl mb-3">⛳</div>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">
                {UI_MESSAGES.welcomeTitle}
              </h2>
              <p className="text-gray-500 mb-4">
                {UI_MESSAGES.welcomeSubtitle}
              </p>
              <p className="text-gray-400 text-sm mb-8">
                {UI_MESSAGES.welcomeHint}
              </p>

              {voice.isSupported && (
                <p className="text-green-600 text-sm mb-6">
                  🎤 Voice mode available — tap the Voice button to talk to your caddy
                </p>
              )}

              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_PROMPTS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-full text-sm text-gray-600 hover:bg-sky-50 hover:border-green-500 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-green-600 text-white'
                    : 'bg-sky-50 text-gray-800 border border-sky-100'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="text-xs text-green-700 font-medium mb-1">
                    mAI Caddy
                  </div>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>
            </div>
          ))}

          {voice.interimTranscript && (
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-green-100 text-green-800">
                <p className="text-sm leading-relaxed italic">
                  {voice.interimTranscript}...
                </p>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-sky-50 border border-sky-100 rounded-2xl px-4 py-3">
                <div className="text-xs text-green-700 font-medium mb-1">mAI Caddy</div>
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input */}
      <footer className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4 safe-bottom">
        {mode === 'voice' ? (
          <div className="max-w-3xl mx-auto flex flex-col items-center gap-2">
            {/* Hands-free toggle */}
            <button
              type="button"
              onClick={() => {
                warmUpTTS();
                setHandsFree(v => !v);
              }}
              className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                handsFree
                  ? 'bg-green-50 text-green-700 border-green-300'
                  : 'bg-gray-50 text-gray-500 border-gray-300 hover:border-green-400'
              }`}
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${handsFree ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              {handsFree ? 'Hands-free ON · say "Caddy..."' : 'Hands-free OFF'}
            </button>

            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  warmUpTTS();
                  if (voice.isSpeaking) {
                    voice.stopSpeaking();
                  } else if (voice.isListening && !handsFree) {
                    voice.stopListening();
                  } else if (!isLoading && !handsFree) {
                    voice.startListening();
                  }
                }}
                disabled={isLoading || handsFree}
                title={handsFree ? 'Hands-free mode active — say "Caddy..." to talk' : ''}
                className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-2xl sm:text-3xl transition-all duration-200 ${
                  handsFree
                    ? 'bg-green-100 text-green-700 border-2 border-green-300 cursor-default'
                    : voice.isListening
                      ? 'bg-red-500 hover:bg-red-400 scale-110 animate-pulse'
                      : voice.isSpeaking
                        ? 'bg-green-500 hover:bg-green-400 scale-105'
                        : isLoading
                          ? 'bg-gray-300 text-gray-500'
                          : 'bg-green-600 hover:bg-green-500 hover:scale-105'
                }`}
              >
                {handsFree ? '👂' : voice.isListening ? '🔴' : voice.isSpeaking ? '🔊' : isLoading ? '⏳' : '🎤'}
              </button>

              <p className={`text-sm ${
                voice.isListening ? 'text-red-500' :
                voice.isSpeaking ? 'text-green-600' :
                voice.error ? 'text-amber-600' :
                'text-gray-500'
              }`}>
                {isLoading ? 'Caddy is thinking...' : getVoiceStatusText()}
              </p>
            </div>

            {voice.error && (
              <p className="text-xs text-amber-600 text-center max-w-xs">
                {voice.error}
              </p>
            )}

            <form onSubmit={sendMessage} className="w-full flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Or type here..."
                className="flex-1 bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 transition-colors"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-green-600 hover:bg-green-500 disabled:bg-gray-200 disabled:text-gray-400 text-white px-3 py-2 rounded-xl text-sm font-medium transition-colors"
              >
                Send
              </button>
            </form>
          </div>
        ) : (
          <form onSubmit={sendMessage} className="max-w-3xl mx-auto flex gap-2 sm:gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                selectedCourse
                  ? `Ask about hole ${currentHole}...`
                  : "Ask your caddie anything..."
              }
              className="flex-1 bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 transition-colors"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-green-600 hover:bg-green-500 disabled:bg-gray-200 disabled:text-gray-400 text-white px-4 py-2.5 sm:px-6 sm:py-3 rounded-xl font-medium text-sm transition-colors"
            >
              Send
            </button>
          </form>
        )}
        <p className="text-center text-xs text-gray-400 mt-1.5">
          {DEMO_PROFILE.name} · {DEMO_PROFILE.handicap} hcp
          {selectedCourse && ` · Hole ${currentHole}`}
          {' · Pro Jock'}
        </p>
      </footer>
    </div>
  );
}
