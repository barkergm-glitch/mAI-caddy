'use client';

import { useState, useRef, useEffect } from 'react';
import { GolferProfile, CaddiePersonality, ClubInBag } from '@/lib/types';

// --- Demo golfer profile for testing ---
const DEMO_PROFILE: GolferProfile = {
  name: 'Mike',
  handicap: 15,
  age: 58,
  gender: 'male',
  shotShape: 'fade',
  missTendency: 'right',
  driverDistance: 230,
  strengths: 'Solid short game, good course management',
  weaknesses: 'Inconsistent driver, tendency to overthink',
  mentalNotes: 'Plays best when relaxed and not grinding on mechanics',
  playingStyle: 'Smart, strategic player who prefers safe plays over hero shots',
  clubs: [
    { clubType: 'driver', avgDistance: 230, maxDistance: 255, confidence: 'medium', notes: 'Tends to fade, occasional slice under pressure' },
    { clubType: '3w', avgDistance: 210, maxDistance: 230, confidence: 'medium' },
    { clubType: '5w', avgDistance: 195, maxDistance: 210, confidence: 'high' },
    { clubType: '4h', avgDistance: 180, maxDistance: 195, confidence: 'high' },
    { clubType: '5i', avgDistance: 165, maxDistance: 180, confidence: 'medium' },
    { clubType: '6i', avgDistance: 155, maxDistance: 168, confidence: 'high' },
    { clubType: '7i', avgDistance: 145, maxDistance: 158, confidence: 'high' },
    { clubType: '8i', avgDistance: 135, maxDistance: 148, confidence: 'high' },
    { clubType: '9i', avgDistance: 125, maxDistance: 138, confidence: 'high' },
    { clubType: 'pw', avgDistance: 115, maxDistance: 128, confidence: 'high' },
    { clubType: 'gw', avgDistance: 100, maxDistance: 115, confidence: 'high' },
    { clubType: 'sw', avgDistance: 85, maxDistance: 100, confidence: 'high' },
    { clubType: 'lw', avgDistance: 65, maxDistance: 80, confidence: 'medium' },
    { clubType: 'putter', avgDistance: 0, maxDistance: 0, confidence: 'high' },
  ] as ClubInBag[],
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const PERSONALITY_OPTIONS: { value: CaddiePersonality; label: string; emoji: string }[] = [
  { value: 'zen_guru', label: 'Zen Guru', emoji: '🧘' },
  { value: 'old_sage', label: 'Old Sage', emoji: '🎩' },
  { value: 'tough_love', label: 'Tough Love', emoji: '💪' },
  { value: 'comforting_friend', label: 'Comforting Friend', emoji: '🤗' },
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [personality, setPersonality] = useState<CaddiePersonality>('zen_guru');
  const [mode, setMode] = useState<'chat' | 'voice'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

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
        }),
      });

      const data = await response.json();

      if (data.error) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Having trouble connecting. Check your API key in .env.local and restart the dev server.',
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

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-green-400">mAI Caddy</h1>
            <p className="text-sm text-gray-400">Your AI golf caddie</p>
          </div>

          <div className="flex items-center gap-4">
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
              {mode === 'voice' ? '🎤 Voice Mode' : '💬 Chat Mode'}
            </button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">⛳</div>
              <h2 className="text-xl font-semibold text-gray-300 mb-2">
                Welcome to mAI Caddy
              </h2>
              <p className="text-gray-500 mb-8">
                Ask me anything about your game, course strategy, or club selection.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  "What club for 155 yards into the wind?",
                  "I keep slicing my driver. Help.",
                  "Give me a pre-round warm-up routine",
                  "How do I manage a dogleg right?",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                    }}
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
            placeholder={mode === 'voice'
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
          Playing as {DEMO_PROFILE.name} · {DEMO_PROFILE.handicap} handicap · {personality.replace('_', ' ')} mode
        </p>
      </footer>
    </div>
  );
}
