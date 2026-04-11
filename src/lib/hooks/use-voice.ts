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
}

interface UseVoiceReturn {
  status: VoiceStatus;
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  toggleListening: () => void;
}

export function useVoice(options: UseVoiceOptions = {}): UseVoiceReturn {
  const { onTranscript, onSpeechEnd, lang = 'en-US' } = options;

  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isListeningRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const onSpeechEndRef = useRef(onSpeechEnd);

  // Keep callback refs current
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onSpeechEndRef.current = onSpeechEnd;
  }, [onTranscript, onSpeechEnd]);

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

    recognition.continuous = false; // Single utterance — golfer says something, caddy responds
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

      if (final) {
        const trimmed = final.trim();
        setTranscript(trimmed);
        setInterimTranscript('');
        onTranscriptRef.current?.(trimmed);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' and 'aborted' are not real errors — just the golfer not saying anything
      if (event.error === 'no-speech' || event.error === 'aborted') {
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
      if (status !== 'error') {
        setStatus('idle');
      }
      onSpeechEndRef.current?.();
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [isSupported, lang, status]);

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
    recognitionRef.current?.stop();
    isListeningRef.current = false;
    setStatus('idle');
  }, []);

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

      utterance.onstart = () => setStatus('speaking');
      utterance.onend = () => {
        setStatus('idle');
        utteranceRef.current = null;
        resolve();
      };
      utterance.onerror = () => {
        setStatus('idle');
        utteranceRef.current = null;
        resolve();
      };

      utteranceRef.current = utterance;
      synthRef.current!.speak(utterance);
    });
  }, [lang]);

  const stopSpeaking = useCallback(() => {
    synthRef.current?.cancel();
    utteranceRef.current = null;
    setStatus('idle');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
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
