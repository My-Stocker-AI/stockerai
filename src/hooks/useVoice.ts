import { useState, useCallback, useRef, useEffect } from 'react';

export type VoiceStatus = 'idle' | 'listening' | 'speaking' | 'thinking' | 'paused' | 'error';

// TTS via Cloudflare Worker (same as original PWA)
const TTS_URL = 'https://solitary-base-799c.russ-731.workers.dev';

// Deepgram STT via Cloudflare Worker (same as original PWA)
const DEEPGRAM_TOKEN_URL = 'https://stocker-deepgram-stt.russ-731.workers.dev/token';

interface UseVoiceOptions {
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  continuous?: boolean;
}

export function useVoice(options: UseVoiceOptions = {}) {
  const { onTranscript, onError } = options;

  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [lastInput, setLastInput] = useState('');
  const [isSupported] = useState(true); // Deepgram works everywhere

  // Deepgram refs
  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const keepAliveRef = useRef<NodeJS.Timeout | null>(null);
  const tokenRef = useRef<string | null>(null);
  const tokenExpiryRef = useRef<number>(0);
  const shouldReconnectRef = useRef(true);
  const isConnectedRef = useRef(false);
  const isRecordingRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const utteranceEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // TTS refs
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const KEEPALIVE_MS = 8000;

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

  const stopKeepAlive = useCallback(() => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }, []);

  const startKeepAlive = useCallback(() => {
    stopKeepAlive();
    keepAliveRef.current = setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'KeepAlive' }));
      }
    }, KEEPALIVE_MS);
  }, [stopKeepAlive]);

  const ensureToken = useCallback(async () => {
    const now = Date.now();
    if (tokenRef.current && tokenExpiryRef.current > now + 30000) {
      return tokenRef.current;
    }

    const response = await fetch(DEEPGRAM_TOKEN_URL);
    if (!response.ok) {
      throw new Error('Failed to get Deepgram token');
    }
    const data = await response.json();
    tokenRef.current = data.token;
    tokenExpiryRef.current = now + ((data.expires_in || 600) - 60) * 1000;
    return tokenRef.current;
  }, []);

  const handleDeepgramMessage = useCallback((data: any) => {
    if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
      const alt = data.channel.alternatives[0];
      const transcript = alt.transcript || '';
      const isFinal = data.is_final;

      if (transcript) {
        if (isFinal) {
          finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + transcript;
          setLastInput(transcript.trim());
          onTranscript?.(transcript.trim(), true);
        } else {
          onTranscript?.(transcript.trim(), false);
        }
      }

      // Check for utterance end (speech_final indicates natural pause)
      if (data.speech_final && finalTranscriptRef.current.trim()) {
        // Clear any pending timeout
        if (utteranceEndTimeoutRef.current) {
          clearTimeout(utteranceEndTimeoutRef.current);
        }
        // Small delay to catch any trailing words
        utteranceEndTimeoutRef.current = setTimeout(() => {
          finalTranscriptRef.current = '';
        }, 300);
      }
    } else if (data.type === 'UtteranceEnd') {
      finalTranscriptRef.current = '';
    }
  }, [onTranscript]);

  const setupMediaRecorder = useCallback(() => {
    if (!audioStreamRef.current) return;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    try {
      const recorder = new MediaRecorder(audioStreamRef.current, {
        mimeType,
        audioBitsPerSecond: 16000
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(event.data);
        }
      };

      recorder.onerror = () => {
        onError?.('MediaRecorder error');
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100); // Send data every 100ms
      isRecordingRef.current = true;
    } catch (e: any) {
      onError?.(e.message || 'Failed to start recording');
    }
  }, [onError]);

  const connectDeepgram = useCallback(async () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const token = await ensureToken();
    if (!token) throw new Error('No token available');

    const wsUrl = 'wss://api.deepgram.com/v1/listen?' +
      'model=nova-2&' +
      'language=en-US&' +
      'smart_format=true&' +
      'interim_results=true&' +
      'vad_events=true&' +
      'endpointing=200';

    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(wsUrl, ['token', token]);
      socketRef.current = socket;

      const timeout = setTimeout(() => {
        if (!isConnectedRef.current) {
          socket.close();
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      socket.onopen = () => {
        clearTimeout(timeout);
        isConnectedRef.current = true;
        startKeepAlive();
        setupMediaRecorder();
        resolve();
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleDeepgramMessage(data);
        } catch (e) {}
      };

      socket.onerror = () => {
        clearTimeout(timeout);
        onError?.('WebSocket error');
      };

      socket.onclose = () => {
        clearTimeout(timeout);
        isConnectedRef.current = false;
        isRecordingRef.current = false;
        stopKeepAlive();

        // Auto-reconnect if we should
        if (shouldReconnectRef.current && status === 'listening') {
          setTimeout(async () => {
            try {
              await connectDeepgram();
            } catch (e) {}
          }, 1000);
        }
      };
    });
  }, [ensureToken, startKeepAlive, stopKeepAlive, setupMediaRecorder, handleDeepgramMessage, onError, status]);

  const startListening = useCallback(async () => {
    try {
      // Get microphone access
      audioStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });

      shouldReconnectRef.current = true;
      await connectDeepgram();
      setStatus('listening');
      return true;
    } catch (error: any) {
      onError?.(error.message || 'Failed to start listening');
      setStatus('error');
      return false;
    }
  }, [connectDeepgram, onError]);

  const stopListening = useCallback(() => {
    shouldReconnectRef.current = false;
    stopKeepAlive();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    mediaRecorderRef.current = null;
    isRecordingRef.current = false;

    if (socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'CloseStream' }));
      }
      socketRef.current.close();
      socketRef.current = null;
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }

    isConnectedRef.current = false;
    setStatus('idle');
  }, [stopKeepAlive]);

  const pauseListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      isRecordingRef.current = false;
    }
    setStatus('paused');
  }, []);

  const resumeListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      isRecordingRef.current = true;
      setStatus('listening');
    } else if (!mediaRecorderRef.current && socketRef.current?.readyState === WebSocket.OPEN) {
      setupMediaRecorder();
      setStatus('listening');
    } else if (!isConnectedRef.current) {
      // Need to reconnect
      startListening();
    }
  }, [setupMediaRecorder, startListening]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
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

        // TTS preprocessing - match original PWA exactly
        const processed = text
          // Spanish/foreign brands - prevent TTS language switching
          .replace(/Kinder Bueno/gi, 'Kinder Bwayno bar')
          .replace(/\bBueno\b/gi, 'Bwayno')
          .replace(/Takis/gi, 'Tah-keez')
          .replace(/Jarritos/gi, 'Ha-ree-toes')
          .replace(/Sabritas/gi, 'Sa-bree-tas')
          .replace(/Modelo/gi, 'Mo-dello')
          .replace(/Topo Chico/gi, 'Topo Cheeko')
          .replace(/Gansito/gi, 'Gan-see-toe')
          .replace(/Mazapan/gi, 'Mazza-pan')
          .replace(/Lucas/gi, 'Loo-kus')
          .replace(/Pulparindo/gi, 'Pull-pa-rindo')
          .replace(/De La Rosa/gi, 'De La Rosa')
          .replace(/Pelon Pelo Rico/gi, 'Peh-lone Pelo Reeko')
          // Standard abbreviation fixes
          .replace(/(\d+)\s*oz\b/gi, '$1 ounce')
          .replace(/\boz\b/gi, 'ounce')
          .replace(/\bqty\b/gi, 'quantity')
          .replace(/\bpcs\b/gi, 'pieces')
          .replace(/\bpkg\b/gi, 'package')
          .replace(/\bct\b/gi, 'count')
          .replace(/\bCan\b/g, 'can')
          .replace(/\b(\d+)\s*can\b/gi, '$1 cans');

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
