'use client';

import { useState, useRef, useEffect } from 'react';
import { CaddiePersonality, CourseData, HoleData } from '@/lib/types';
import { DEMO_PROFILE, PERSONALITY_OPTIONS, SUGGESTED_PROMPTS, UI_MESSAGES, API_SETTINGS } from '@/lib/config';

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

        // Auto-announce to the caddie
        const holeName = data.course.holes?.[0];
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Loaded ${data.course.name}${data.course.city ? ` in ${data.course.city}${data.course.state ? ', ' + data.course.state : ''}` : ''}. ${data.course.holes?.length || 0} holes ready. You're on hole 1 — par ${holeName?.par || 4}, ${holeName?.yardage || '???'} yards. What do you need?`,
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: UI_MESSAGES.courseLoadError,
      }]);
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
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    const holeData = getCurrentHoleData();

    try {
      const response = await fetch('/api/caddie/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          profile: DEMO_PROFILE,
          mode,
          personality,
          conversationHistory: messages.slice(-10),
          currentHole: holeData,
          round: selectedCourse ? {
            courseData: selectedCourse,
            currentHole,
            teeBox: 'white',
            scores: [],
            shotNumber: 1,
            lie: 'tee',
          } : null,
        }),
      });

      const data = await response.json();

      if (data.error) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: UI_MESSAGES.connectionError,
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.message,
        }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Connection error. Make sure the dev server is running (npm run dev).',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const holeData = getCurrentHoleData();

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-green-400">mAI Caddy</h1>
            <p className="text-sm text-gray-400">Your AI golf caddie</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Course Button */}
            <button
              onClick={() => setShowCoursePanel(!showCoursePanel)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCourse
                  ? 'bg-green-800 text-green-200 border border-green-600'
                  : 'bg-gray-800 text-gray-300 border border-gray-700 hover:border-green-600'
              }`}
            >
              {selectedCourse ? `⛳ ${selectedCourse.name.substring(0, 20)}` : `⛳ ${UI_MESSAGES.selectCourse}`}
            </button>

            {/* Personality Picker */}
            <select
              value={personality}
              onChange={(e) => setPersonality(e.target.value as CaddiePersonality)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-green-500"
            >
              {PERSONALITY_OPTIONS.map(p => (
                <option key={p.value} value={p.value}>
                  {p.emoji} {p.label}
                </option>
              ))}
            </select>

            {/* Mode Toggle */}
            <button
              onClick={() => setMode(m => m === 'chat' ? 'voice' : 'chat')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'voice'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-300 border border-gray-700'
              }`}
            >
              {mode === 'voice' ? '🎤 Voice' : '💬 Chat'}
            </button>
          </div>
        </div>

        {/* Course Panel */}
        {showCoursePanel && (
          <div className="max-w-3xl mx-auto mt-3 bg-gray-900 rounded-xl border border-gray-700 p-4">
            <div className="flex items-center gap-3 mb-3">
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

            {/* Search Results */}
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

            {/* Hole Selector (when course is loaded) */}
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
                        setMessages(prev => [...prev, {
                          role: 'assistant',
                          content: `Hole ${hole.holeNumber} — par ${hole.par}, ${hole.yardage} yards.${hole.strokeIndex ? ` Stroke index ${hole.strokeIndex}.` : ''} What do you need?`,
                        }]);
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
                    setMessages(prev => [...prev, {
                      role: 'assistant',
                      content: `Hole ${h.holeNumber} — par ${h.par}, ${h.yardage} yards. Let's go.`,
                    }]);
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
                    setMessages(prev => [...prev, {
                      role: 'assistant',
                      content: `Hole ${h.holeNumber} — par ${h.par}, ${h.yardage} yards. What do you need?`,
                    }]);
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
      <main className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">⛳</div>
              <h2 className="text-xl font-semibold text-gray-300 mb-2">
                {UI_MESSAGES.welcomeTitle}
              </h2>
              <p className="text-gray-500 mb-4">
                {UI_MESSAGES.welcomeSubtitle}
              </p>
              <p className="text-gray-600 text-sm mb-8">
                {UI_MESSAGES.welcomeHint}
              </p>
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

      {/* Input */}
      <footer className="border-t border-gray-800 px-6 py-4">
        <form onSubmit={sendMessage} className="max-w-3xl mx-auto flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              selectedCourse
                ? `Ask about hole ${currentHole} at ${selectedCourse.name}...`
                : mode === 'voice'
                  ? "Ask your caddie (voice mode: short answers)..."
                  : "Ask your caddie anything..."
            }
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-3 rounded-xl font-medium transition-colors"
          >
            Send
          </button>
        </form>
        <p className="text-center text-xs text-gray-600 mt-2">
          Playing as {DEMO_PROFILE.name} · {DEMO_PROFILE.handicap} handicap
          {selectedCourse && ` · ${selectedCourse.name} · Hole ${currentHole}`}
          {' · '}{personality.replace('_', ' ')}
        </p>
      </footer>
    </div>
  );
}
