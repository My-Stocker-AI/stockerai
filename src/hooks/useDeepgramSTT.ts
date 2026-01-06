import { useCallback, useRef, useState } from 'react';

const DEEPGRAM_TOKEN_URL = 'https://stocker-deepgram-stt.russ-731.workers.dev/token';

interface UseDeepgramSTTOptions {
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onUtteranceEnd?: () => void;
}

export function useDeepgramSTT(options: UseDeepgramSTTOptions = {}) {
  const { onTranscript, onError, onUtteranceEnd } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const keepAliveRef = useRef<NodeJS.Timeout | null>(null);
  const tokenRef = useRef<string | null>(null);
  const tokenExpiryRef = useRef<number>(0);
  const shouldReconnectRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const finalTranscriptRef = useRef('');

  const KEEPALIVE_MS = 8000;
  const MAX_RECONNECT_ATTEMPTS = 5;

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

  const handleMessage = useCallback((data: any) => {
    if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
      const alt = data.channel.alternatives[0];
      const transcript = alt.transcript || '';
      const isFinal = data.is_final;

      if (transcript) {
        if (isFinal) {
          finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + transcript;
          onTranscript?.(transcript, true);
        } else {
          onTranscript?.(transcript, false);
        }
      }

      // Check for utterance end
      if (data.speech_final) {
        if (finalTranscriptRef.current.trim()) {
          onUtteranceEnd?.();
          finalTranscriptRef.current = '';
        }
      }
    } else if (data.type === 'UtteranceEnd') {
      if (finalTranscriptRef.current.trim()) {
        onUtteranceEnd?.();
        finalTranscriptRef.current = '';
      }
    }
  }, [onTranscript, onUtteranceEnd]);

  const setupMediaRecorder = useCallback(() => {
    if (!audioStreamRef.current) return;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

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
    setIsRecording(true);
  }, [onError]);

  const attemptReconnect = useCallback(async () => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      onError?.('Max reconnect attempts reached');
      return;
    }

    reconnectAttemptsRef.current++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 10000);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await connect();
    } catch (e) {
      // Will retry via onclose handler
    }
  }, [onError]);

  const connect = useCallback(async () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const token = await ensureToken();
    if (!token) throw new Error('No token available');

    const wsUrl = 'wss://api.deepgram.com/v1/listen?' +
      'model=nova-3&' +
      'language=en-US&' +
      'smart_format=true&' +
      'interim_results=true&' +
      'vad_events=true&' +
      'endpointing=200&' +
      'keywords=north:3&' +
      'keywords=south:3&' +
      'keywords=east:3&' +
      'keywords=west:3&' +
      'keywords=route:2&' +
      'keywords=next:2&' +
      'keywords=skip:2&' +
      'keywords=done:2';

    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(wsUrl, ['token', token]);
      socketRef.current = socket;

      const timeout = setTimeout(() => {
        if (!isConnected) {
          socket.close();
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      socket.onopen = () => {
        clearTimeout(timeout);
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        startKeepAlive();
        setupMediaRecorder();
        resolve();
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (e) {}
      };

      socket.onerror = () => {
        clearTimeout(timeout);
        onError?.('WebSocket error');
      };

      socket.onclose = () => {
        clearTimeout(timeout);
        setIsConnected(false);
        setIsRecording(false);
        stopKeepAlive();

        if (shouldReconnectRef.current) {
          attemptReconnect();
        }
      };
    });
  }, [ensureToken, isConnected, startKeepAlive, stopKeepAlive, setupMediaRecorder, handleMessage, onError, attemptReconnect]);

  const initialize = useCallback(async () => {
    try {
      // Get microphone access
      audioStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }
      });

      // Get token
      await ensureToken();

      // Connect WebSocket
      await connect();
    } catch (error: any) {
      onError?.(error.message || 'Failed to initialize');
      throw error;
    }
  }, [ensureToken, connect, onError]);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsRecording(false);
    }
  }, []);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsRecording(true);
    } else if (!mediaRecorderRef.current && socketRef.current?.readyState === WebSocket.OPEN) {
      setupMediaRecorder();
    }
  }, [setupMediaRecorder]);

  const stop = useCallback(() => {
    shouldReconnectRef.current = false;
    stopKeepAlive();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    mediaRecorderRef.current = null;

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

    setIsConnected(false);
    setIsRecording(false);
  }, [stopKeepAlive]);

  return {
    isConnected,
    isRecording,
    initialize,
    pause,
    resume,
    stop
  };
}
