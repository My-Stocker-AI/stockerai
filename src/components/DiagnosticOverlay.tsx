import React, { useState, useEffect, useRef } from 'react';

// Voice diagnostics auto-ship to the backend → Render logs (read remotely). This means
// device-side voice behavior is observable WITHOUT the driver doing anything — no copy,
// no screenshot. Fire-and-forget + batched so it never touches the voice pipeline timing.
const DIAG_ENDPOINT = 'https://stockerai-api.onrender.com/api/diag';
import { Activity, Wifi, Mic, Volume2, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

interface DiagnosticOverlayProps {
  voiceStatus: string;
  isDeepgramConnected: boolean;
  isVisible: boolean;
  onClose: () => void;
}

interface DiagnosticState {
  audioContextState: string;
  micPermission: string;
  deepgramConnected: boolean;
  mediaRecorderState: string;
  lastTranscript: string;
  lastSpoken: string;
  errors: string[];
}

export function DiagnosticOverlay({ voiceStatus, isDeepgramConnected, isVisible, onClose }: DiagnosticOverlayProps) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticState>({
    audioContextState: 'unknown',
    micPermission: 'unknown',
    deepgramConnected: isDeepgramConnected,
    mediaRecorderState: 'unknown',
    lastTranscript: '',
    lastSpoken: '',
    errors: []
  });

  // Full timestamped trail of EVERY voice-diagnostic event this session — the real
  // debugging record (the snapshot fields above only show the latest of each). Captured
  // from app mount (this listener is always active); copied out via the button below so
  // support can read the exact sequence instead of guessing. Capped to bound memory.
  const [fullLog, setFullLog] = useState<Array<{ t: number; type: string; data: any }>>([]);
  const [copied, setCopied] = useState(false);

  // Buffer of events not yet shipped to the server + a stable id for this app load so the
  // backend logs can be filtered to one driver's walk.
  const pendingRef = useRef<Array<{ t: number; type: string; data: any }>>([]);
  const sessionTagRef = useRef<string>(
    `${new Date().toISOString().slice(11, 19)}-${Math.random().toString(36).slice(2, 7)}`
  );

  const copyLog = async () => {
    const header =
      `StockerAI voice log — ${fullLog.length} events\n` +
      `when=${new Date().toISOString()}  voiceStatus=${voiceStatus}  deepgram=${isDeepgramConnected}\n` +
      `ua=${navigator.userAgent}\n──────\n`;
    const body = fullLog
      .map(e => {
        const ts = new Date(e.t).toISOString().slice(11, 23);
        const d = e.data == null ? '' : (typeof e.data === 'object' ? JSON.stringify(e.data) : String(e.data));
        return `${ts}  ${e.type}${d ? '  | ' + d : ''}`;
      })
      .join('\n');
    const text = header + body;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Update Deepgram connection state when prop changes
  useEffect(() => {
    setDiagnostics(prev => ({
      ...prev,
      deepgramConnected: isDeepgramConnected
    }));
  }, [isDeepgramConnected]);

  useEffect(() => {
    if (!isVisible) return;

    const checkDiagnostics = async () => {
      const newDiag: DiagnosticState = {
        audioContextState: 'unknown',
        micPermission: 'unknown',
        deepgramConnected: isDeepgramConnected,
        mediaRecorderState: 'unknown',
        lastTranscript: diagnostics.lastTranscript,
        lastSpoken: diagnostics.lastSpoken,
        errors: [...diagnostics.errors]
      };

      // Check AudioContext
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          newDiag.audioContextState = ctx.state;
          ctx.close();
        }
      } catch (e) {
        newDiag.errors.push('AudioContext error: ' + String(e));
      }

      // Check microphone permission
      try {
        if (navigator.permissions) {
          const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          newDiag.micPermission = result.state;
        } else {
          newDiag.micPermission = 'not-supported';
        }
      } catch (e) {
        newDiag.micPermission = 'error';
        newDiag.errors.push('Permission check error: ' + String(e));
      }

      setDiagnostics(newDiag);
    };

    checkDiagnostics();
    const interval = setInterval(checkDiagnostics, 2000);
    return () => clearInterval(interval);
  }, [isVisible]);

  // Listen for diagnostic events from useVoice
  useEffect(() => {
    const handleDiagnosticEvent = (e: CustomEvent) => {
      const { type, data } = e.detail;
      // Capture EVERY event into the full trail (cap at 800 to bound memory).
      const entry = { t: Date.now(), type, data };
      setFullLog(prev => [...prev.slice(-799), entry]);
      // Queue it for auto-ship to the server (read remotely from Render logs).
      pendingRef.current.push(entry);
      setDiagnostics(prev => {
        const updated = { ...prev };

        switch (type) {
          case 'deepgram-connected':
            updated.deepgramConnected = true;
            break;
          case 'deepgram-disconnected':
            updated.deepgramConnected = false;
            // Surface the close code + reason on-screen — this is the single fact that
            // names WHY Deepgram refused the line (1011=concurrency, 4001/4008=token,
            // 1006=network). Previously logged only to console, invisible on a phone.
            if (data && typeof data === 'object' && 'code' in data) {
              const why = `DG close ${data.code}${data.reason ? ' — ' + data.reason : ''} (try ${data.reconnectAttempt ?? 0})`;
              updated.errors = [...prev.errors.slice(-4), why];
            }
            break;
          case 'mediarecorder-state':
            updated.mediaRecorderState = data;
            break;
          case 'transcript':
            updated.lastTranscript = data;
            break;
          case 'spoken':
            updated.lastSpoken = data;
            break;
          case 'error':
            updated.errors = [...prev.errors.slice(-4), data]; // Keep last 5 errors
            break;
        }

        return updated;
      });
    };

    window.addEventListener('voice-diagnostic' as any, handleDiagnosticEvent);
    return () => window.removeEventListener('voice-diagnostic' as any, handleDiagnosticEvent);
  }, []);

  // Auto-ship queued events to the server every 3s (fire-and-forget, errors swallowed —
  // can never block or slow the voice pipeline). Read remotely from Render logs.
  useEffect(() => {
    const flush = () => {
      if (pendingRef.current.length === 0) return;
      const events = pendingRef.current;
      pendingRef.current = [];
      try {
        fetch(DIAG_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionTagRef.current,
            user_agent: navigator.userAgent,
            events,
          }),
          keepalive: true,
        }).catch(() => { /* offline / blocked — drop, never retry-storm */ });
      } catch { /* never throw into the app */ }
    };
    const id = setInterval(flush, 3000);
    return () => { clearInterval(id); flush(); };
  }, []);

  if (!isVisible) return null;

  const StatusIcon = ({ status }: { status: 'good' | 'bad' | 'unknown' }) => {
    if (status === 'good') return <CheckCircle2 className="h-4 w-4 text-green-400" />;
    if (status === 'bad') return <XCircle className="h-4 w-4 text-red-400" />;
    return <AlertCircle className="h-4 w-4 text-yellow-400" />;
  };

  const getPermissionStatus = (): 'good' | 'bad' | 'unknown' => {
    if (diagnostics.micPermission === 'granted') return 'good';
    if (diagnostics.micPermission === 'denied') return 'bad';
    return 'unknown';
  };

  const getAudioContextStatus = (): 'good' | 'bad' | 'unknown' => {
    if (diagnostics.audioContextState === 'running') return 'good';
    if (diagnostics.audioContextState === 'suspended' || diagnostics.audioContextState === 'closed') return 'bad';
    return 'unknown';
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg p-4 w-96 max-h-96 overflow-y-auto text-xs shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-400" />
          <h3 className="font-semibold text-white">Voice Diagnostics</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyLog}
            className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
          >
            {copied ? '✓ Copied' : `Copy log (${fullLog.length})`}
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {/* Voice Status */}
        <div className="flex items-center justify-between p-2 bg-gray-800/50 rounded">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-purple-400" />
            <span className="text-gray-300">Voice Status</span>
          </div>
          <span className="text-white font-mono">{voiceStatus}</span>
        </div>

        {/* Microphone Permission */}
        <div className="flex items-center justify-between p-2 bg-gray-800/50 rounded">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-blue-400" />
            <span className="text-gray-300">Mic Permission</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusIcon status={getPermissionStatus()} />
            <span className="text-white font-mono">{diagnostics.micPermission}</span>
          </div>
        </div>

        {/* AudioContext */}
        <div className="flex items-center justify-between p-2 bg-gray-800/50 rounded">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-green-400" />
            <span className="text-gray-300">AudioContext</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusIcon status={getAudioContextStatus()} />
            <span className="text-white font-mono">{diagnostics.audioContextState}</span>
          </div>
        </div>

        {/* Deepgram Connection */}
        <div className="flex items-center justify-between p-2 bg-gray-800/50 rounded">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-teal-400" />
            <span className="text-gray-300">Deepgram WebSocket</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusIcon status={diagnostics.deepgramConnected ? 'good' : 'bad'} />
            <span className="text-white font-mono">{diagnostics.deepgramConnected ? 'connected' : 'disconnected'}</span>
          </div>
        </div>

        {/* MediaRecorder */}
        <div className="flex items-center justify-between p-2 bg-gray-800/50 rounded">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-red-400" />
            <span className="text-gray-300">MediaRecorder</span>
          </div>
          <span className="text-white font-mono">{diagnostics.mediaRecorderState}</span>
        </div>

        {/* Last Transcript */}
        {diagnostics.lastTranscript && (
          <div className="p-2 bg-gray-800/50 rounded">
            <div className="text-gray-400 mb-1">Last heard:</div>
            <div className="text-white font-mono text-xs break-words">{diagnostics.lastTranscript}</div>
          </div>
        )}

        {/* Last Spoken */}
        {diagnostics.lastSpoken && (
          <div className="p-2 bg-gray-800/50 rounded">
            <div className="text-gray-400 mb-1">Last spoken:</div>
            <div className="text-white font-mono text-xs break-words">{diagnostics.lastSpoken}</div>
          </div>
        )}

        {/* Errors */}
        {diagnostics.errors.length > 0 && (
          <div className="p-2 bg-red-900/20 border border-red-800 rounded">
            <div className="text-red-400 mb-1 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Recent Errors:
            </div>
            <div className="space-y-1">
              {diagnostics.errors.map((err, i) => (
                <div key={i} className="text-red-300 font-mono text-xs break-words">
                  {err}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-3 pt-3 border-t border-gray-700 text-gray-400">
        <p className="text-xs">
          When the issue happens, tap <span className="text-blue-400 font-semibold">Copy log</span> and paste it to support — it captures the full sequence, not just what's on screen.
        </p>
      </div>
    </div>
  );
}
