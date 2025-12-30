import { useState, useCallback, useRef, useEffect } from 'react';

export type VoiceStatus = 'idle' | 'listening' | 'speaking' | 'thinking' | 'paused' | 'error';

const N8N_BASE = 'https://visionairy.app.n8n.cloud/webhook';

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

  const speak = useCallback(async (text: string): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      try {
        pauseListening();
        setStatus('speaking');

        const processed = text
          .replace(/Kinder Bueno/gi, 'Kinder Bwayno bar')
          .replace(/Takis/gi, 'Tah-keez')
          .replace(/(\d+)\s*oz\b/gi, '$1 ounce');

        const response = await fetch(`${N8N_BASE}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: processed })
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
          setStatus('listening');
          resumeListening();
          resolve();
        };

        audio.onerror = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          resumeListening();
          reject(new Error('Audio playback failed'));
        };

        await audio.play();
      } catch (error) {
        resumeListening();
        reject(error);
      }
    });
  }, [pauseListening, resumeListening]);

  const setThinking = useCallback(() => setStatus('thinking'), []);

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
