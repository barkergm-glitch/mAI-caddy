'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { CaddiePersonality, CourseData, HoleData } from '@/lib/types';
import { DEMO_PROFILE, PERSONALITY_OPTIONS, SUGGESTED_PROMPTS, UI_MESSAGES, API_SETTINGS } from '@/lib/config';
import { useVoice } from '@/lib/hooks/use-voice';

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

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [personality, setPersonality] = useState<CaddiePersonality>('zen_guru');
  const [mode, setMode] = useState<'chat' | 'voice'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Course state
  const [courseSearch, setCourseSearch] = useState('');
  const [courseResults, setCourseResults] = useState<CourseSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseData | null>(null);
  const [currentHole, setCurrentHole] = useState(1);
  const [showCoursePanel, setShowCoursePanel] = useState(false);

  // Refs to access latest state in voice callbacks
  const messagesRef = useRef<Message[]>([]);
  const modeRef = useRef(mode);
  const personalityRef = useRef(personality);
  const selectedCourseRef = useRef(selectedCourse);
  const currentHoleRef = useRef(currentHole);
  const isLoadingRef = useRef(false);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { personalityRef.current = personality; }, [personality]);
  useEffect(() => { selectedCourseRef.current = selectedCourse; }, [selectedCourse]);
  useEffect(() => { currentHoleRef.current = currentHole; }, [currentHole]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  // Core send logic (shared by text and voice)
  const sendToAPI = useCallback(async (userMessage: string) => {
    if (!userMessage.trim() || isLoadingRef.current) return;

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

  // Ref to hold speak function — breaks circular dependency between handleTranscript and voice hook
  const speakRef = useRef<((text: string) => Promise<void>) | undefined>(undefined);

  // Voice hook — auto-sends transcript and speaks the response
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

  // Keep speak ref in sync
  useEffect(() => {
    speakRef.current = voice.speak;
  }, [voice.speak]);

  // iOS Safari requires a user-gesture-triggered utterance to "warm up" speechSynthesis.
  // Fire a silent utterance on the first mic tap so subsequent speak() calls work reliably.
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
    // In voice mode, also speak the response when sent via text
    if (mode === 'voice' && reply) {
      voice.speak(reply);
    }
  };

  // Switch to voice mode and auto-start listening
  const toggleMode = () => {
    if (mode === 'chat') {
      setMode('voice');
      warmUpTTS(); // Ensure iOS Safari TTS is unlocked on this user gesture
      setTimeout(() => voice.startListening(), 300);
    } else {
      setMode('chat');
      voice.stopListening();
      voice.stopSpeaking();
    }
  };

  const holeData = getCurrentHoleData();

  // Voice status indicator text
  const getVoiceStatusText = () => {
    switch (voice.status) {
      case 'listening': return 'Listening...';
      case 'speaking': return 'Caddy is speaking...';
      case 'error': return voice.error || 'Voice error';
      default: return 'Tap mic to talk';
    }
  };

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-800 px-4 py-3 sm:px-6 sm:py-4">
        <div className="max-w-3xl mx-auto">
          {/* Top row: logo + mode toggle */}
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl sm:text-2xl font-bold text-green-400">mAI Caddy</h1>
            <button
              onClick={toggleMode}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === 'voice'
                  ? 'bg-green-600 text-white ring-2 ring-green-400 ring-opacity-50'
                  : 'bg-gray-800 text-gray-300 border border-gray-700'
              }`}
            >
              {mode === 'voice' ? '🎤 Voice' : '💬 Chat'}
            </button>
          </div>

          {/* Controls row: course + personality — wraps on mobile */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Course Button */}
            <button
              onClick={() => setShowCoursePanel(!showCoursePanel)}
              className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                selectedCourse
                  ? 'bg-green-800 text-green-200 border border-green-600'
                  : 'bg-gray-800 text-gray-300 border border-gray-700 hover:border-green-600'
              }`}
            >
              {selectedCourse ? `⛳ ${selectedCourse.name.substring(0, 15)}` : `⛳ ${UI_MESSAGES.selectCourse}`}
            </button>

            {/* Personality Picker */}
            <select
              value={personality}
              onChange={(e) => setPersonality(e.target.value as CaddiePersonality)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs sm:text-sm text-gray-200 focus:outline-none focus:border-green-500"
            >
              {PERSONALITY_OPTIONS.map(p => (
                <option key={p.value} value={p.value}>
                  {p.emoji} {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Course Panel */}
        {showCoursePanel && (
          <div className="max-w-3xl mx-auto mt-2 bg-gray-900 rounded-xl border border-gray-700 p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                placeholder="Search for a golf course..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
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
                    className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-800 transition-colors"
                  >
                    <span className="text-gray-200">{course.name}</span>
                    {(course.city || course.state) && (
                      <span className="text-gray-500 ml-2">
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
                  <span className="text-sm text-gray-400">
                    {selectedCourse.name}
                    {selectedCourse.courseRating && ` · Rating: ${selectedCourse.courseRating}`}
                    {selectedCourse.slopeRating && ` / Slope: ${selectedCourse.slopeRating}`}
                  </span>
                  <button
                    onClick={() => { setSelectedCourse(null); setCourseSearch(''); }}
                    className="text-xs text-gray-500 hover:text-gray-300"
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
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
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
              className="text-gray-500 hover:text-green-400 disabled:opacity-30"
            >
              ‹ Prev
            </button>
            <div className="flex items-center gap-3 text-gray-300">
              <span className="text-green-400 font-bold">Hole {currentHole}</span>
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
              className="text-gray-500 hover:text-green-400 disabled:opacity-30"
            >
              Next ›
            </button>
          </div>
        )}
      </header>

      {/* Messages */}
      <main className="flex-1 min-h-0 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
        <div className="max-w-3xl mx-auto space-y-3 sm:space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12 sm:py-20">
              <div className="text-5xl sm:text-6xl mb-3">⛳</div>
              <h2 className="text-xl font-semibold text-gray-300 mb-2">
                {UI_MESSAGES.welcomeTitle}
              </h2>
              <p className="text-gray-500 mb-4">
                {UI_MESSAGES.welcomeSubtitle}
              </p>
              <p className="text-gray-600 text-sm mb-8">
                {UI_MESSAGES.welcomeHint}
              </p>

              {/* Voice support notice */}
              {voice.isSupported && (
                <p className="text-green-500 text-sm mb-6">
                  🎤 Voice mode available — tap the Voice button to talk to your caddy
                </p>
              )}

              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_PROMPTS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-full text-sm text-gray-300 hover:bg-gray-700 hover:border-green-600 transition-colors"
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
                    : 'bg-gray-800 text-gray-100'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="text-xs text-green-400 font-medium mb-1">
                    mAI Caddy
                  </div>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>
            </div>
          ))}

          {/* Show interim transcript while listening */}
          {voice.interimTranscript && (
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-green-600 bg-opacity-50 text-white">
                <p className="text-sm leading-relaxed italic">
                  {voice.interimTranscript}...
                </p>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-800 rounded-2xl px-4 py-3">
                <div className="text-xs text-green-400 font-medium mb-1">mAI Caddy</div>
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

      {/* Input — changes based on mode */}
      <footer className="shrink-0 border-t border-gray-800 px-4 py-3 sm:px-6 sm:py-4 safe-bottom">
        {mode === 'voice' ? (
          /* Voice Mode Input */
          <div className="max-w-3xl mx-auto flex flex-col items-center gap-2">
            {/* Mic button + status in a row */}
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
                        ? 'bg-gray-700 text-gray-500'
                        : 'bg-green-600 hover:bg-green-500 hover:scale-105'
                }`}
              >
                {voice.isListening ? '🔴' : voice.isSpeaking ? '🔊' : isLoading ? '⏳' : '🎤'}
              </button>

              <p className={`text-sm ${
                voice.isListening ? 'text-red-400' :
                voice.isSpeaking ? 'text-green-400' :
                voice.error ? 'text-yellow-400' :
                'text-gray-500'
              }`}>
                {isLoading ? 'Caddy is thinking...' : getVoiceStatusText()}
              </p>
            </div>

            {/* Error display */}
            {voice.error && (
              <p className="text-xs text-yellow-400 text-center max-w-xs">
                {voice.error}
              </p>
            )}

            {/* Fallback text input in voice mode */}
            <form onSubmit={sendMessage} className="w-full flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Or type here..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500 transition-colors"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-3 py-2 rounded-xl text-sm font-medium transition-colors"
              >
                Send
              </button>
            </form>
          </div>
        ) : (
          /* Chat Mode Input */
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
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2.5 sm:px-6 sm:py-3 rounded-xl font-medium text-sm transition-colors"
            >
              Send
            </button>
          </form>
        )}
        <p className="text-center text-xs text-gray-600 mt-1.5">
          {DEMO_PROFILE.name} · {DEMO_PROFILE.handicap} hcp
          {selectedCourse && ` · Hole ${currentHole}`}
          {' · '}{personality.replace('_', ' ')}
        </p>
      </footer>
    </div>
  );
}
