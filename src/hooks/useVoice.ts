import { useState, useCallback, useRef, useEffect } from 'react';
import { readEnvVoiceTuning, EnvVoiceTuning } from '@/lib/settingsCore';
import { gentleReconnect, shouldReconnectFromStatus } from './reconnectPolicy';
import { watchdogAction, recoverStatus, resolveHandoffCommand, WATCHDOG_STUCK_THRESHOLD_MS } from './voiceHandoffPolicy';
import { accumulateTranscript } from './transcriptAccumulator';

export type VoiceStatus = 'idle' | 'listening' | 'speaking' | 'thinking' | 'paused' | 'muted' | 'error';

// TTS via Cloudflare Worker (same as original PWA)
const TTS_URL = 'https://solitary-base-799c.russ-731.workers.dev';

// Deepgram STT via Cloudflare Worker (same as original PWA)
const DEEPGRAM_TOKEN_URL = 'https://stocker-deepgram-stt.russ-731.workers.dev/token';

// Build marker — bump alongside package.json "version" and sw.js SW_VERSION on each deploy.
// Emitted to the diagnostic pipe on startListening so Davy's Render logs show EXACTLY which
// build his phone is running (kills the "tested stale code" trap).
const BUILD_VERSION = 'v0.1.0-rawpcm';

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
  preferredDeviceId?: string;  // Optional: force a specific mic (from a pre-flight mic check). Undefined = default device (unchanged behavior).
}

export function useVoice(options: UseVoiceOptions = {}) {
  const { onTranscript, onError, onWakePhrase, keywords, environmentEndpointing, preferredDeviceId } = options;

  // Store callbacks in refs to avoid stale closures in WebSocket handlers
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  const onWakePhraseRef = useRef(onWakePhrase);
  const keywordsRef = useRef<string[]>(keywords || []);
  const preferredDeviceIdRef = useRef<string | undefined>(preferredDeviceId);

  // Keep refs updated when callbacks change
  onTranscriptRef.current = onTranscript;
  onErrorRef.current = onError;
  onWakePhraseRef.current = onWakePhrase;
  keywordsRef.current = keywords || [];
  preferredDeviceIdRef.current = preferredDeviceId;

  const [status, setStatusState] = useState<VoiceStatus>('idle');
  const [lastInput, setLastInput] = useState('');
  const [isSupported] = useState(true);
  const [isDeepgramConnected, setIsDeepgramConnected] = useState(false);

  // Status ref to avoid stale closures in WebSocket callbacks (matches original PWA this.state pattern)
  const statusRef = useRef<VoiceStatus>('idle');
  // Watchdog bookkeeping (branch 5): timestamp of when status last LEFT 'listening', so the
  // watchdog can tell a brief legitimate 'thinking' window from a real stuck-freeze. Null while
  // listening. See voiceHandoffPolicy.watchdogAction.
  const stuckSinceRef = useRef<number | null>(null);
  const setStatus = useCallback((newStatus: VoiceStatus) => {
    if (newStatus === 'listening') {
      stuckSinceRef.current = null;
    } else if (statusRef.current === 'listening') {
      // First tick leaving 'listening' — start the stuck clock.
      stuckSinceRef.current = Date.now();
    }
    statusRef.current = newStatus;
    setStatusState(newStatus);
  }, []);

  // Deepgram refs
  const socketRef = useRef<WebSocket | null>(null);
  // Raw-PCM capture via AudioWorklet (replaces MediaRecorder — see public/pcm-capture-processor.js).
  // A dedicated capture AudioContext keeps the mic path fully separate from the TTS playback
  // context, so playback routing (Android speaker vs iOS earpiece) is untouched.
  const captureCtxRef = useRef<AudioContext | null>(null);
  const captureSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const captureNodeRef = useRef<AudioWorkletNode | null>(null);
  // Pause/mute gate: when false, captured PCM is dropped instead of sent. The worklet keeps
  // running, so pause/resume never tears down or re-acquires the mic (grabbed ONCE per session).
  const micSendingRef = useRef(false);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const keepAliveRef = useRef<NodeJS.Timeout | null>(null);
  const tokenRef = useRef<string | null>(null);
  const tokenExpiryRef = useRef<number>(0);       // when to PROACTIVELY refresh (60s early)
  const tokenRawExpiryRef = useRef<number>(0);    // when the token ACTUALLY expires
  const shouldReconnectRef = useRef(true);
  const isConnectedRef = useRef(false);
  // Always-current pointer to startListening so the screen-wake handler can trigger a
  // clean reconnect without capturing a stale closure.
  const startListeningRef = useRef<(() => Promise<boolean>) | null>(null);
  const stoppedRef = useRef(false); // Flag to prevent new audio after stopAudio()
  const isRecordingRef = useRef(false);
  const accumulatedTranscriptRef = useRef('');  // Accumulated transcript for utterance (matches original PWA this.transcript)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);  // Silence timer fallback (matches original PWA)
  // Queued command: stores the latest command spoken during 'thinking'/'speaking'
  // Fired automatically when resumeListening() completes successfully
  const pendingCommandRef = useRef<string | null>(null);
  // Branch 3: true while the app is awaiting a top/bottom answer at a machine hand-off. The
  // parent (StockerApp) sets it from voiceHandoffPolicy.shouldRunDirectionDetection. When set, a
  // direction command spoken during a transient 'thinking' window dispatches instead of being
  // queued-and-stranded.
  const awaitingDirectionRef = useRef(false);
  const setAwaitingDirection = useCallback((v: boolean) => { awaitingDirectionRef.current = v; }, []);

  // PRIORITY 1.2: Deepgram reconnection tracking
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tokenRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Single-flight connection guard: only ONE connect/reconnect attempt may run at a time.
  // Without it, the drop-handler, the resume path, AND "OK Stocker"/unmute each fire their
  // own reconnect → stacked loops pile up sockets → Deepgram refuses them all (the 1006
  // storm that never recovers, proven in the 2026-06-30 device logs).
  const isConnectingRef = useRef(false);

  // Single-voice lock: only ONE app instance (tab / reload / PWA) may speak or listen
  // at a time. Two instances both greeting on resume = the "two voices talking over each
  // other" the driver hears (proven: two distinct session tags greeted 9s apart in the
  // 2026-06-30 device logs). Uses the Web Locks API — a held lock auto-releases when the
  // owning tab closes or crashes, so there's no stale-lock problem. owned = this instance
  // holds it; release = the resolver that frees it for another instance to claim.
  const voiceLockOwnedRef = useRef(false);
  const voiceLockReleaseRef = useRef<(() => void) | null>(null);

  // Scope 2 — a STABLE snapshot of the environment-derived voice tuning. Captured only
  // at connection boundaries (route-start / resume-after-stop) and reused for the whole
  // session, so transient mid-session reconnects keep the same tuning and a setting
  // change made mid-pick can't disrupt the live connection.
  const envTuningRef = useRef<EnvVoiceTuning>(readEnvVoiceTuning(environmentEndpointing));

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

    try {
      const response = await fetch(DEEPGRAM_TOKEN_URL, {
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        throw new Error('Failed to get Deepgram token');
      }
      const data = await response.json();
      tokenRef.current = data.token;
      tokenRawExpiryRef.current = now + (data.expires_in || 600) * 1000;
      tokenExpiryRef.current = now + ((data.expires_in || 600) - 60) * 1000;
      return tokenRef.current;
    } catch (e) {
      // Pass-issuer hiccup at refresh time (common after a long idle gap, since we
      // refresh 60s early): if the current token hasn't ACTUALLY expired yet, keep
      // using it instead of dropping voice entirely. Buys up to ~60s for the issuer
      // to recover before voice is genuinely lost.
      if (tokenRef.current && tokenRawExpiryRef.current > now) {
        console.warn('[Voice] Token refresh failed; reusing still-valid cached token');
        return tokenRef.current;
      }
      throw e;
    }
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

    // Only process if in valid state (matches original PWA state check).
    if (currentStatus !== 'listening' && currentStatus !== 'idle' && currentStatus !== 'speaking') {
      // Branch 3: don't strand a direction command at a machine hand-off. When the app is awaiting
      // a top/bottom answer, dispatch it immediately instead of queuing — a queued command only
      // fires on a LATER resumeListening, which is exactly the "said bottom, nothing happened,
      // had to repeat" drop from Davy's logs. Non-direction commands keep the original
      // queue-during-thinking / ignore-otherwise behavior. resolveHandoffCommand is unit-tested.
      const handoff = resolveHandoffCommand({
        status: currentStatus,
        isDirectionCommand: awaitingDirectionRef.current,
      });
      if (handoff === 'queue') {
        console.log('[Voice] Command queued during', currentStatus + ':', text);
        pendingCommandRef.current = text; // Keep only the latest
        return;
      }
      if (handoff === 'ignore') {
        console.log('[Voice] Ignoring transcript, wrong state:', currentStatus);
        return;
      }
      // handoff === 'dispatch': awaiting-direction command — fall through to dispatch below.
      console.log('[Voice] Awaiting-direction command dispatched during', currentStatus + ':', text);
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
    // NOTE: stopAudio is intentionally NOT listed in this dependency array.
    // stopAudio is a stable useCallback([]) declared further down this file.
    // Listing it here evaluated the binding during render — before its own
    // declaration — throwing "Cannot access 'on' before initialization" and
    // crashing the picking screen. The body above calls it via closure at
    // runtime (after it is initialized), so omitting it is safe and correct.
  }, [hasWakePhrase, extractWakeCommand, isEcho, playCommandChime, setStatus]); // refs used elsewhere to avoid stale closures

  const handleDeepgramMessage = useCallback((data: any) => {
    // Capture Deepgram's OWN error/metadata messages — these name WHY it drops (e.g.
    // NET-0001 inactivity, concurrency/rate limit, encoding mismatch), which a bare close
    // code (1006) never reveals. Skip the high-frequency transcript/utterance types.
    if (data.type && data.type !== 'Results' && data.type !== 'UtteranceEnd') {
      emitDiagnostic('dg-msg', {
        type: data.type,
        reason: data.reason ?? data.description ?? data.message ?? data.error ?? null,
      });
    }
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

          // GRID SURVEY 2026-07-30 — the stop signal ENDS the sentence, it does not redefine it.
          // This branch used to ASSIGN (`accumulatedTranscriptRef.current = transcript`), so every
          // segment banked before Deepgram signalled speech-end was discarded and only the last
          // one was acted on: "go to the next machine" split across two segments became "next
          // machine". Silently — no error, no diagnostic. accumulateTranscript joins instead.
          // Spec: .xf/specs/2026-07-30-voice-grid-survey-xffi.md
          const stitched = accumulateTranscript({
            accumulated: accumulatedTranscriptRef.current,
            incoming: transcript,
            isUtteranceEnd,
          });
          accumulatedTranscriptRef.current = stitched.text;

          if (stitched.process) {
            console.log('[Voice] Utterance end - processing immediately:', stitched.text);
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            processAccumulatedTranscript();
            return;
          }

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

  // ── Raw-PCM capture (AudioWorklet) — replaces MediaRecorder ───────────────────────
  // Captures the ONE shared mic stream, downsamples to 16kHz Int16 PCM in the worklet,
  // and streams it to Deepgram. Headerless by design, so a mid-session reconnect can never
  // send undecodable header-less container fragments (the old "deaf, then storm" failure).
  // The capture graph is built ONCE per session and stays up across reconnects — the worklet
  // always sends to whatever socket is current, and pause/mute just flips micSendingRef.

  const stopPcmCapture = useCallback(() => {
    micSendingRef.current = false;
    if (captureNodeRef.current) {
      try { captureNodeRef.current.port.onmessage = null; captureNodeRef.current.disconnect(); } catch (e) { /* ignore */ }
      captureNodeRef.current = null;
    }
    if (captureSourceRef.current) {
      try { captureSourceRef.current.disconnect(); } catch (e) { /* ignore */ }
      captureSourceRef.current = null;
    }
    if (captureCtxRef.current) {
      try { captureCtxRef.current.close(); } catch (e) { /* ignore */ }
      captureCtxRef.current = null;
    }
    isRecordingRef.current = false;
    emitDiagnostic('capture-state', 'stopped');
  }, []);

  const startPcmCapture = useCallback(async () => {
    if (!audioStreamRef.current) {
      console.error('[Voice] No audio stream available for PCM capture');
      return;
    }
    // Idempotent: on a reconnect the capture graph is already up — just make sure we're
    // sending again. We deliberately do NOT rebuild the AudioContext on reconnect, because
    // a new context created off a user gesture (a mid-route drop) can come up suspended.
    if (captureNodeRef.current) {
      micSendingRef.current = true;
      return;
    }
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new AudioContextClass();
      captureCtxRef.current = ctx;
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* best effort */ } }
      await ctx.audioWorklet.addModule('/pcm-capture-processor.js');
      const source = ctx.createMediaStreamSource(audioStreamRef.current);
      const node = new AudioWorkletNode(ctx, 'pcm-capture-processor');
      node.port.onmessage = (e: MessageEvent) => {
        // e.data is an ArrayBuffer of 16kHz Int16 PCM. Send only while actively listening.
        if (micSendingRef.current && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(e.data as ArrayBuffer);
        }
      };
      source.connect(node);
      // Silent sink: the worklet writes no output, so connecting to destination keeps the
      // node pulled (running) WITHOUT echoing the mic back out the speaker.
      node.connect(ctx.destination);
      captureSourceRef.current = source;
      captureNodeRef.current = node;
      micSendingRef.current = true;
      isRecordingRef.current = true;
      emitDiagnostic('capture-state', 'recording');
      console.log('[Voice] PCM capture started (16kHz linear16 via AudioWorklet)');
    } catch (e: any) {
      console.error('[Voice] Failed to start PCM capture:', e);
      emitDiagnostic('error', 'PCM capture setup failed: ' + String(e));
      onErrorRef.current?.(e?.message || 'Failed to start recording');
    }
  }, []);

  // Pause/resume just gate the send — the mic + worklet stay live (no re-acquire).
  const pauseCapture = useCallback(() => {
    micSendingRef.current = false;
    isRecordingRef.current = false;
    emitDiagnostic('capture-state', 'paused');
  }, []);

  const resumeCapture = useCallback(() => {
    micSendingRef.current = true;
    isRecordingRef.current = true;
    emitDiagnostic('capture-state', 'recording');
  }, []);

  const connectDeepgram = useCallback(async () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }
    // Single-flight: if an attempt is already running, do NOT start a second one. This is the
    // fix for the stacked-reconnect 1006 storm — let the in-flight attempt finish; its
    // onclose will schedule the next retry on the backoff if it fails.
    if (isConnectingRef.current) {
      console.warn('[Voice] connectDeepgram skipped — an attempt is already in flight');
      return;
    }
    isConnectingRef.current = true;

    // Close any lingering previous socket BEFORE opening a new one so dead/closing sockets
    // don't accumulate against Deepgram's connection limit. Detach its handlers first so the
    // old socket can't trigger yet another reconnect as it closes.
    if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
      try {
        socketRef.current.onclose = null;
        socketRef.current.onerror = null;
        socketRef.current.close();
      } catch (e) { /* ignore — replacing a stale socket */ }
    }

    let token: string;
    try {
      token = await ensureToken();
      if (!token) throw new Error('No token available');
    } catch (e) {
      isConnectingRef.current = false;  // release so a later backoff retry can run
      throw e;
    }

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

    // Scope 2 — endpointing comes from the environment-tuning snapshot captured at the
    // last connection boundary (route-start / resume). Transient reconnects reuse it, so
    // the value is stable for the whole session.
    const endpointingMs = envTuningRef.current.endpointing || 100;
    console.log('[Voice] Deepgram endpointing:', endpointingMs + 'ms', '(env tuning:', envTuningRef.current, ')');

    const wsUrl = 'wss://api.deepgram.com/v1/listen?' +
      'model=nova-2&' +  // Latest Nova 2 model (nova-3 not yet available)
      'language=en-US&' +
      'encoding=linear16&sample_rate=16000&' +  // Raw 16kHz PCM — headerless, so reconnects never lose a container header
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
          isConnectingRef.current = false;
          socket.close();
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      socket.onopen = () => {
        clearTimeout(timeout);
        isConnectingRef.current = false;
        isConnectedRef.current = true;
        setIsDeepgramConnected(true);
        reconnectAttemptsRef.current = 0; // Reset reconnection counter on successful connect
        emitDiagnostic('deepgram-connected', true);
        startKeepAlive();
        startPcmCapture();

        // NO proactive token refresh. The temporary token only authenticates the
        // initial WebSocket handshake — once this connection is open, it stays open
        // even after the token expires (Deepgram docs + GitHub discussion #673; proven
        // in our own logs: one connection ran 7m41s healthy until a refresh broke it).
        // KeepAlive (every 8s) holds the live connection, not the token. Closing a
        // healthy socket to swap tokens was self-inflicted: the immediate reconnect
        // hit Deepgram's connection limit before the old socket fully released → 1006
        // storm → voice died → robotic phone-voice fallback kicked in. Removed.
        // A REAL network drop still reconnects with a fresh token via ensureToken().
        if (tokenRefreshTimerRef.current) clearTimeout(tokenRefreshTimerRef.current);

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
        isConnectingRef.current = false;
        emitDiagnostic('error', 'Deepgram WebSocket error');
        // Plain-English, reassuring — the driver sees what's happening instead of a
        // cryptic "WebSocket error" or dead silence during the auto-reconnect window.
        onErrorRef.current?.('Reconnecting voice…');
      };

      socket.onclose = (event) => {
        clearTimeout(timeout);
        isConnectingRef.current = false;
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
        // GRID SURVEY 2026-07-30 — this list used to omit 'speaking' (and 'idle'). The app
        // announces every item, so it is speaking for a large share of a picking session; a drop
        // inside any announcement was never retried, and the watchdog could not rescue it either
        // (it only fires with a command QUEUED, and a dead socket delivers nothing to queue).
        // Voice stayed dead for the rest of the route while the phone looked normal — Davy's
        // 2026-07-01 "went deaf". shouldReconnectFromStatus is unit-tested.
        // Spec: .xf/specs/2026-07-30-voice-grid-survey-xffi.md
        if (shouldReconnectRef.current && shouldReconnectFromStatus(currentStatus)) {

          // Phone locked / app backgrounded: the page is frozen or throttled, so a reconnect
          // can't succeed — it just storms (2026-07-01 device logs showed endless
          // error→retry→max-reached→recovery on BOTH iPhone and Android). Halt attempts here;
          // the visibilitychange handler does ONE clean reconnect the moment the screen wakes.
          if (typeof document !== 'undefined' && document.hidden) {
            emitDiagnostic('reconnect-deferred-hidden', { timestamp });
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
              reconnectTimeoutRef.current = null;
            }
            reconnectAttemptsRef.current = 0;
            return;
          }

          // GENTLE, BOUNDED RECOVERY (foreground + session active).
          // Raw PCM makes reconnects safe — there is no container header to lose — so the old
          // never-give-up storm is gone. Try a few quick times; if the drop truly persists,
          // surface a clear "tap to reconnect" instead of hammering Deepgram forever (which is
          // what turned a transient drop into the dead-voice storm in Davy's logs).
          const attempt = reconnectAttemptsRef.current;
          const { delayMs, giveUp } = gentleReconnect(attempt);
          if (giveUp) {
            emitDiagnostic('reconnect-gave-up', { attempt });
            reconnectAttemptsRef.current = 0;
            setStatus('error');
            onErrorRef.current?.('Voice paused — tap to reconnect.');
            return;
          }
          reconnectAttemptsRef.current = attempt + 1;

          console.log(`[Voice] Deepgram dropped — gentle reconnect in ${delayMs}ms (attempt ${attempt + 1})`, { timestamp });
          emitDiagnostic('deepgram-reconnecting', { attempt: attempt + 1, backoffMs: delayMs, timestamp });

          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          reconnectTimeoutRef.current = setTimeout(async () => {
            try {
              await connectDeepgram();
              reconnectAttemptsRef.current = 0;
              console.log('[Voice] Deepgram reconnected successfully');
              emitDiagnostic('deepgram-reconnected', 'success');
            } catch (e) {
              console.error('[Voice] Deepgram reconnection failed:', e);
              emitDiagnostic('error', 'Deepgram reconnection failed: ' + String(e));
              // onclose fires again → next gentle attempt, up to the bound.
            }
          }, delayMs);
        }
      };
    });
  }, [ensureToken, startKeepAlive, stopKeepAlive, startPcmCapture, handleDeepgramMessage, setStatus]); // Using ref for onError

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
    // Base audio constraints — unchanged.
    // echoCancellation OFF — deliberate (Russ, 2026-06-29: "there is never a need to
    // interrupt the AI", so barge-in is dropped). Requesting hardware AEC puts Android
    // into communication / phone-call audio mode → routes the AI's voice to the EARPIECE;
    // with AEC off the device stays in media mode → the loud SPEAKER (this is the config
    // that worked handsfree earlier today). We no longer need AEC to keep the live mic
    // from hearing the TTS — barge-in is gone, and the isEcho() text filter remains the
    // backstop against the AI mis-hearing its own announcement.
    const baseAudio: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
    };
    const preferred = preferredDeviceIdRef.current;

    let stream: MediaStream;
    if (preferred) {
      // A pre-flight mic check confirmed a specific device — honor it with `exact` (Chrome
      // overrides `ideal` back to the system default on some Windows machines). `exact`
      // hard-fails (OverconstrainedError) if that device is gone, so fall back to the default
      // (base constraints, no deviceId) on any throw — never hard-block voice.
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { ...baseAudio, deviceId: { exact: preferred } }
        });
      } catch (e) {
        console.warn('[Voice] Preferred mic (exact) unavailable — falling back to default:', e);
        stream = await navigator.mediaDevices.getUserMedia({ audio: baseAudio });
      }
    } else {
      // No preferred device — single plain call, identical to before.
      stream = await navigator.mediaDevices.getUserMedia({ audio: baseAudio });
    }
    audioStreamRef.current = stream;
    return stream;
  }, []);

  // Scope 2 — capture the environment-tuning snapshot at a connection boundary. The
  // GUARD: if a connection is already open, do nothing — a setting change made mid-pick
  // must not disturb the live session. Only a real route-start/resume (socket closed)
  // refreshes the snapshot.
  const refreshEnvTuningSnapshot = useCallback(() => {
    const open = socketRef.current && socketRef.current.readyState === WebSocket.OPEN;
    if (open) {
      console.log('[Voice] Env tuning refresh skipped — connection open (mid-session guard)');
      return;
    }
    envTuningRef.current = readEnvVoiceTuning(environmentEndpointing);
    console.log('[Voice] Env tuning snapshot captured at connection boundary:', envTuningRef.current);
  }, [environmentEndpointing]);

  // Claim the single-voice lock for THIS instance. Returns true if we own it (now or
  // already), false if another live instance holds it. Resolves the moment ownership is
  // known; the underlying lock stays held in the background until releaseVoiceLock() runs.
  // Never blocks voice if the Web Locks API is missing (old browser) — degrade open.
  const ensureVoiceOwnership = useCallback(async (): Promise<boolean> => {
    if (voiceLockOwnedRef.current) return true;          // already ours
    if (typeof navigator === 'undefined' || !('locks' in navigator)) return true;
    return new Promise<boolean>((resolveOwnership) => {
      let settled = false;
      const settle = (v: boolean) => { if (!settled) { settled = true; resolveOwnership(v); } };
      try {
        navigator.locks.request(
          'stocker-voice-active',
          { mode: 'exclusive', ifAvailable: true },
          (lock) => {
            if (!lock) { settle(false); return; }        // another instance owns voice
            voiceLockOwnedRef.current = true;
            settle(true);
            // Hold the lock until we explicitly release it (or this tab closes).
            return new Promise<void>((release) => { voiceLockReleaseRef.current = release; });
          }
        ).catch(() => settle(true));                      // lock error → don't block voice
      } catch (e) {
        settle(true);
      }
    });
  }, []);

  const releaseVoiceLock = useCallback(() => {
    if (voiceLockReleaseRef.current) {
      try { voiceLockReleaseRef.current(); } catch (e) {}
      voiceLockReleaseRef.current = null;
    }
    voiceLockOwnedRef.current = false;
  }, []);

  const startListening = useCallback(async () => {
    console.log('[Voice] startListening called — build', BUILD_VERSION);
    emitDiagnostic('build-version', BUILD_VERSION);

    // SINGLE-VOICE LOCK: if another app instance already owns voice, stay silent — never
    // start a second listener that would talk over the first. (Same-instance reconnects
    // already own the lock, so this is a no-op for them.)
    //
    // RESILIENCE (2026-06-30): a page reload or a leftover/duplicate tab can leave the lock
    // momentarily held by a context that is tearing down — denying the fresh instance and
    // leaving voice SILENTLY dead (the desktop-demo symptom). So on denial we wait briefly
    // for the other context to release, then retry ONCE before giving up. A genuine second
    // concurrent tab still loses (correct), but now with a visible message, never silence.
    if (!(await ensureVoiceOwnership())) {
      await new Promise(r => setTimeout(r, 600));
      if (!(await ensureVoiceOwnership())) {
        console.warn('[Voice] startListening blocked — another instance owns voice');
        emitDiagnostic('voice-lock-denied', 'startListening');
        onErrorRef.current?.('Voice is already running in another window. Close it, then tap to resume.');
        return false;
      }
    }

    // Scope 2 — route-start / resume-after-stop boundary: refresh the env-tuning snapshot
    // (guard inside no-ops if a connection is somehow still open).
    refreshEnvTuningSnapshot();

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

  // Keep the ref pointed at the latest startListening for the screen-wake reconnect.
  startListeningRef.current = startListening;

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

    stopPcmCapture();

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
  }, [stopKeepAlive, setStatus, stopPcmCapture]);

  const pauseListening = useCallback(() => {
    // Clear silence timer and accumulated transcript (matches original PWA pause behavior)
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    accumulatedTranscriptRef.current = '';

    pauseCapture();

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
    // Clear the TTS kill-switch — backgrounding/lock latches stoppedRef=true via pagehide;
    // resuming must un-latch it or speech stays muted while the mic appears to work.
    stoppedRef.current = false;
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

    if (socketRef.current?.readyState === WebSocket.OPEN && isConnectedRef.current) {
      // Socket alive — make sure capture is up and sending, then resume listening.
      if (!captureNodeRef.current) { await startPcmCapture(); } else { resumeCapture(); }
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
      try { await startListening(); } catch (e: any) {
        setStatus('error');
        onErrorRef.current?.(e?.message || 'Voice reconnect failed — tap to retry');
      }
    }
  }, [startPcmCapture, resumeCapture, startListening, setStatus, playCommandChime]);

  // ── Freeze watchdog (branch 5, strictly additive) ───────────────────────────────────────────
  // Davy's 2026-07-12 route died when the app got stuck non-listening after a TTS barge-in: it
  // kept transcribing but never acted, with a command stranded in the queue. This safety net
  // polls the status FSM and, only when it has been stuck non-listening with a pending command
  // past the threshold (long enough that a real in-flight API 'thinking' call would already have
  // resolved), force-recovers to listening and flushes the backlog via resumeListening. A normal
  // short 'thinking' window is left untouched. Decision logic is the unit-tested watchdogAction.
  const resumeListeningRef = useRef(resumeListening);
  resumeListeningRef.current = resumeListening;
  useEffect(() => {
    const WATCHDOG_POLL_MS = 2000;
    const timer = setInterval(() => {
      const stuckMs = stuckSinceRef.current === null ? 0 : Date.now() - stuckSinceRef.current;
      const action = watchdogAction({
        status: statusRef.current,
        hasPendingCommand: pendingCommandRef.current !== null,
        stuckMs,
        thresholdMs: WATCHDOG_STUCK_THRESHOLD_MS,
      });
      if (action === 'recover') {
        const target = recoverStatus(statusRef.current); // 'listening' (preserves paused/muted)
        console.warn('[Voice] ⏱️ Watchdog: FSM stuck non-listening with a queued command — force-recovering to', target);
        emitDiagnostic('watchdog-recover', { stuckMs, from: statusRef.current, to: target });
        setStatus(target);
        // resumeListening() re-arms capture AND fires the stranded command from pendingCommandRef.
        resumeListeningRef.current().catch(() => { /* best effort — a failed resume re-arms next tick */ });
      }
    }, WATCHDOG_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const mute = useCallback(() => {
    // Clear silence timer and accumulated transcript (matches original PWA mute behavior)
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    accumulatedTranscriptRef.current = '';

    pauseCapture();
    setLastInput('');
    setStatus('muted');
  }, [setStatus]);

  const unmute = useCallback(async () => {
    // Clear the TTS kill-switch on resume. Backgrounding / screen-lock fires pagehide ->
    // stopEverything() which latches stoppedRef=true; without this, the mic comes back but
    // speech stays permanently muted ("nothing out the speaker"). Resuming != stopped.
    stoppedRef.current = false;
    // iOS/Safari suspends the AudioContext after idle or a screen-lock. resumeListening
    // already checks for this; unmute must too — otherwise the recorder "resumes" while
    // the audio engine is still asleep: the UI says "listening" but nothing is recorded.
    if (audioContextRef.current?.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
      } catch (e) {
        onErrorRef.current?.('Tap screen to resume voice');
        return;
      }
    }
    if (socketRef.current?.readyState === WebSocket.OPEN && isConnectedRef.current) {
      // Socket alive — make sure capture is up and resume sending.
      if (!captureNodeRef.current) { await startPcmCapture(); } else { resumeCapture(); }
    } else {
      // Socket dead — full reconnect (sets its own status).
      startListening();
      return;
    }
    setStatus('listening');
  }, [setStatus, startListening, startPcmCapture, resumeCapture]);

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

    // SINGLE-VOICE LOCK: a non-owning instance must never speak — this is what stops two
    // instances from greeting over each other on resume. (If this instance is the one
    // driving voice it already owns the lock, so this is a no-op.)
    if (!(await ensureVoiceOwnership())) {
      console.warn('[Voice] Speak suppressed — another instance owns voice');
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
      // (PCM capture stays active during playback for interrupt support)
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

      // 8. Play ready beep — skip if TTS was interrupted (driver already heard command chime)
      if (!stoppedRef.current) playReadyBeep();

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
      // Stop microphone + PCM capture graph
      stopPcmCapture();
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
      // Release the single-voice lock so another instance can take over. (The Web Locks
      // API also auto-releases this if the tab is hard-closed or crashes.)
      releaseVoiceLock();
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

    // Screen lock / app background handling — the CALM version.
    // The old handler stopped ALL voice on `hidden` and misfired during active picking, so it
    // was removed. This one NEVER tears down voice; it only manages reconnection:
    //   • hidden (screen locked / backgrounded): halt the reconnect storm — a socket can't open
    //     on a frozen page, so retrying just burns battery and never recovers.
    //   • visible (screen woke): if we should be listening but the socket dropped while away,
    //     do ONE clean reconnect. If still connected, do nothing — safe against a false 'hidden'.
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        return;
      }
      const s = statusRef.current;
      const shouldBeListening = s === 'listening' || s === 'paused' || s === 'muted' || s === 'thinking';
      if (shouldReconnectRef.current && shouldBeListening && !isConnectedRef.current) {
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        reconnectAttemptsRef.current = 0;
        emitDiagnostic('reconnect-on-resume', { timestamp: new Date().toISOString(), status: s });
        startListeningRef.current?.();
      }
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
    setAwaitingDirection,  // Branch 3: parent flags when awaiting a top/bottom answer at a hand-off
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
