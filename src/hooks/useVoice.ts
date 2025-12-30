import { useState, useCallback, useRef, useEffect } from 'react';

export type VoiceStatus = 'idle' | 'listening' | 'speaking' | 'thinking' | 'paused' | 'muted' | 'error';

// TTS via Cloudflare Worker (same as original PWA)
const TTS_URL = 'https://solitary-base-799c.russ-731.workers.dev';

// Deepgram STT via Cloudflare Worker (same as original PWA)
const DEEPGRAM_TOKEN_URL = 'https://stocker-deepgram-stt.russ-731.workers.dev/token';

// Wake phrases including common mishearings (from original PWA)
const WAKE_PHRASES = [
  'ok stocker', 'okay stocker', 'hey stocker', 'stocker',
  'ok stalker', 'okay stalker', 'hey stalker', 'stalker',
  'ok stoker', 'okay stoker', 'hey stoker', 'stoker',
  'ok docker', 'okay docker', 'hey docker',
  'ok soccer', 'okay soccer',
  'ok stock', 'okay stock', 'hey stock'
];

interface UseVoiceOptions {
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onWakePhrase?: (command: string | null) => void;
  continuous?: boolean;
}

export function useVoice(options: UseVoiceOptions = {}) {
  const { onTranscript, onError, onWakePhrase } = options;

  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [lastInput, setLastInput] = useState('');
  const [isSupported] = useState(true);

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

  // Echo filtering refs (from original PWA)
  const lastSpokenTextRef = useRef('');
  const lastSpeakTimeRef = useRef(0);
  const ECHO_COOLDOWN_MS = 800;

  // TTS refs
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const KEEPALIVE_MS = 8000;

  // Check if input is echo of what we just said (from original PWA)
  const isEcho = useCallback((text: string): boolean => {
    const lower = text.toLowerCase().trim();

    // Cooldown: ignore anything within 800ms of speaking
    if (Date.now() - lastSpeakTimeRef.current < ECHO_COOLDOWN_MS) {
      console.log('[Voice] Ignoring input during cooldown');
      return true;
    }

    // Ignore very short garbage (1-2 chars)
    if (lower.length < 3) {
      console.log('[Voice] Ignoring short input:', lower);
      return true;
    }

    // Only filter as echo if user's ENTIRE input is a large portion of what AI said
    if (lastSpokenTextRef.current && lower.length > 10) {
      if (lastSpokenTextRef.current.indexOf(lower) !== -1) {
        console.log('[Voice] Ignoring echo:', lower);
        return true;
      }
    }

    return false;
  }, []);

  // Extract command after wake phrase (from original PWA)
  // Returns "what's next" if wake phrase alone (matching original behavior)
  const extractWakeCommand = useCallback((text: string): string | null => {
    const lower = text.toLowerCase();
    for (const phrase of WAKE_PHRASES) {
      const idx = lower.indexOf(phrase);
      if (idx !== -1) {
        let after = lower.substring(idx + phrase.length).trim();
        after = after.replace(/^[,\s]+/, '').trim();
        return after || "what's next"; // Return "what's next" if just wake phrase
      }
    }
    return null;
  }, []);

  // Check if text contains wake phrase
  const hasWakePhrase = useCallback((text: string): boolean => {
    const lower = text.toLowerCase();
    return WAKE_PHRASES.some(phrase => lower.indexOf(phrase) !== -1);
  }, []);

  // Audio context ref for consistent audio
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  // Success beep - for item confirmation (from original PWA)
  const playSuccessBeep = useCallback(() => {
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 523; // C5
      gain.gain.value = 0.12;
      osc.start();
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1); // E5 ascending
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) {}
  }, [getAudioContext]);

  // Error beep - for undo (from original PWA)
  const playErrorBeep = useCallback(() => {
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 440; // A4
      gain.gain.value = 0.12;
      osc.start();
      osc.frequency.setValueAtTime(330, ctx.currentTime + 0.15); // E4 descending
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  }, [getAudioContext]);

  // Ready beep - plays after AI speaks to signal "your turn" (from original PWA)
  const playReadyBeep = useCallback(() => {
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880; // A5 - higher, distinct
      gain.gain.value = 0.08; // Quieter than success beep
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  }, [getAudioContext]);

  // Legacy playBeep for backward compatibility
  const playBeep = useCallback((success: boolean) => {
    if (success) {
      playSuccessBeep();
    } else {
      playErrorBeep();
    }
  }, [playSuccessBeep, playErrorBeep]);

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
      const speechFinal = data.speech_final;

      if (transcript) {
        if (isFinal) {
          finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + transcript;
          setLastInput(transcript.trim());

          // Check for wake phrase in paused/muted state
          if (status === 'paused' || status === 'muted') {
            if (hasWakePhrase(transcript)) {
              const command = extractWakeCommand(transcript);
              onWakePhrase?.(command);
              finalTranscriptRef.current = '';
              return;
            }
          } else {
            // Normal listening - filter echo and pass to transcript handler
            if (!isEcho(transcript)) {
              onTranscript?.(transcript.trim(), true);
            }
          }
        } else {
          if (status === 'listening') {
            onTranscript?.(transcript.trim(), false);
          }
        }
      }

      // Check for utterance end
      if (speechFinal && finalTranscriptRef.current.trim()) {
        if (utteranceEndTimeoutRef.current) {
          clearTimeout(utteranceEndTimeoutRef.current);
        }
        utteranceEndTimeoutRef.current = setTimeout(() => {
          finalTranscriptRef.current = '';
        }, 300);
      }
    } else if (data.type === 'UtteranceEnd') {
      finalTranscriptRef.current = '';
    }
  }, [onTranscript, onWakePhrase, status, hasWakePhrase, extractWakeCommand, isEcho]);

  const setupMediaRecorder = useCallback(() => {
    if (!audioStreamRef.current) return;

    // Multiple MIME type fallbacks (from original PWA)
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus'
    ];
    let mimeType = '';
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        mimeType = type;
        break;
      }
    }

    try {
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(audioStreamRef.current, options);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(event.data);
        }
      };

      recorder.onerror = () => {
        onError?.('MediaRecorder error');
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);
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

        if (shouldReconnectRef.current && (status === 'listening' || status === 'paused' || status === 'muted')) {
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
    setLastInput('');
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
      startListening();
    }
  }, [setupMediaRecorder, startListening]);

  const mute = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      isRecordingRef.current = false;
    }
    setLastInput('');
    setStatus('muted');
  }, []);

  const unmute = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      isRecordingRef.current = true;
    }
    setStatus('listening');
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    try {
      window.speechSynthesis.cancel();
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

  // Mutex for speak function (matches original PWA lock/unlock pattern)
  const speakLockRef = useRef(false);
  const speakQueueRef = useRef<(() => void)[]>([]);

  const acquireSpeakLock = useCallback((): Promise<void> => {
    return new Promise(resolve => {
      if (!speakLockRef.current) {
        speakLockRef.current = true;
        resolve();
      } else {
        speakQueueRef.current.push(resolve);
      }
    });
  }, []);

  const releaseSpeakLock = useCallback(() => {
    if (speakQueueRef.current.length > 0) {
      const next = speakQueueRef.current.shift();
      next?.();
    } else {
      speakLockRef.current = false;
    }
  }, []);

  const speak = useCallback(async (text: string): Promise<void> => {
    if (!text || !text.trim()) return;

    // 1. Acquire lock - only one speak at a time (matches original PWA)
    await acquireSpeakLock();

    try {
      // 2. Set state FIRST (before stopping recognition) - matches original PWA
      setStatus('speaking');

      // 3. Kill all audio and stop recognition - matches original PWA
      stopAudio();
      pauseListening();

      // 4. Preprocess text for TTS - matches original PWA
      const processed = text
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
        .replace(/(\d+)\s*oz\b/gi, '$1 ounce')
        .replace(/\boz\b/gi, 'ounce')
        .replace(/\bqty\b/gi, 'quantity')
        .replace(/\bpcs\b/gi, 'pieces')
        .replace(/\bpkg\b/gi, 'package')
        .replace(/\bct\b/gi, 'count')
        .replace(/\bCan\b/g, 'can')
        .replace(/\b(\d+)\s*can\b/gi, '$1 cans');

      // 5. Fetch and play audio
      try {
        const response = await fetch(TTS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: processed, voice: 'nova' })
        });

        if (!response.ok) throw new Error('TTS failed');

        const audioBlob = await response.blob();

        // Play audio and wait for completion (matches original PWA playAudio)
        await new Promise<void>((resolve, reject) => {
          const url = URL.createObjectURL(audioBlob);
          const audio = new Audio();
          audioRef.current = audio;

          audio.onended = () => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            resolve();
          };

          audio.onerror = (err) => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            reject(err);
          };

          audio.src = url;
          audio.play().catch(reject);
        });

      } catch (error) {
        // Fallback to browser TTS
        await speakBrowser(text);
      }

      // 6. Store for echo filtering AFTER audio completes (matches original PWA)
      lastSpokenTextRef.current = text.toLowerCase();
      lastSpeakTimeRef.current = Date.now();

      // 7. Done speaking - transition back to listening (matches original PWA)
      setStatus('listening');

      // 8. Play ready beep (matches original PWA)
      playReadyBeep();

      // 9. Wait before restarting recognition (matches original PWA)
      await new Promise(r => setTimeout(r, 100));

      // 10. Restart recognition (matches original PWA)
      resumeListening();

    } finally {
      // Always release lock (matches original PWA unlock in finally)
      releaseSpeakLock();
    }
  }, [acquireSpeakLock, releaseSpeakLock, stopAudio, pauseListening, resumeListening, speakBrowser, playReadyBeep]);

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
    mute,
    unmute,
    speak,
    stopAudio,
    setThinking,
    setStatus,
    playBeep,
    playSuccessBeep,
    playErrorBeep,
    playReadyBeep,
    hasWakePhrase,
    extractWakeCommand
  };
}
