'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// Browser type declarations for Web Speech API
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface TranscriptContext {
  /**
   * True when the utterance had no wake word and wasn't inside a reply
   * window — i.e., the user is just describing a shot out loud. The
   * page can feed these to the stroke counter without routing them
   * through the caddy API.
   */
  ambient: boolean;
}

interface UseVoiceOptions {
  onTranscript?: (text: string, ctx?: TranscriptContext) => void;
  onSpeechEnd?: () => void;
  lang?: string;
  autoSend?: boolean;
  /**
   * Hands-free mode. When true, the hook runs speech recognition
   * continuously. Commands to the caddy are gated by a wake word
   * ("Caddy"). Other utterances are still forwarded but marked
   * { ambient: true } so the caller can process them locally (for
   * example, feed shot descriptions to a stroke counter).
   */
  handsFree?: boolean;
  /** Override or extend the wake-word list. Matched case-insensitively. */
  wakeWords?: string[];
}

interface UseVoiceReturn {
  status: VoiceStatus;
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  isSupported: boolean;
  handsFree: boolean;
  /** True when hands-free mode is armed and passively listening for wake word */
  wakeArmed: boolean;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  toggleListening: () => void;
}

const DEFAULT_WAKE_WORDS = [
  'caddy', 'caddie',
  'my caddy', 'my caddie',
  // Common ASR mishears — only include whole-word forms, not short stems
  // that could collide with ambient speech.
  'katie',
];

/**
 * Does the caddy's utterance look like a question the user would answer?
 * Matches '?' or common question-opening words, and the specific "X, right?"
 * confirmation prompts so score replies don't need a wake word.
 */
function looksLikeQuestion(text: string): boolean {
  if (!text) return false;
  if (text.includes('?')) return true;
  const lower = text.toLowerCase().trim();
  if (/,\s*right\s*\??$/.test(lower)) return true; // "4, right?"
  return /^(what|which|how|want|need|should|do you|did you|ready)/.test(lower);
}

/** Strip a leading wake word from a transcript; return the remainder or null. */
function extractAfterWakeWord(text: string, wakeWords: string[]): string | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();
  for (const w of wakeWords) {
    // Word-boundary on both sides so "caddies" / "caddyshack" don't match.
    const pattern = new RegExp(
      `(?:^|[\\s,.!?;:])${w.replace(/\s+/g, '\\s+')}(?=[\\s,.!?;:]|$)`,
      'i',
    );
    const m = lower.match(pattern);
    if (m && m.index !== undefined) {
      const idx = m.index + m[0].length;
      const rest = text.slice(idx).trim().replace(/^[,.!?;:\s]+/, '');
      // Empty string means only the wake word was spoken — arm and wait.
      return rest;
    }
  }
  return null;
}

export function useVoice(options: UseVoiceOptions = {}): UseVoiceReturn {
  const {
    onTranscript,
    onSpeechEnd,
    lang = 'en-US',
    handsFree = false,
    wakeWords = DEFAULT_WAKE_WORDS,
  } = options;

  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  // wakeArmed is exposed for UI compatibility but no longer flips in
  // strict wake-word mode. Kept false; UI treats "listening" as the
  // passive state.
  const wakeArmed = false;

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isListeningRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const onSpeechEndRef = useRef(onSpeechEnd);
  const handsFreeRef = useRef(handsFree);
  const wakeWordsRef = useRef(wakeWords);
  const wakeArmedRef = useRef(false);
  const statusRef = useRef<VoiceStatus>('idle');
  // Reply window: when the caddy asks a question, the user gets a short
  // window to answer without having to say "Caddy" first. Set from
  // inside speak() on question-shaped utterances; auto-expires.
  const followUpArmedRef = useRef(false);
  const followUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while TTS is playing — we pause the recognizer so it doesn't
  // pick up the caddy's own voice and loop on itself.
  const isSpeakingRef = useRef(false);
  // In hands-free mode we reuse one recognizer instance and keep
  // restarting it when it ends (browsers stop continuous recognition
  // after silence / tab blur).
  const shouldKeepListeningRef = useRef(false);
  // Debounce repeated start attempts to prevent thrash.
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep callback refs current
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onSpeechEndRef.current = onSpeechEnd;
  }, [onTranscript, onSpeechEnd]);

  useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);
  useEffect(() => { wakeWordsRef.current = wakeWords; }, [wakeWords]);
  useEffect(() => { wakeArmedRef.current = wakeArmed; }, [wakeArmed]);
  useEffect(() => { statusRef.current = status; }, [status]);

  /**
   * Schedule a single restart of the recognizer; coalesces multiple
   * onend / error events that all want to restart it at the same time.
   */
  const scheduleRestart = useCallback((delayMs: number) => {
    if (restartTimerRef.current) return;
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (!shouldKeepListeningRef.current) return;
      if (isSpeakingRef.current) return; // hold off while TTS is going
      const r = recognitionRef.current;
      if (!r) return;
      try { r.start(); } catch { /* already running */ }
    }, delayMs);
  }, []);

  // Check browser support
  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) &&
    'speechSynthesis' in window;

  // Initialize speech recognition
  const getRecognition = useCallback(() => {
    if (recognitionRef.current) return recognitionRef.current;
    if (!isSupported) return null;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    // Hands-free mode uses continuous recognition with a wake-word filter.
    recognition.continuous = handsFreeRef.current;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isListeningRef.current = true;
      setStatus('listening');
      setError(null);
      setInterimTranscript('');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (interim) {
        setInterimTranscript(interim);
      }

      if (!final) return;

      const trimmed = final.trim();
      setTranscript(trimmed);
      setInterimTranscript('');

      if (!handsFreeRef.current) {
        // Push-to-talk: forward every finalized utterance as a full command.
        onTranscriptRef.current?.(trimmed, { ambient: false });
        return;
      }

      // --- Hands-free routing ---
      // Rule of thumb:
      //   - "Caddy <cmd>"           -> full caddy command (non-ambient)
      //   - Inside a reply window   -> full caddy command (non-ambient)
      //   - "Caddy" alone           -> ignored (must say command with it)
      //   - Anything else           -> forwarded as { ambient: true } so the
      //                                 page can run it through the stroke
      //                                 counter without asking the caddy.
      const after = extractAfterWakeWord(trimmed, wakeWordsRef.current);

      const clearFollowUp = () => {
        if (followUpTimerRef.current) {
          clearTimeout(followUpTimerRef.current);
          followUpTimerRef.current = null;
        }
        followUpArmedRef.current = false;
      };

      if (after !== null && after.length > 0) {
        clearFollowUp();
        onTranscriptRef.current?.(after, { ambient: false });
        return;
      }
      if (after !== null && after.length === 0) {
        // Just "Caddy" on its own — ignore.
        return;
      }
      if (followUpArmedRef.current) {
        clearFollowUp();
        onTranscriptRef.current?.(trimmed, { ambient: false });
        return;
      }
      // No wake word, no reply window — ambient. Page decides what to do.
      onTranscriptRef.current?.(trimmed, { ambient: true });
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' and 'aborted' are not real errors — just the golfer not saying anything
      if (event.error === 'no-speech' || event.error === 'aborted') {
        setStatus('idle');
        isListeningRef.current = false;
        return;
      }
      // In hands-free mode, 'network' hiccups are common on mobile —
      // swallow them and let onend restart us.
      if (handsFreeRef.current && event.error === 'network') {
        setStatus('idle');
        isListeningRef.current = false;
        return;
      }
      setError(getErrorMessage(event.error));
      setStatus('error');
      isListeningRef.current = false;
    };

    recognition.onend = () => {
      isListeningRef.current = false;
      if (statusRef.current !== 'error' && statusRef.current !== 'speaking') {
        setStatus('idle');
      }
      onSpeechEndRef.current?.();

      // In hands-free mode, the browser auto-stops after silence. Restart
      // so the wake-word listener stays live for the whole round — but
      // only if we're not currently speaking (otherwise we'd hear ourselves).
      if (shouldKeepListeningRef.current && handsFreeRef.current && !isSpeakingRef.current) {
        scheduleRestart(300);
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [isSupported, lang, scheduleRestart]);

  // If hands-free mode toggles while we're running, rebuild the recognizer
  // so `continuous` is applied correctly.
  const isFirstHandsFreeChange = useRef(true);
  useEffect(() => {
    // Skip the very first run — the auto-start effect below handles initial setup.
    if (isFirstHandsFreeChange.current) {
      isFirstHandsFreeChange.current = false;
      return;
    }
    const wasRunning = isListeningRef.current || shouldKeepListeningRef.current;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    if (wasRunning) {
      // Recreate with new continuous setting and restart
      const r = getRecognition();
      if (r) scheduleRestart(150);
    }
  }, [handsFree, getRecognition, scheduleRestart]);

  // Initialize speech synthesis
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  const startListening = useCallback(() => {
    // Stop any ongoing speech first
    if (synthRef.current?.speaking) {
      synthRef.current.cancel();
    }

    const recognition = getRecognition();
    if (!recognition) {
      setError('Voice input not supported in this browser');
      return;
    }

    shouldKeepListeningRef.current = true;

    try {
      recognition.start();
    } catch {
      // Already started — restart
      recognition.stop();
      setTimeout(() => {
        try { recognition.start(); } catch { /* ignore */ }
      }, 100);
    }
  }, [getRecognition]);

  const stopListening = useCallback(() => {
    shouldKeepListeningRef.current = false;
    recognitionRef.current?.stop();
    isListeningRef.current = false;
    setStatus('idle');
  }, []);

  // When hands-free mode turns on, start listening automatically.
  // When it turns off, stop the ambient recognizer.
  useEffect(() => {
    if (handsFree) {
      startListening();
    } else {
      // don't stop if caller explicitly wants push-to-talk; they'll toggle
      shouldKeepListeningRef.current = false;
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handsFree]);

  const toggleListening = useCallback(() => {
    if (isListeningRef.current) {
      stopListening();
    } else {
      startListening();
    }
  }, [startListening, stopListening]);

  const speak = useCallback(async (text: string): Promise<void> => {
    if (!synthRef.current) return;

    // Cancel any ongoing speech
    synthRef.current.cancel();

    // In hands-free mode, pause the recognizer while the caddy is
    // talking — otherwise the mic picks up the caddy's voice through
    // the speakers and feedback-loops.
    isSpeakingRef.current = true;
    if (recognitionRef.current && isListeningRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      isListeningRef.current = false;
    }

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 0.95; // Slightly slower — easier to understand on course
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Try to pick a natural-sounding voice
      const voices = synthRef.current!.getVoices();
      const preferred = voices.find(v =>
        v.lang.startsWith('en') && (v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Google'))
      ) || voices.find(v => v.lang.startsWith('en') && v.localService);

      if (preferred) {
        utterance.voice = preferred;
      }

      // Did the caddy just ask a question? If so, open a short reply
      // window after the speech finishes so the user can answer
      // naturally ("Driver.") without prefacing with "Caddy".
      const isQuestion = looksLikeQuestion(text);

      const finish = () => {
        utteranceRef.current = null;
        isSpeakingRef.current = false;
        setStatus('idle');
        if (isQuestion && handsFreeRef.current) {
          followUpArmedRef.current = true;
          if (followUpTimerRef.current) clearTimeout(followUpTimerRef.current);
          followUpTimerRef.current = setTimeout(() => {
            followUpArmedRef.current = false;
            followUpTimerRef.current = null;
          }, 8000); // 8-second reply window
        }
        // Wait a beat past the speaker tail before re-arming the mic
        // (otherwise we capture the last syllable and treat it as input).
        if (shouldKeepListeningRef.current && handsFreeRef.current) {
          scheduleRestart(450);
        }
        resolve();
      };

      utterance.onstart = () => setStatus('speaking');
      utterance.onend = finish;
      utterance.onerror = finish;

      utteranceRef.current = utterance;
      synthRef.current!.speak(utterance);
    });
  }, [lang, scheduleRestart]);

  const stopSpeaking = useCallback(() => {
    synthRef.current?.cancel();
    utteranceRef.current = null;
    isSpeakingRef.current = false;
    setStatus('idle');
    if (shouldKeepListeningRef.current && handsFreeRef.current) {
      scheduleRestart(200);
    }
  }, [scheduleRestart]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      if (followUpTimerRef.current) {
        clearTimeout(followUpTimerRef.current);
        followUpTimerRef.current = null;
      }
      followUpArmedRef.current = false;
      shouldKeepListeningRef.current = false;
      try { recognitionRef.current?.abort(); } catch { /* ignore */ }
      synthRef.current?.cancel();
    };
  }, []);

  return {
    status,
    isListening: status === 'listening',
    isSpeaking: status === 'speaking',
    transcript,
    interimTranscript,
    error,
    isSupported,
    handsFree,
    wakeArmed,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    toggleListening,
  };
}

function getErrorMessage(error: string): string {
  switch (error) {
    case 'not-allowed':
      return 'Microphone access denied. Check your browser permissions.';
    case 'network':
      return 'Network error — voice recognition needs an internet connection.';
    case 'audio-capture':
      return 'No microphone found. Check your device settings.';
    case 'service-not-allowed':
      return 'Speech service not available. Try again in a moment.';
    default:
      return `Voice error: ${error}`;
  }
}
