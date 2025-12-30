import { useState, useCallback, useRef, useEffect } from 'react';

export type VoiceStatus = 'idle' | 'listening' | 'speaking' | 'thinking' | 'paused' | 'error';

// TTS via Cloudflare Worker (same as original PWA)
const TTS_URL = 'https://solitary-base-799c.russ-731.workers.dev';

interface UseVoiceOptions {
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  continuous?: boolean;
}

export function useVoice(options: UseVoiceOptions = {}) {
  const { onTranscript, onError, continuous = true } = options;

  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [lastInput, setLastInput] = useState('');
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isListeningRef = useRef(false);
  const shouldRestartRef = useRef(false);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
    }
  }, []);

  const initRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      isListeningRef.current = true;
      setStatus('listening');
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        setLastInput(finalTranscript.trim());
        onTranscript?.(finalTranscript.trim(), true);
      } else if (interimTranscript) {
        onTranscript?.(interimTranscript.trim(), false);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setStatus('error');
        onError?.(event.error);
      }
    };

    recognition.onend = () => {
      isListeningRef.current = false;
      if (shouldRestartRef.current) {
        try {
          recognition.start();
        } catch (e) {}
      } else {
        setStatus('idle');
      }
    };

    return recognition;
  }, [continuous, onTranscript, onError]);

  const startListening = useCallback(async () => {
    if (!isSupported) {
      onError?.('Speech recognition not supported');
      return false;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      if (!recognitionRef.current) {
        recognitionRef.current = initRecognition();
      }

      if (recognitionRef.current && !isListeningRef.current) {
        shouldRestartRef.current = true;
        recognitionRef.current.start();
        return true;
      }
    } catch (error: any) {
      onError?.(error.message || 'Failed to access microphone');
      setStatus('error');
    }

    return false;
  }, [isSupported, initRecognition, onError]);

  const stopListening = useCallback(() => {
    shouldRestartRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    isListeningRef.current = false;
    setStatus('idle');
  }, []);

  const pauseListening = useCallback(() => {
    shouldRestartRef.current = false;
    if (recognitionRef.current && isListeningRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setStatus('paused');
  }, []);

  const resumeListening = useCallback(() => {
    shouldRestartRef.current = true;
    if (recognitionRef.current && !isListeningRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {}
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  }, []);

  const playBeep = useCallback((success: boolean) => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = success ? 880 : 220;
      gain.gain.value = 0.1;
      osc.start();
      osc.stop(ctx.currentTime + (success ? 0.1 : 0.2));
    } catch (e) {}
  }, []);

  const speakBrowser = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        resolve();
      }
    });
  }, []);

  const speak = useCallback(async (text: string): Promise<void> => {
    return new Promise(async (resolve) => {
      try {
        pauseListening();
        setStatus('speaking');

        const processed = text
          .replace(/Kinder Bueno/gi, 'Kinder Bwayno bar')
          .replace(/Takis/gi, 'Tah-keez')
          .replace(/(\d+)\s*oz\b/gi, '$1 ounce');

        try {
          const response = await fetch(TTS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: processed, voice: 'nova' })
          });

          if (!response.ok) throw new Error('TTS failed');

          const audioBuffer = await response.arrayBuffer();
          const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;

          audio.onended = () => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            playBeep(true); // Ready beep
            setStatus('listening');
            resumeListening();
            resolve();
          };

          audio.onerror = () => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            // Fallback to browser TTS
            speakBrowser(text).then(() => {
              playBeep(true);
              setStatus('listening');
              resumeListening();
              resolve();
            });
          };

          await audio.play();
        } catch (error) {
          // Fallback to browser TTS
          await speakBrowser(text);
          playBeep(true);
          setStatus('listening');
          resumeListening();
          resolve();
        }
      } catch (error) {
        setStatus('listening');
        resumeListening();
        resolve();
      }
    });
  }, [pauseListening, resumeListening, speakBrowser, playBeep]);

  const setThinking = useCallback(() => setStatus('thinking'), []);

  useEffect(() => {
    return () => {
      stopListening();
      stopAudio();
    };
  }, [stopListening, stopAudio]);

  return {
    status,
    lastInput,
    isSupported,
    startListening,
    stopListening,
    pauseListening,
    resumeListening,
    speak,
    stopAudio,
    setThinking,
    setStatus,
    playBeep
  };
}
