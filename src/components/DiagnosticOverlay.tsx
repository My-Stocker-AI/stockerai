import React, { useState, useEffect } from 'react';
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
      setDiagnostics(prev => {
        const updated = { ...prev };

        switch (type) {
          case 'deepgram-connected':
            updated.deepgramConnected = true;
            break;
          case 'deepgram-disconnected':
            updated.deepgramConnected = false;
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
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
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
          Take a screenshot of this panel when the issue occurs and send to support.
        </p>
      </div>
    </div>
  );
}
