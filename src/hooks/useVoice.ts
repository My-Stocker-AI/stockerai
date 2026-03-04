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

// Helper to emit diagnostic events for troubleshooting
function emitDiagnostic(type: string, data: any) {
  try {
    window.dispatchEvent(new CustomEvent('voice-diagnostic', { detail: { type, data } }));
  } catch (e) {
    // Silent fail - diagnostics are optional
  }
}

interface UseVoiceOptions {
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onWakePhrase?: (command: string | null) => void;
  continuous?: boolean;
  keywords?: string[];  // Dynamic keywords for improved recognition (route names, commands)
  environmentEndpointing?: number;  // Deepgram endpointing from environment detection (ms)
}

export function useVoice(options: UseVoiceOptions = {}) {
  const { onTranscript, onError, onWakePhrase, keywords, environmentEndpointing } = options;

  // Store callbacks in refs to avoid stale closures in WebSocket handlers
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  const onWakePhraseRef = useRef(onWakePhrase);
  const keywordsRef = useRef<string[]>(keywords || []);

  // Keep refs updated when callbacks change
  onTranscriptRef.current = onTranscript;
  onErrorRef.current = onError;
  onWakePhraseRef.current = onWakePhrase;
  keywordsRef.current = keywords || [];

  const [status, setStatusState] = useState<VoiceStatus>('idle');
  const [lastInput, setLastInput] = useState('');
  const [isSupported] = useState(true);
  const [isDeepgramConnected, setIsDeepgramConnected] = useState(false);

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
  const encodingRef = useRef<string>('opus');  // Default to opus, updated by setupMediaRecorder
  const shouldReconnectRef = useRef(true);
  const isConnectedRef = useRef(false);
  const stoppedRef = useRef(false); // Flag to prevent new audio after stopAudio()
  const isRecordingRef = useRef(false);
  const accumulatedTranscriptRef = useRef('');  // Accumulated transcript for utterance (matches original PWA this.transcript)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);  // Silence timer fallback (matches original PWA)
  // Queued command: stores the latest command spoken during 'thinking'/'speaking'
  // Fired automatically when resumeListening() completes successfully
  const pendingCommandRef = useRef<string | null>(null);

  // PRIORITY 1.2: Deepgram reconnection tracking
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tokenRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_RECONNECT_ATTEMPTS = 5;

  // Echo filtering refs (from original PWA)
  const lastSpokenTextRef = useRef('');
  const lastSpeakTimeRef = useRef(0);
  const ECHO_COOLDOWN_MS = 300;

  // TTS refs
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // TTS prefetch cache for parallel processing (Performance Priority 5)
  // Stores { text: string, promise: Promise, timestamp: number }
  const ttsPrefetchCacheRef = useRef<{ text: string; promise: Promise<Blob>; timestamp: number } | null>(null);

  // Wake Lock ref - prevents screen timeout during voice session
  const wakeLockRef = useRef<any>(null);

  const KEEPALIVE_MS = 8000;

  // Check if input is echo of what we just said (from original PWA)
  const isEcho = useCallback((text: string): boolean => {
    const lower = text.toLowerCase().trim();

    // Cooldown: ignore anything within ECHO_COOLDOWN_MS of speaking
    if (Date.now() - lastSpeakTimeRef.current < ECHO_COOLDOWN_MS) {
      console.log('[Voice] Ignoring input during cooldown');
      return true;
    }

    // Ignore very short garbage (single characters only)
    if (lower.length < 2) {
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

  // Brief acknowledgment click: plays immediately when a command is received
  // Much shorter and softer than the ready beep — confirms "I heard you"
  const playCommandChime = useCallback(async () => {
    try {
      const ctx = await getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 660; // E5 — softer than ready beep (880 Hz)
      gain.gain.value = 0.05;    // Very quiet — just enough to notice
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08); // 80ms — brief click
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) {
      console.warn('[Voice] Command chime failed:', e);
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

    const response = await fetch(DEEPGRAM_TOKEN_URL, {
      signal: AbortSignal.timeout(10000)
    });
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
    if (currentStatus !== 'listening' && currentStatus !== 'idle' && currentStatus !== 'speaking') {
      // Queue commands spoken during API processing — fire when listening resumes
      if (currentStatus === 'thinking') {
        console.log('[Voice] Command queued during thinking:', text);
        pendingCommandRef.current = text; // Keep only the latest
      } else {
        console.log('[Voice] Ignoring transcript, wrong state:', currentStatus);
      }
      return;
    }

    // Filter echo/noise (matches original PWA)
    if (isEcho(text)) {
      return;
    }

    // If TTS is playing, interrupt it immediately — driver spoke a command
    if (statusRef.current === 'speaking') {
      console.log('[Voice] Interrupting TTS — command received during playback');
      emitDiagnostic('tts-interrupted', text);
      stopAudio();
      setStatus('listening');
    }
    // Play acknowledgment chime — immediate audio feedback that command was heard
    playCommandChime();
    // Pass to handler - use ref to avoid stale closure
    onTranscriptRef.current?.(text, true);
  }, [hasWakePhrase, extractWakeCommand, isEcho, playCommandChime, stopAudio, setStatus]); // Removed callback deps - using refs

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
          emitDiagnostic('transcript', transcript.trim());

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

          // Reset silence timer (fallback for when utterance_end doesn't fire)
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            processAccumulatedTranscript();
          }, 200);  // 200ms silence timer (reduced from 300ms for faster response - Performance Priority 2)
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

    // Determine encoding for Deepgram based on MIME type
    if (mimeType.includes('opus')) {
      encodingRef.current = 'opus';
    } else if (mimeType.includes('mp4') || mimeType.includes('aac')) {
      encodingRef.current = 'aac';
    } else if (mimeType.includes('wav')) {
      encodingRef.current = 'linear16';
    } else {
      encodingRef.current = 'opus';  // Default fallback
    }

    try {
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(audioStreamRef.current, options);

      console.log('[Voice] MediaRecorder created with options:', options, 'encoding:', encodingRef.current);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error('[Voice] MediaRecorder error:', event);
        emitDiagnostic('error', 'MediaRecorder error');
        onErrorRef.current?.('MediaRecorder error');
      };

      recorder.onstart = () => {
        emitDiagnostic('mediarecorder-state', 'recording');
      };

      recorder.onstop = () => {
        emitDiagnostic('mediarecorder-state', 'stopped');
      };

      recorder.onpause = () => {
        emitDiagnostic('mediarecorder-state', 'paused');
      };

      // Stop any existing recorder before replacing (prevents duplicate audio streams on reconnect)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.ondataavailable = null; // Prevent buffered audio from replaying to new socket
          mediaRecorderRef.current.stop();
        } catch (e) {
          // Ignore - just cleaning up stale recorder
        }
      }
      mediaRecorderRef.current = recorder;
      recorder.start(100);
      isRecordingRef.current = true;
      console.log('[Voice] MediaRecorder started');
    } catch (e: any) {
      console.error('[Voice] Failed to create MediaRecorder:', e);
      emitDiagnostic('error', 'MediaRecorder setup failed: ' + String(e));
      onErrorRef.current?.(e.message || 'Failed to start recording');
    }
  }, [getSupportedMimeType]); // Using ref, no deps needed

  const connectDeepgram = useCallback(async () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const token = await ensureToken();
    if (!token) throw new Error('No token available');

    // Build keywords list: common commands + dynamic route names + products
    // CRITICAL: top/bottom are highest priority (3x boost via separate parameter)
    const criticalKeywords = ['top', 'bottom', 'beginning', 'end'];
    const baseKeywords = [
      // Directions and positions
      'south', 'north', 'east', 'west',
      // Commands
      'next', 'done', 'skip', 'yes', 'no', 'start', 'stop', 'continue',
      'undo', 'back', 'go back', 'switch', 'route', 'machine', 'progress',
      // Clarification/Repeat commands
      'repeat', 'again', 'what was that', 'say that again', 'say again',
      // Common responses
      'got it', 'okay', 'yep', 'perfect', 'good', 'alright',
      // Common vending machine products (improve recognition)
      'Doritos', 'Cheetos', 'Lays', 'Fritos', 'Pringles', 'Ruffles',
      'Snickers', 'Twix', 'KitKat', 'Reeses', 'Milky Way', 'Skittles', 'M&Ms',
      'Coke', 'Pepsi', 'Sprite', 'Fanta', 'Mountain Dew', 'Dr Pepper',
      'Gatorade', 'Powerade', 'water', 'Red Bull', 'Monster',
      'Takis', 'Tostitos', 'Sunchips', 'Popcorn', 'pretzels',
      'Snack', 'candy', 'chips', 'soda', 'drink', 'beverage'
    ];

    // Combine base keywords with dynamic route names
    const allKeywords = [...baseKeywords, ...keywordsRef.current];

    // Build keyword parameters with different boost levels
    // Critical keywords (top/bottom) get 3x boost for better mishearing prevention
    const criticalParam = criticalKeywords.length > 0
      ? `&keywords=${encodeURIComponent(criticalKeywords.join(','))}&keywords_boost=3.0`
      : '';

    // Other keywords get standard 1.5x boost
    const keywordsParam = allKeywords.length > 0
      ? `&keywords=${encodeURIComponent(allKeywords.join(','))}&keywords_boost=1.5`
      : '';

    console.log('[Voice] Deepgram keywords:', {
      critical: criticalKeywords.length,
      criticalBoost: 3.0,
      standard: allKeywords.length,
      standardBoost: 1.5
    });

    // Use environment-specific endpointing value (from environment detection) or default to 100ms
    const endpointingMs = environmentEndpointing || 100;
    console.log('[Voice] Deepgram endpointing:', endpointingMs + 'ms');

    const wsUrl = 'wss://api.deepgram.com/v1/listen?' +
      'model=nova-2&' +  // Latest Nova 2 model (nova-3 not yet available)
      'language=en-US&' +
      `encoding=${encodingRef.current}&` +  // Tell Deepgram our audio format
      'smart_format=true&' +
      'interim_results=true&' +
      'vad_events=true&' +
      `endpointing=${endpointingMs}` +  // Environment-adaptive endpointing
      criticalParam +  // Critical keywords (top/bottom) with 3x boost
      keywordsParam;  // Standard keywords with 1.5x boost

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
        setIsDeepgramConnected(true);
        reconnectAttemptsRef.current = 0; // Reset reconnection counter on successful connect
        emitDiagnostic('deepgram-connected', true);
        startKeepAlive();
        setupMediaRecorder();

        // Proactive token refresh: close and reconnect 90s before token expires.
        // Only fires when status is safe (between commands) to avoid disrupting active operations.
        if (tokenRefreshTimerRef.current) clearTimeout(tokenRefreshTimerRef.current);
        const msUntilRefresh = tokenExpiryRef.current - Date.now() - 90000;
        if (msUntilRefresh > 0) {
          const SAFE_STATUSES = ['listening', 'paused', 'muted'];
          const attemptTokenRefresh = () => {
            if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !shouldReconnectRef.current) {
              return; // Socket already closed or stopped — nothing to do
            }
            if (SAFE_STATUSES.includes(statusRef.current)) {
              // Safe to refresh now (user is between commands)
              console.log('[Voice] Proactive token refresh: closing socket for fresh token (status:', statusRef.current, ')');
              emitDiagnostic('token-refresh', 'proactive');
              tokenExpiryRef.current = 0; // Force ensureToken to fetch fresh token on next connect
              reconnectAttemptsRef.current = 0; // Reset counter — proactive refresh is not a failure
              socketRef.current.close(1000, 'Token refresh');
            } else {
              // Not safe yet (speaking/thinking) — poll again in 3s
              console.log('[Voice] Proactive token refresh deferred (status:', statusRef.current, ') — retrying in 3s');
              tokenRefreshTimerRef.current = setTimeout(attemptTokenRefresh, 3000);
            }
          };
          tokenRefreshTimerRef.current = setTimeout(attemptTokenRefresh, msUntilRefresh);
        }

        resolve();
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleDeepgramMessage(data);
        } catch (e) {}
      };

      socket.onerror = (event) => {
        clearTimeout(timeout);
        emitDiagnostic('error', 'Deepgram WebSocket error');
        onErrorRef.current?.('WebSocket error');
      };

      socket.onclose = (event) => {
        clearTimeout(timeout);
        isConnectedRef.current = false;
        setIsDeepgramConnected(false);
        isRecordingRef.current = false;

        // Enhanced logging for diagnostics
        const timestamp = new Date().toISOString();
        console.warn('[Voice] Deepgram WebSocket closed:', {
          timestamp,
          code: event.code,
          reason: event.reason || 'No reason provided',
          wasClean: event.wasClean,
          reconnectAttempt: reconnectAttemptsRef.current,
          currentStatus: statusRef.current
        });

        emitDiagnostic('deepgram-disconnected', {
          timestamp,
          code: event.code,
          reason: event.reason,
          reconnectAttempt: reconnectAttemptsRef.current
        });
        stopKeepAlive();

        // PRIORITY 1.2: Enhanced reconnection logic with exponential backoff
        const currentStatus = statusRef.current;
        if (shouldReconnectRef.current && (currentStatus === 'listening' || currentStatus === 'paused' || currentStatus === 'muted' || currentStatus === 'thinking')) {

          // Check if we've exceeded max attempts
          if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            console.warn('[Voice] Max reconnect attempts reached — waiting 30s before recovery attempt', {
              timestamp,
              totalAttempts: reconnectAttemptsRef.current,
              maxAttempts: MAX_RECONNECT_ATTEMPTS
            });
            emitDiagnostic('reconnect-max-reached', { timestamp, attempts: reconnectAttemptsRef.current });
            // Don't give up permanently — schedule recovery after 30s
            // This handles transient network issues (dead zones, cellular handoff) in long sessions
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
            }
            reconnectTimeoutRef.current = setTimeout(() => {
              if (shouldReconnectRef.current) {
                console.log('[Voice] Recovery attempt after max retries — restarting connection');
                emitDiagnostic('reconnect-recovery', { timestamp: new Date().toISOString() });
                reconnectAttemptsRef.current = 0;
                startListening();
              }
            }, 30000);
            return;
          }

          // Calculate exponential backoff: 1s, 2s, 4s, 8s, 16s
          const backoffMs = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 16000);
          reconnectAttemptsRef.current++;

          console.log(`[Voice] Deepgram disconnected - reconnecting in ${backoffMs}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`, {
            timestamp,
            backoffMs,
            attempt: reconnectAttemptsRef.current,
            maxAttempts: MAX_RECONNECT_ATTEMPTS,
            nextRetryAt: new Date(Date.now() + backoffMs).toISOString()
          });
          emitDiagnostic('deepgram-reconnecting', { attempt: reconnectAttemptsRef.current, backoffMs, timestamp });

          // Clear any existing reconnect timeout
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }

          reconnectTimeoutRef.current = setTimeout(async () => {
            try {
              await connectDeepgram();
              // Success - reset attempts counter
              reconnectAttemptsRef.current = 0;
              console.log('[Voice] Deepgram reconnected successfully');
              emitDiagnostic('deepgram-reconnected', 'success');
            } catch (e) {
              console.error('[Voice] Deepgram reconnection failed:', e);
              emitDiagnostic('error', 'Deepgram reconnection failed: ' + String(e));
              // socket.onclose will fire again and retry with next backoff
            }
          }, backoffMs);
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
        sampleRate: 48000  // HD audio quality for better word recognition
      }
    });
    audioStreamRef.current = stream;
    return stream;
  }, []);

  const startListening = useCallback(async () => {
    console.log('[Voice] startListening called');

    // STOP FIX: Reset all state flags to clean state
    stoppedRef.current = false;
    shouldReconnectRef.current = true;
    isConnectedRef.current = false;
    reconnectAttemptsRef.current = 0;
    accumulatedTranscriptRef.current = '';

    // STOP FIX: Clear any pending reconnect timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // CRITICAL: Request wake lock to prevent screen timeout during voice session
    // Hands-free operation requires screen to stay awake for continuous picking
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('[Voice] Wake lock acquired - screen will stay awake');

        // Re-acquire wake lock automatically when released (screen dim, power button, etc.)
        wakeLockRef.current.addEventListener('release', async () => {
          console.log('[Voice] Wake lock released — attempting re-acquisition');
          if (shouldReconnectRef.current) {
            try {
              wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
              console.log('[Voice] Wake lock re-acquired successfully');
            } catch (e: any) {
              console.warn('[Voice] Wake lock re-acquisition failed:', e.message);
            }
          }
        });
      } catch (e: any) {
        console.warn('[Voice] Wake lock failed (not critical):', e.message);
        // Not critical - continue without wake lock
      }
    } else {
      console.warn('[Voice] Wake Lock API not supported - screen may timeout');
    }

    // Unlock audio for Safari (must happen on user gesture)
    await unlockAudio();

    try {
      // Get or reuse existing stream (Safari multiple stream bug fix)
      const stream = await getOrCreateAudioStream();
      console.log('[Voice] Audio stream obtained:', stream.getTracks().length, 'tracks');

      await connectDeepgram();
      console.log('[Voice] Deepgram connected successfully');

      setStatus('listening');
      setIsDeepgramConnected(true);

      console.log('[Voice] startListening complete - voice active');
      return true;
    } catch (error: any) {
      console.error('[Voice] startListening failed:', error);

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
    console.log('[Voice] stopListening called - cleaning up resources');
    shouldReconnectRef.current = false;
    stopKeepAlive();

    // Clear silence timer and accumulated transcript
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    accumulatedTranscriptRef.current = '';
    pendingCommandRef.current = null; // Clear any queued commands

    // STOP FIX: Clear reconnect timeout to prevent interference
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (tokenRefreshTimerRef.current) {
      clearTimeout(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
        console.log('[Voice] MediaRecorder stopped');
      } catch (e) {
        console.warn('[Voice] MediaRecorder stop error:', e);
      }
    }
    mediaRecorderRef.current = null;
    isRecordingRef.current = false;

    if (socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'CloseStream' }));
      }
      socketRef.current.close();
      socketRef.current = null;
      console.log('[Voice] WebSocket closed');
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('[Voice] Audio track stopped:', track.kind);
      });
      audioStreamRef.current = null;
    }

    // Release wake lock when stopping voice session
    if (wakeLockRef.current) {
      try {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('[Voice] Wake lock released - screen can timeout again');
      } catch (e) {
        console.warn('[Voice] Failed to release wake lock:', e);
      }
    }

    // STOP FIX: Reset connection state flags
    isConnectedRef.current = false;
    setIsDeepgramConnected(false);

    setStatus('idle');
    console.log('[Voice] stopListening complete - status set to idle');
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

    // Release wake lock when pausing (allow screen timeout during breaks)
    if (wakeLockRef.current) {
      try {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('[Voice] Wake lock released on pause');
      } catch (e) {
        console.warn('[Voice] Failed to release wake lock on pause:', e);
      }
    }

    setLastInput('');
    setStatus('paused');
  }, [setStatus]);

  const resumeListening = useCallback(async () => {
    // Re-acquire wake lock when resuming (keep screen awake again)
    if ('wakeLock' in navigator && !wakeLockRef.current) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('[Voice] Wake lock re-acquired on resume');
      } catch (e: any) {
        console.warn('[Voice] Wake lock re-acquisition failed:', e.message);
      }
    }

    // CRITICAL: Check if AudioContext is suspended (Safari auto-suspends after idle)
    // If suspended, we need a new user gesture to resume it
    if (audioContextRef.current?.state === 'suspended') {
      console.warn('[Voice] AudioContext is suspended - need user gesture to resume');
      emitDiagnostic('error', 'AudioContext suspended - tap screen to resume');

      // Try to resume anyway (will fail without user gesture, but worth trying)
      try {
        await audioContextRef.current.resume();
        console.log('[Voice] AudioContext resumed successfully');
      } catch (e) {
        console.error('[Voice] Cannot resume AudioContext without user gesture:', e);
        // Don't set status to listening since it won't actually work
        onErrorRef.current?.('Tap screen to resume voice');
        return;
      }
    }

    if (mediaRecorderRef.current?.state === 'paused' && socketRef.current?.readyState === WebSocket.OPEN) {
      // Socket alive AND recorder paused — safe to resume
      mediaRecorderRef.current.resume();
      isRecordingRef.current = true;
      setStatus('listening');
      // Fire any command that was spoken during processing/TTS
      if (pendingCommandRef.current) {
        const queued = pendingCommandRef.current;
        pendingCommandRef.current = null;
        console.log('[Voice] Firing queued command after resume:', queued);
        playCommandChime(); // Acknowledge the queued command
        setTimeout(() => onTranscriptRef.current?.(queued, true), 0);
      }
    } else if (mediaRecorderRef.current?.state === 'paused') {
      // Recorder paused BUT socket dead — stop recorder and do full reconnect
      console.warn('[Voice] resumeListening: socket dead while recorder paused — doing full reconnect');
      emitDiagnostic('zombie-state-detected', 'recorder-paused-socket-dead');
      try {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.stop();
      } catch (e) {
        // Ignore — just cleaning up stale recorder
      }
      mediaRecorderRef.current = null;
      isRecordingRef.current = false;
      startListening();
    } else if (!mediaRecorderRef.current && socketRef.current?.readyState === WebSocket.OPEN) {
      setupMediaRecorder();
      setStatus('listening');
      // Fire any command that was spoken during processing/TTS
      if (pendingCommandRef.current) {
        const queued = pendingCommandRef.current;
        pendingCommandRef.current = null;
        console.log('[Voice] Firing queued command after resume:', queued);
        playCommandChime(); // Acknowledge the queued command
        setTimeout(() => onTranscriptRef.current?.(queued, true), 0);
      }
    } else if (!isConnectedRef.current) {
      pendingCommandRef.current = null; // Clear stale queued command — full reconnect needed, command too old to replay
      startListening();
    }
  }, [setupMediaRecorder, startListening, setStatus, playCommandChime]);

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
    if (mediaRecorderRef.current?.state === 'paused' && socketRef.current?.readyState === WebSocket.OPEN) {
      // Socket alive — safe to resume
      mediaRecorderRef.current.resume();
      isRecordingRef.current = true;
    } else if (mediaRecorderRef.current?.state === 'paused') {
      // Socket dead — stop stale recorder and do full reconnect
      console.warn('[Voice] unmute: socket dead while recorder paused — doing full reconnect');
      emitDiagnostic('zombie-state-detected', 'unmute-recorder-paused-socket-dead');
      try {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.stop();
      } catch (e) { /* Ignore — cleaning up stale recorder */ }
      mediaRecorderRef.current = null;
      isRecordingRef.current = false;
      startListening();
      return; // startListening sets its own status
    }
    setStatus('listening');
  }, [setStatus, startListening]);

  const stopAudio = useCallback(() => {
    // Set stopped flag to prevent any pending TTS from playing
    stoppedRef.current = true;

    // Clear the speak queue to prevent queued TTS from starting
    speakQueueRef.current = [];
    speakLockRef.current = false;

    if (audioRef.current) {
      try {
        // Handle both HTMLAudioElement and Web Audio API AudioBufferSourceNode
        if ('pause' in audioRef.current) {
          // HTMLAudioElement
          audioRef.current.pause();
          audioRef.current.src = '';
        } else if ('stop' in audioRef.current) {
          // AudioBufferSourceNode from Web Audio API
          audioRef.current.stop();
        }
      } catch (e) {
        // Ignore errors - source might already be stopped
      }
      audioRef.current = null;
    }
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }, []);

  const speakBrowser = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      // Timeout: Chrome onend is unreliable and can hang indefinitely
      const timeout = setTimeout(() => {
        console.warn('[Voice] speakBrowser timeout (15s) — forcing resolve');
        try { window.speechSynthesis.cancel(); } catch (e) {}
        resolve();
      }, 15000);

      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.onend = () => { clearTimeout(timeout); resolve(); };
        utterance.onerror = () => { clearTimeout(timeout); resolve(); };
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        clearTimeout(timeout);
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
        // Timeout: prevent deadlock if current speak() hangs
        const timeout = setTimeout(() => {
          console.warn('[Voice] acquireSpeakLock timeout (20s) — force-releasing lock');
          speakLockRef.current = true; // Take the lock for ourselves
          speakQueueRef.current = []; // Clear stale queue
          resolve();
        }, 20000);

        speakQueueRef.current.push(() => {
          clearTimeout(timeout);
          resolve();
        });
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
        try {
          // Handle both HTMLAudioElement and Web Audio API AudioBufferSourceNode
          if ('pause' in audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
          } else if ('stop' in audioRef.current) {
            audioRef.current.stop();
          }
        } catch (e) {
          // Ignore errors - source might already be stopped
        }
        audioRef.current = null;
      }

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

      // 5a. Set echo references BEFORE playback so filtering works during TTS
      // (MediaRecorder stays active during playback for interrupt support)
      lastSpokenTextRef.current = processed.toLowerCase();
      lastSpeakTimeRef.current = Date.now();

      // 5. Fetch and play audio (with prefetch optimization - Performance Priority 5)
      try {
        emitDiagnostic('spoken', processed);

        let audioBlob: Blob;

        // Check if TTS was prefetched (parallel optimization)
        if (ttsPrefetchCacheRef.current && ttsPrefetchCacheRef.current.text === processed) {
          console.log('[Voice] 🎯 Using prefetched TTS (saved ~200-400ms)');
          try {
            audioBlob = await ttsPrefetchCacheRef.current.promise;
            ttsPrefetchCacheRef.current = null; // Clear cache after use
          } catch (err) {
            // Prefetch failed, fall back to normal fetch
            console.warn('[Voice] Prefetch promise rejected, falling back to normal fetch');
            ttsPrefetchCacheRef.current = null;
            throw err; // Will be caught by outer try-catch and retry
          }
        } else {
          // No prefetch available, fetch normally
          if (ttsPrefetchCacheRef.current) {
            console.log('[Voice] TTS prefetch cache miss (different text or expired)');
          }

          const response = await fetch(TTS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: processed, voice: 'nova' }),
            signal: AbortSignal.timeout(15000)
          });

          if (!response.ok) {
            emitDiagnostic('error', 'TTS fetch failed: ' + response.status);
            throw new Error('TTS failed');
          }

          // Check if stopped while fetching - don't play if user already exited
          if (stoppedRef.current) {
            console.log('[Voice] Audio stopped before playback - user exited');
            return;
          }

          audioBlob = await response.blob();
        }

        // Check again after blob conversion
        if (stoppedRef.current) {
          console.log('[Voice] Audio stopped before playback - user exited');
          return;
        }

        // CRITICAL FIX FOR ANDROID SPEAKERPHONE ROUTING
        // Web Audio API routes to earpiece when mic is active on Android
        // HTMLAudioElement routes to speakerphone by default
        // Use HTMLAudioElement on Android for proper speakerphone routing

        const isAndroid = /android/i.test(navigator.userAgent);

        if (isAndroid) {
          // ANDROID: Use HTMLAudioElement for speakerphone routing
          console.log('[Voice] Android detected - using HTMLAudioElement for speakerphone routing');

          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);

          // Get user's volume preference (default: 1.5 = 150%)
          const volumeMultiplier = parseFloat(localStorage.getItem('stocker-tts-volume') || '1.5');
          audio.volume = Math.min(volumeMultiplier, 1.0); // HTML5 Audio max is 1.0

          console.log('[Voice] HTMLAudioElement volume:', audio.volume);

          // Store reference for cleanup
          audioRef.current = audio as any;

          await new Promise<void>((resolve, reject) => {
            if (stoppedRef.current) {
              URL.revokeObjectURL(audioUrl);
              resolve();
              return;
            }

            audio.onended = () => {
              URL.revokeObjectURL(audioUrl);
              audioRef.current = null;
              resolve();
            };

            audio.onerror = (err) => {
              URL.revokeObjectURL(audioUrl);
              audioRef.current = null;
              reject(err);
            };

            // Play immediately (must be synchronous from user gesture)
            const playPromise = audio.play();
            if (playPromise) {
              playPromise
                .then(() => {
                  console.log('[Voice] HTMLAudioElement playback started (speakerphone)');
                })
                .catch(err => {
                  console.error('[Voice] HTMLAudioElement playback failed:', err);
                  URL.revokeObjectURL(audioUrl);
                  audioRef.current = null;
                  reject(err);
                });
            }
          });

        } else {
          // iOS/DESKTOP: Use Web Audio API (better quality, works fine on iOS)
          console.log('[Voice] iOS/Desktop - using Web Audio API');

          // Reuse existing AudioContext if healthy — creating a new one on every speak() adds latency
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          let audioContext: AudioContext;
          if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContext = new AudioContextClass({ sampleRate: 44100 });
            audioContextRef.current = audioContext;
            console.log('[Voice] AudioContext created (new or was closed)');
          } else {
            audioContext = audioContextRef.current;
            if (audioContext.state === 'suspended') {
              try {
                await audioContext.resume();
                console.log('[Voice] AudioContext resumed for playback');
              } catch (e) {
                console.warn('[Voice] AudioContext resume failed:', e);
              }
            }
            console.log('[Voice] AudioContext reused (state:', audioContext.state, ')');
          }

          await new Promise<void>((resolve, reject) => {
            if (stoppedRef.current) {
              resolve();
              return;
            }

            audioBlob.arrayBuffer().then(arrayBuffer => {
              if (stoppedRef.current) {
                resolve();
                return;
              }

              audioContext.decodeAudioData(arrayBuffer).then(audioBuffer => {
                if (stoppedRef.current) {
                  resolve();
                  return;
                }

                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                const gainNode = audioContext.createGain();

                // Get user's volume preference
                const volumeMultiplier = parseFloat(localStorage.getItem('stocker-tts-volume') || '1.5');
                gainNode.gain.value = volumeMultiplier;

                console.log('[Voice] Web Audio volume:', volumeMultiplier);

                source.connect(gainNode);
                gainNode.connect(audioContext.destination);
                audioRef.current = source as any;

                source.onended = () => {
                  audioRef.current = null;
                  resolve();
                };

                try {
                  source.start(0);
                  console.log('[Voice] Web Audio API playback started');
                } catch (err: any) {
                  console.error('[Voice] Web Audio playback failed:', err);
                  audioRef.current = null;
                  reject(err);
                }
              }).catch(err => {
                console.error('[Voice] Audio decode failed:', err);
                reject(err);
              });
            }).catch(err => {
              console.error('[Voice] Array buffer conversion failed:', err);
              reject(err);
            });
          });
        }

      } catch (error) {
        // Fallback to browser TTS — use processed text so pronunciation corrections apply
        await speakBrowser(processed);
      }

      // 7. Done speaking - transition back to listening (matches original PWA)
      setStatus('listening');

      // 8. Play ready beep (matches original PWA)
      playReadyBeep();

      // 9. Wait before restarting recognition (matches original PWA)
      await new Promise(r => setTimeout(r, 100));

      // 10. Restart recognition (matches original PWA)
      await resumeListening();

    } catch (outerError) {
      console.error('[Voice] Speak failed:', outerError);
    } finally {
      // CRITICAL: Always reset from 'speaking' state to prevent permanent voice lockout
      // If status is still 'speaking' here, something threw before setStatus('listening')
      if (!stoppedRef.current && statusRef.current === 'speaking') {
        console.warn('[Voice] Resetting stuck speaking state in finally block');
        setStatus('listening');
        try { await resumeListening(); } catch (e) { /* best effort */ }
      }
      // Always release lock (matches original PWA unlock in finally)
      releaseSpeakLock();
    }
  }, [acquireSpeakLock, releaseSpeakLock, stopAudio, pauseListening, resumeListening, speakBrowser, playReadyBeep, setStatus]);

  // Prefetch TTS audio in parallel to reduce latency (Performance Priority 5)
  // Starts TTS fetch immediately when result is available, before speak() is called
  const prefetchTTS = useCallback((text: string): void => {
    if (!text || !text.trim()) return;

    // Don't prefetch if audio was stopped (user closed/navigated away)
    if (stoppedRef.current) {
      console.log('[Voice] TTS prefetch cancelled - audio was stopped');
      return;
    }

    // Preprocess text (same as speak function)
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

    console.log('[Voice] 🚀 Prefetching TTS for:', processed.substring(0, 50) + '...');

    // Start fetch (don't await - fire and forget)
    const fetchPromise = fetch(TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: processed, voice: 'nova' }),
      signal: AbortSignal.timeout(15000)
    })
      .then(response => {
        if (!response.ok) throw new Error('TTS prefetch failed: ' + response.status);
        return response.blob();
      })
      .then(blob => {
        console.log('[Voice] ✅ TTS prefetch completed');
        return blob;
      })
      .catch(err => {
        console.warn('[Voice] TTS prefetch failed (will retry on speak):', err);
        // Clear cache on error so speak() will retry
        ttsPrefetchCacheRef.current = null;
        throw err;
      });

    // Cache the promise
    ttsPrefetchCacheRef.current = {
      text: processed,
      promise: fetchPromise,
      timestamp: Date.now()
    };

    // Auto-invalidate cache after 5 seconds (prevent stale TTS if user delays)
    setTimeout(() => {
      if (ttsPrefetchCacheRef.current && ttsPrefetchCacheRef.current.text === processed) {
        console.log('[Voice] TTS prefetch cache expired');
        ttsPrefetchCacheRef.current = null;
      }
    }, 5000);
  }, []);

  const setThinking = useCallback(() => setStatus('thinking'), [setStatus]);

  // PRIORITY 1.1: AudioContext Health Monitoring
  // Safari/iOS auto-suspends AudioContext after 30s idle or on screen lock
  // This detects suspension and auto-resumes to prevent silent failures
  useEffect(() => {
    const healthCheckInterval = setInterval(() => {
      if (audioContextRef.current) {
        const state = audioContextRef.current.state;

        // Only check when we expect audio to work (not idle)
        const currentStatus = statusRef.current;
        const expectingAudio = currentStatus === 'listening' || currentStatus === 'speaking';

        if (expectingAudio && state === 'suspended') {
          console.warn('[Voice] AudioContext suspended during active session - attempting resume');
          emitDiagnostic('audiocontext-suspended', { status: currentStatus });

          // Attempt to resume (may fail without user gesture, but worth trying)
          audioContextRef.current.resume()
            .then(() => {
              console.log('[Voice] AudioContext auto-resumed successfully');
              emitDiagnostic('audiocontext-resumed', 'auto');
            })
            .catch((err) => {
              console.error('[Voice] AudioContext auto-resume failed - need user gesture:', err);
              emitDiagnostic('audiocontext-resume-failed', 'needs-gesture');
              // Don't throw error to user unless they try to speak/listen
            });
        }
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(healthCheckInterval);
  }, []);

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
      // CRITICAL: Close AudioContext to prevent contaminated context persisting
      // When PWA is closed/backgrounded, the AudioContext with earpiece routing stays in memory
      // Closing it ensures fresh AudioContext on reopen → speakerphone routing restored
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close();
          console.log('[Voice] AudioContext closed on cleanup');
        } catch (e) {
          console.warn('[Voice] Failed to close AudioContext:', e);
        }
        audioContextRef.current = null;
      }
    };

    // Handle window/tab close
    const handleBeforeUnload = () => {
      stopEverything();
    };

    // REMOVED: handleVisibilityChange - was causing false positives during active picking
    // Browser was falsely detecting tab as hidden after ~3.5 minutes of activity
    // Wake lock prevents screen timeout, beforeunload/pagehide handle actual navigation
    // const handleVisibilityChange = () => {
    //   if (document.hidden) {
    //     console.log('[Voice] Tab hidden - stopping audio');
    //     stopEverything();
    //   }
    // };

    // Handle page navigation (pagehide is more reliable than beforeunload on mobile)
    const handlePageHide = () => {
      stopEverything();
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    // REMOVED: visibilitychange listener - was stopping voice during active picking
    // document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      // REMOVED: visibilitychange cleanup (listener no longer added)
      // document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Clear reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      stopEverything();
      stopListening();
    };
  }, [stopListening]);

  return {
    status,
    lastInput,
    isSupported,
    isDeepgramConnected,
    startListening,
    stopListening,
    pauseListening,
    resumeListening,
    mute,
    unmute,
    speak,
    prefetchTTS,  // Performance Priority 5: Parallel TTS initiation
    stopAudio,
    setThinking,
    setStatus,
    playBeep,
    playSuccessBeep,
    playErrorBeep,
    playReadyBeep,
    hasWakePhrase,
    extractWakeCommand,
    unlockAudio  // Export for manual audio unlock on iOS/Safari
  };
}
// Build trigger Wed Jan 01 2026 - Voice cleanup on window close + Stop button
