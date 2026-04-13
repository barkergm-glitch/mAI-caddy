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

interface SavedRound {
  course: CourseData;
  currentHole: number;
  players: PlayerScore[];
  messages: Message[];
  bets: BetConfig[];
  startedAt: string; // ISO timestamp
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

// Parse voice score commands like "Dave hole 5 scored a 6" or "Mike got a 4 on hole 3"
function parseScoreCommand(text: string): { name: string; hole: number; score: number } | null {
  const lower = text.toLowerCase();

  // Pattern: "[name] hole [n] scored/got/made [a] [n]"
  const p1 = lower.match(/(\w+)\s+hole\s+(\d+)\s+(?:scored|got|made|shot)\s+(?:a\s+)?(\d+)/);
  if (p1) return { name: p1[1], hole: parseInt(p1[2]), score: parseInt(p1[3]) };

  // Pattern: "[name] got/scored/made [a] [n] on hole [n]"
  const p2 = lower.match(/(\w+)\s+(?:got|scored|made|shot)\s+(?:a\s+)?(\d+)\s+on\s+hole\s+(\d+)/);
  if (p2) return { name: p2[1], hole: parseInt(p2[3]), score: parseInt(p2[2]) };

  // Pattern: "hole [n] [name] [n]" (shorthand)
  const p3 = lower.match(/hole\s+(\d+)\s+(\w+)\s+(\d+)/);
  if (p3) return { name: p3[2], hole: parseInt(p3[1]), score: parseInt(p3[3]) };

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
    });
  }, [selectedCourse, currentHole, players, messages, bets, roundStartedAt]);

  // Try to parse score commands from user messages before sending to API
  const tryParseScore = useCallback((text: string): boolean => {
    const parsed = parseScoreCommand(text);
    if (!parsed) return false;

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

    tryParseScore(userMessage);

    const trimmed = userMessage.trim();
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
            shotNumber: 1,
            lie: 'tee',
          } : null,
        }),
      });

      const data = await response.json();
      const reply = data.error ? UI_MESSAGES.connectionError : data.message;

      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      return reply;
    } catch {
      const errMsg = 'Connection error. Check your signal and try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg }]);
      return errMsg;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Ref to hold speak function
  const speakRef = useRef<((text: string) => Promise<void>) | undefined>(undefined);

  const handleTranscript = useCallback(async (text: string) => {
    if (modeRef.current !== 'voice') return;
    const reply = await sendToAPI(text);
    if (reply && speakRef.current) {
      speakRef.current(reply);
    }
  }, [sendToAPI]);

  const voice = useVoice({
    onTranscript: handleTranscript,
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
          <div className="max-w-3xl mx-auto mt-2 flex items-center gap-4 text-sm">
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
            </div>
            <button
              onClick={() => {
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
              disabled={currentHole >= selectedCourse.holes.length}
              className="text-gray-400 hover:text-green-600 disabled:opacity-30"
            >
              Next ›
            </button>
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
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  warmUpTTS();
                  if (voice.isSpeaking) {
                    voice.stopSpeaking();
                  } else if (voice.isListening) {
                    voice.stopListening();
                  } else if (!isLoading) {
                    voice.startListening();
                  }
                }}
                disabled={isLoading}
                className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-2xl sm:text-3xl transition-all duration-200 ${
                  voice.isListening
                    ? 'bg-red-500 hover:bg-red-400 scale-110 animate-pulse'
                    : voice.isSpeaking
                      ? 'bg-green-500 hover:bg-green-400 scale-105'
                      : isLoading
                        ? 'bg-gray-300 text-gray-500'
                        : 'bg-green-600 hover:bg-green-500 hover:scale-105'
                }`}
              >
                {voice.isListening ? '🔴' : voice.isSpeaking ? '🔊' : isLoading ? '⏳' : '🎤'}
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
