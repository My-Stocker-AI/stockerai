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

  // Store callbacks in refs to avoid stale closures in WebSocket handlers
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  const onWakePhraseRef = useRef(onWakePhrase);

  // Keep refs updated when callbacks change
  onTranscriptRef.current = onTranscript;
  onErrorRef.current = onError;
  onWakePhraseRef.current = onWakePhrase;

  const [status, setStatusState] = useState<VoiceStatus>('idle');
  const [lastInput, setLastInput] = useState('');
  const [isSupported] = useState(true);

  // Status ref to avoid stale closures in WebSocket callbacks (matches original PWA this.state pattern)
  const statusRef = useRef<VoiceStatus>('idle');
  const setStatus = useCallback((newStatus: VoiceStatus) => {
    statusRef.current = newStatus;
    setStatusState(newStatus);
  }, []);

  // Deepgram refs
  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const keepAliveRef = useRef<NodeJS.Timeout | null>(null);
  const tokenRef = useRef<string | null>(null);
  const tokenExpiryRef = useRef<number>(0);
  const shouldReconnectRef = useRef(true);
  const isConnectedRef = useRef(false);
  const stoppedRef = useRef(false); // Flag to prevent new audio after stopAudio()
  const isRecordingRef = useRef(false);
  const accumulatedTranscriptRef = useRef('');  // Accumulated transcript for utterance (matches original PWA this.transcript)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);  // Silence timer fallback (matches original PWA)

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

  // Global audio unlock state - persists across component lifecycle
  const audioUnlockedRef = useRef(false);

  // Get or create AudioContext with Safari/iOS compatibility
  // CRITICAL: Use webkit prefix + explicit 44100 sample rate for iOS Safari
  const getAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      // Safari requires webkit prefix
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        console.error('[Voice] AudioContext not supported');
        return null;
      }
      // iOS Safari can init with wrong sample rate - force 44100
      audioContextRef.current = new AudioContextClass({ sampleRate: 44100 });
    }

    // CRITICAL: Safari requires resume() after user gesture
    // Must check and resume every time before use
    if (audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
        console.log('[Voice] AudioContext resumed');
      } catch (e) {
        console.warn('[Voice] AudioContext resume failed:', e);
      }
    }

    return audioContextRef.current;
  }, []);

  // Comprehensive audio unlock for Safari/iOS
  // CRITICAL: Must be called SYNCHRONOUSLY from user gesture (click/touch)
  // This handles: AudioContext unlock, HTML5 Audio unlock, iOS mute switch bypass
  const unlockAudio = useCallback(async () => {
    // Skip if already unlocked
    if (audioUnlockedRef.current) {
      console.log('[Voice] Audio already unlocked');
      return;
    }

    console.log('[Voice] Unlocking audio...');

    // 1. Resume AudioContext (required for Safari)
    if (audioContextRef.current?.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
        console.log('[Voice] AudioContext resumed in unlock');
      } catch (e) {
        console.warn('[Voice] AudioContext resume failed in unlock:', e);
      }
    }

    // 2. Create AudioContext if not exists (with user gesture)
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioContextRef.current = new AudioContextClass({ sampleRate: 44100 });
        console.log('[Voice] AudioContext created in unlock');
      }
    }

    // 3. Play silent audio via WebAudio API (unlocks web audio)
    if (audioContextRef.current) {
      try {
        const buffer = audioContextRef.current.createBuffer(1, 1, 22050);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.start(0);
        console.log('[Voice] WebAudio silent buffer played');
      } catch (e) {
        console.warn('[Voice] WebAudio silent buffer failed:', e);
      }
    }

    // 4. Play silent HTML5 Audio (iOS mute switch bypass)
    // HTML5 Audio plays even when iOS mute switch is on, unlike WebAudio
    try {
      const silentAudio = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+1DEAAAGAAGn9AAAIgAANP8AAARM//tQxBUAAADSAAAAAAAAANIAAAAA');
      // CRITICAL: play() must be synchronous from user gesture - no await before it
      const playPromise = silentAudio.play();
      if (playPromise) {
        playPromise.catch(() => {
          // Ignore errors - expected on some browsers
        });
      }
      console.log('[Voice] HTML5 silent audio played');
    } catch (e) {
      console.warn('[Voice] HTML5 silent audio failed:', e);
    }

    audioUnlockedRef.current = true;
    console.log('[Voice] Audio unlock complete');
  }, []);

  // Success beep - for item confirmation (from original PWA)
  const playSuccessBeep = useCallback(async () => {
    try {
      const ctx = await getAudioContext();
      if (!ctx) return;
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
    } catch (e) {
      console.warn('[Voice] Success beep failed:', e);
    }
  }, [getAudioContext]);

  // Error beep - for undo (from original PWA)
  const playErrorBeep = useCallback(async () => {
    try {
      const ctx = await getAudioContext();
      if (!ctx) return;
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
    } catch (e) {
      console.warn('[Voice] Error beep failed:', e);
    }
  }, [getAudioContext]);

  // Ready beep - plays after AI speaks to signal "your turn" (from original PWA)
  const playReadyBeep = useCallback(async () => {
    try {
      const ctx = await getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880; // A5 - higher, distinct
      gain.gain.value = 0.08; // Quieter than success beep
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.warn('[Voice] Ready beep failed:', e);
    }
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

  // Process accumulated transcript as a command (matches original PWA handleCommand flow)
  const processAccumulatedTranscript = useCallback(() => {
    const text = accumulatedTranscriptRef.current.trim();
    accumulatedTranscriptRef.current = '';

    if (!text) return;

    const currentStatus = statusRef.current;
    console.log('[Voice] Processing transcript:', text, 'state:', currentStatus);

    // In paused/muted state, only listen for wake phrase (matches original PWA)
    if (currentStatus === 'paused' || currentStatus === 'muted') {
      if (hasWakePhrase(text)) {
        const command = extractWakeCommand(text);
        onWakePhraseRef.current?.(command);
      }
      return;
    }

    // Only process if in valid state (matches original PWA state check)
    if (currentStatus !== 'listening' && currentStatus !== 'idle') {
      console.log('[Voice] Ignoring transcript, wrong state:', currentStatus);
      return;
    }

    // Filter echo/noise (matches original PWA)
    if (isEcho(text)) {
      return;
    }

    // Pass to handler - use ref to avoid stale closure
    onTranscriptRef.current?.(text, true);
  }, [hasWakePhrase, extractWakeCommand, isEcho]); // Removed callback deps - using refs

  const handleDeepgramMessage = useCallback((data: any) => {
    if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
      const alt = data.channel.alternatives[0];
      const transcript = alt.transcript || '';
      const isFinal = data.is_final;
      const speechFinal = data.speech_final;

      // Check for isUtteranceEnd in the result (matches original PWA)
      const isUtteranceEnd = speechFinal || data.speech_final;

      if (transcript) {
        // Update display for interim results (only when listening, matches original PWA)
        if (!isFinal && statusRef.current === 'listening') {
          setLastInput(transcript.trim());
          onTranscriptRef.current?.(transcript.trim(), false);
        }

        if (isFinal) {
          setLastInput(transcript.trim());

          // If Deepgram detected utterance end, process immediately (matches original PWA)
          if (isUtteranceEnd) {
            console.log('[Voice] Utterance end - processing immediately:', transcript);
            accumulatedTranscriptRef.current = transcript;
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            processAccumulatedTranscript();
            return;
          }

          // Accumulate transcript (matches original PWA this.transcript += final)
          accumulatedTranscriptRef.current += (accumulatedTranscriptRef.current ? ' ' : '') + transcript;

          // Reset silence timer (fallback for when utterance_end doesn't fire, matches original PWA)
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            processAccumulatedTranscript();
          }, 300);  // 300ms silence timer (matches original PWA)
        }
      }
    } else if (data.type === 'UtteranceEnd') {
      // Deepgram UtteranceEnd message - process immediately (matches original PWA)
      console.log('[Voice] UtteranceEnd event received');
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (accumulatedTranscriptRef.current.trim()) {
        processAccumulatedTranscript();
      }
    }
  }, [onTranscript, processAccumulatedTranscript]);

  // Detect supported MIME type for MediaRecorder
  // CRITICAL: Safari has limited support - must test each type
  const getSupportedMimeType = useCallback((): string => {
    // Priority order: Safari-friendly first, then Chrome-friendly
    const types = [
      'audio/mp4',                    // Safari iOS/macOS - AAC in MP4
      'audio/webm;codecs=opus',       // Chrome/Firefox - Opus in WebM
      'audio/webm',                   // Chrome fallback
      'audio/ogg;codecs=opus',        // Firefox fallback
      'audio/wav',                    // Universal fallback (larger files)
    ];

    for (const type of types) {
      try {
        if (MediaRecorder.isTypeSupported(type)) {
          console.log('[Voice] Using MIME type:', type);
          return type;
        }
      } catch (e) {
        // isTypeSupported can throw on some browsers
        console.warn('[Voice] Error checking MIME type:', type, e);
      }
    }

    // Return empty string - let browser choose default
    console.warn('[Voice] No supported MIME type found, using browser default');
    return '';
  }, []);

  const setupMediaRecorder = useCallback(() => {
    if (!audioStreamRef.current) {
      console.error('[Voice] No audio stream available for MediaRecorder');
      return;
    }

    // Check if MediaRecorder is supported
    if (typeof MediaRecorder === 'undefined') {
      console.error('[Voice] MediaRecorder not supported');
      onErrorRef.current?.('Recording not supported on this browser');
      return;
    }

    const mimeType = getSupportedMimeType();

    try {
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(audioStreamRef.current, options);

      console.log('[Voice] MediaRecorder created with options:', options);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error('[Voice] MediaRecorder error:', event);
        onErrorRef.current?.('MediaRecorder error');
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      isRecordingRef.current = true;
      console.log('[Voice] MediaRecorder started');
    } catch (e: any) {
      console.error('[Voice] Failed to create MediaRecorder:', e);
      onErrorRef.current?.(e.message || 'Failed to start recording');
    }
  }, [getSupportedMimeType]); // Using ref, no deps needed

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
        onErrorRef.current?.('WebSocket error');
      };

      socket.onclose = () => {
        clearTimeout(timeout);
        isConnectedRef.current = false;
        isRecordingRef.current = false;
        stopKeepAlive();

        // Use statusRef.current to avoid stale closure (matches original PWA)
        const currentStatus = statusRef.current;
        if (shouldReconnectRef.current && (currentStatus === 'listening' || currentStatus === 'paused' || currentStatus === 'muted')) {
          setTimeout(async () => {
            try {
              await connectDeepgram();
            } catch (e) {}
          }, 1000);
        }
      };
    });
  }, [ensureToken, startKeepAlive, stopKeepAlive, setupMediaRecorder, handleDeepgramMessage]); // Using ref for onError

  // Get or reuse audio stream - CRITICAL for Safari
  // Safari bug: Multiple getUserMedia calls can permanently mute previous tracks
  // Solution: Reuse the same stream across reconnections
  const getOrCreateAudioStream = useCallback(async (): Promise<MediaStream> => {
    // Check if we have an existing active stream
    if (audioStreamRef.current) {
      const tracks = audioStreamRef.current.getAudioTracks();
      const activeTrack = tracks.find(t => t.readyState === 'live');
      if (activeTrack) {
        console.log('[Voice] Reusing existing audio stream');
        return audioStreamRef.current;
      }
      // Stream exists but tracks are ended - clean up
      console.log('[Voice] Existing stream has ended tracks, creating new stream');
      audioStreamRef.current = null;
    }

    console.log('[Voice] Creating new audio stream');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000
      }
    });
    audioStreamRef.current = stream;
    return stream;
  }, []);

  const startListening = useCallback(async () => {
    // Reset stopped flag when starting new session
    stoppedRef.current = false;

    // Unlock audio for Safari (must happen on user gesture)
    await unlockAudio();

    try {
      // Get or reuse existing stream (Safari multiple stream bug fix)
      await getOrCreateAudioStream();

      shouldReconnectRef.current = true;
      await connectDeepgram();
      setStatus('listening');
      return true;
    } catch (error: any) {
      // Handle specific microphone errors
      if (error.name === 'NotAllowedError') {
        console.error('[Voice] Microphone permission denied');
        onErrorRef.current?.('Microphone access denied. Please allow microphone access.');
      } else if (error.name === 'NotFoundError') {
        console.error('[Voice] No microphone found');
        onErrorRef.current?.('No microphone found. Please connect a microphone.');
      } else if (error.name === 'NotReadableError') {
        console.error('[Voice] Microphone in use');
        onErrorRef.current?.('Microphone is in use by another application.');
      } else {
        console.error('[Voice] Failed to start listening:', error);
        onErrorRef.current?.(error.message || 'Failed to start listening');
      }
      setStatus('error');
      return false;
    }
  }, [connectDeepgram, setStatus, unlockAudio, getOrCreateAudioStream]); // Using ref for onError

  const stopListening = useCallback(() => {
    shouldReconnectRef.current = false;
    stopKeepAlive();

    // Clear silence timer and accumulated transcript
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    accumulatedTranscriptRef.current = '';

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
  }, [stopKeepAlive, setStatus]);

  const pauseListening = useCallback(() => {
    // Clear silence timer and accumulated transcript (matches original PWA pause behavior)
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    accumulatedTranscriptRef.current = '';

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      isRecordingRef.current = false;
    }
    setLastInput('');
    setStatus('paused');
  }, [setStatus]);

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
  }, [setupMediaRecorder, startListening, setStatus]);

  const mute = useCallback(() => {
    // Clear silence timer and accumulated transcript (matches original PWA mute behavior)
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    accumulatedTranscriptRef.current = '';

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      isRecordingRef.current = false;
    }
    setLastInput('');
    setStatus('muted');
  }, [setStatus]);

  const unmute = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      isRecordingRef.current = true;
    }
    setStatus('listening');
  }, [setStatus]);

  const stopAudio = useCallback(() => {
    // Set stopped flag to prevent any pending TTS from playing
    stoppedRef.current = true;

    // Clear the speak queue to prevent queued TTS from starting
    speakQueueRef.current = [];
    speakLockRef.current = false;

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

    // Bail out immediately if audio was stopped (user closed/navigated away)
    if (stoppedRef.current) {
      console.log('[Voice] Speak cancelled - audio was stopped');
      return;
    }

    // 1. Acquire lock - only one speak at a time (matches original PWA)
    await acquireSpeakLock();

    // Check again after acquiring lock - user might have closed while waiting
    if (stoppedRef.current) {
      console.log('[Voice] Speak cancelled after lock - audio was stopped');
      releaseSpeakLock();
      return;
    }

    try {
      // 2. Set state FIRST (before stopping recognition) - matches original PWA
      setStatus('speaking');

      // 3. Reset stopped flag - we're intentionally speaking now
      stoppedRef.current = false;

      // 4. Kill any existing audio and stop recognition - matches original PWA
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
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

        // Check if stopped while fetching - don't play if user already exited
        if (stoppedRef.current) {
          console.log('[Voice] Audio stopped before playback - user exited');
          return;
        }

        const audioBlob = await response.blob();

        // Check again after blob conversion
        if (stoppedRef.current) {
          console.log('[Voice] Audio stopped before playback - user exited');
          return;
        }

        // Ensure AudioContext is running before playback (Safari requirement)
        await getAudioContext();

        // Play audio and wait for completion with iOS-compatible setup
        await new Promise<void>((resolve, reject) => {
          // Final check before creating audio element
          if (stoppedRef.current) {
            resolve();
            return;
          }

          const url = URL.createObjectURL(audioBlob);
          const audio = new Audio();
          audioRef.current = audio;

          // iOS Safari audio configuration
          audio.preload = 'auto';
          (audio as any).playsInline = true;  // iOS requirement
          (audio as any).webkitPlaysInline = true;  // Older iOS Safari

          audio.onended = () => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            resolve();
          };

          audio.onerror = (err) => {
            console.error('[Voice] Audio playback error:', err);
            URL.revokeObjectURL(url);
            audioRef.current = null;
            reject(err);
          };

          // Handle load properly before playing
          audio.oncanplaythrough = () => {
            // CRITICAL: play() must NOT have async work before it
            // The user gesture token expires if we await anything
            const playPromise = audio.play();
            if (playPromise) {
              playPromise.catch((err) => {
                // Handle NotAllowedError specifically
                if (err.name === 'NotAllowedError') {
                  console.warn('[Voice] Audio play blocked by browser - need user gesture');
                  // Don't reject - fall through to browser TTS
                  URL.revokeObjectURL(url);
                  audioRef.current = null;
                  reject(new Error('NotAllowedError'));
                } else if (err.name === 'AbortError') {
                  // AbortError is normal when audio is stopped
                  console.log('[Voice] Audio playback aborted');
                  URL.revokeObjectURL(url);
                  audioRef.current = null;
                  resolve();
                } else {
                  console.error('[Voice] Audio play failed:', err);
                  URL.revokeObjectURL(url);
                  audioRef.current = null;
                  reject(err);
                }
              });
            }
          };

          // Set source AFTER setting up event handlers
          audio.src = url;
          audio.load();  // Explicitly load for iOS Safari
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
  }, [acquireSpeakLock, releaseSpeakLock, stopAudio, pauseListening, resumeListening, speakBrowser, playReadyBeep, setStatus]);

  const setThinking = useCallback(() => setStatus('thinking'), [setStatus]);

  // CRITICAL: Stop all audio immediately when user leaves/closes page
  // This prevents the horrible UX of audio continuing after window close
  useEffect(() => {
    // Stop everything - used for all cleanup scenarios
    const stopEverything = () => {
      console.log('[Voice] Stopping all audio and listening');
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      // Stop any playing audio immediately
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      // Stop browser speech synthesis
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
      // Set stopped flag to prevent pending TTS
      stoppedRef.current = true;
      // Stop microphone
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {}
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };

    // Handle window/tab close
    const handleBeforeUnload = () => {
      stopEverything();
    };

    // Handle tab visibility change (pause when hidden, optionally resume when visible)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('[Voice] Tab hidden - stopping audio');
        stopEverything();
      }
    };

    // Handle page navigation (pagehide is more reliable than beforeunload on mobile)
    const handlePageHide = () => {
      stopEverything();
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopEverything();
      stopListening();
    };
  }, [stopListening]);

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
// Build trigger Wed Jan 01 2026 - Voice cleanup on window close + Stop button
