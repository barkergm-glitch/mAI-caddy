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

interface UseVoiceOptions {
  onTranscript?: (text: string) => void;
  onSpeechEnd?: () => void;
  lang?: string;
  autoSend?: boolean;
  /**
   * Hands-free mode. When true, the hook runs speech recognition
   * continuously, filters for a wake word (default: "caddy" /
   * "caddie" / "caddi" / "katie"), strips it, and fires onTranscript
   * with the command that follows. Utterances without the wake word
   * are ignored.
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
  'caddy', 'caddie', 'caddi',
  'katie', 'cadi', 'kati', // common ASR mishears
  'maicaddy', 'my caddy', 'my caddie',
];

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
  // wakeArmed = last utterance contained just the wake word, so next
  // utterance (without wake word) is also accepted as a command.
  const [wakeArmed, setWakeArmed] = useState(false);

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
        // Push-to-talk: forward every finalized utterance.
        onTranscriptRef.current?.(trimmed);
        return;
      }

      // --- Hands-free wake-word gating ---
      const after = extractAfterWakeWord(trimmed, wakeWordsRef.current);
      if (after === null) {
        // No wake word in this utterance.
        if (wakeArmedRef.current) {
          // We were armed from a prior bare "caddy" — accept this as the command.
          setWakeArmed(false);
          onTranscriptRef.current?.(trimmed);
        }
        // Otherwise: ignore ambient speech.
        return;
      }
      if (after.length === 0) {
        // User said just "caddy" with no follow-up command yet.
        setWakeArmed(true);
        return;
      }
      // Wake word + command in one utterance.
      setWakeArmed(false);
      onTranscriptRef.current?.(after);
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
    setWakeArmed(false);
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
      setWakeArmed(false);
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

      const finish = () => {
        utteranceRef.current = null;
        isSpeakingRef.current = false;
        setStatus('idle');
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
