// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoice, type VoiceStatus } from './useVoice';
import { isBareNumber } from '@/utils/spokenNumber';

const chime = vi.fn();
const cancelSpeech = vi.fn();
const synthSpeak = vi.fn();
const captureSources = vi.fn();
class FakeTrack extends EventTarget {
  readyState = 'live'; muted = false;
  stop = vi.fn(() => { this.readyState = 'ended'; });
}
const streamFor = (track: FakeTrack) => ({ getTracks: () => [track], getAudioTracks: () => [track] });
let initialTrack: FakeTrack;
let workletPort: { onmessage: ((event: { data: ArrayBuffer }) => void) | null };
const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() });
class FakeAudioContext {
  state = 'running'; currentTime = 0; destination = {};
  audioWorklet = { addModule: vi.fn(async () => {}) };
  resume = vi.fn(async () => {}); close = vi.fn(async () => {});
  createBuffer = vi.fn(() => ({})); createBufferSource = node;
  createMediaStreamSource = (stream: unknown) => { captureSources(stream); return node(); };
  createOscillator() { chime(); return { ...node(), frequency: { value: 0, setValueAtTime: vi.fn() } }; }
  createGain() { return { ...node(), gain: { value: 0, exponentialRampToValueAtTime: vi.fn() } }; }
}
class FakeSocket {
  static OPEN = 1;
  static latest: FakeSocket;
  static created = 0;
  readyState = 1;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  send = vi.fn(); close = vi.fn();
  constructor() { FakeSocket.latest = this; FakeSocket.created++; queueMicrotask(() => this.onopen?.()); }
  transcript(text: string, final = true) {
    this.onmessage?.({ data: JSON.stringify({
      type: 'Results', is_final: true, speech_final: final,
      channel: { alternatives: [{ transcript: text }] },
    }) });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('AudioWorkletNode', class { port = workletPort = { onmessage: null }; connect() {} disconnect() {} });
  vi.stubGlobal('Audio', class { play = vi.fn(async () => {}); pause = vi.fn(); });
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('SpeechSynthesisUtterance', class {
    rate = 1; onstart?: () => void; onend?: () => void; onerror?: () => void;
    constructor(public text: string) {}
  });
  vi.stubGlobal('speechSynthesis', { cancel: cancelSpeech, speak: synthSpeak, speaking: false });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (!url.endsWith('/token')) throw new Error('Unexpected network call');
    return { ok: true, json: async () => ({ token: 'fake-token', expires_in: 600 }) };
  }));
  initialTrack = new FakeTrack();
  FakeSocket.created = 0;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: Object.assign(new EventTarget(), {
    getUserMedia: vi.fn(async () => streamFor(initialTrack.readyState === 'live' ? initialTrack : new FakeTrack())),
  }) });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function start() {
  const heard = vi.fn();
  const errors = vi.fn();
  const hook = renderHook(({ picking }) => useVoice({
    shouldIgnoreTranscript: text => picking && isBareNumber(text),
    onTranscript: heard, onError: errors,
  }), { initialProps: { picking: true } });
  await act(async () => { expect(await hook.result.current.startListening()).toBe(true); });
  expect(errors).not.toHaveBeenCalled();
  chime.mockClear(); cancelSpeech.mockClear(); heard.mockClear();
  return { ...hook, heard, errors };
}

describe('earbud microphone recovery', () => {
  it('does not report listening when the microphone capture context stays suspended', async () => {
    class SuspendedAudioContext extends FakeAudioContext {
      state = 'suspended';
      resume = vi.fn(async () => {});
    }
    vi.stubGlobal('AudioContext', SuspendedAudioContext);
    const hook = renderHook(() => useVoice({}));
    await act(async () => { expect(await hook.result.current.startListening()).toBe(false); });
    expect(hook.result.current.getStatus()).toBe('error');
  });

  it('manual retry restores PCM delivery even when the speech socket never disconnected', async () => {
    const { result } = await start();
    const socket = FakeSocket.latest;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new Error('Device unavailable'));
    await act(async () => {
      initialTrack.readyState = 'ended';
      initialTrack.dispatchEvent(new Event('ended'));
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => { expect(await result.current.startListening()).toBe(true); });
    socket.send.mockClear();
    const pcm = new ArrayBuffer(16);
    workletPort.onmessage?.({ data: pcm });
    expect(socket.send).toHaveBeenCalledExactlyOnceWith(pcm);
    expect(FakeSocket.latest).toBe(socket);
    expect(result.current.isDeepgramConnected).toBe(true);
  });

  it('manual retry reports failure when the microphone is still unavailable', async () => {
    const { result } = await start();
    initialTrack.readyState = 'ended';
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new Error('Device unavailable'));
    await act(async () => { expect(await result.current.startListening()).toBe(false); });
    expect(result.current.getStatus()).toBe('error');
  });

  it('device events after stop do not turn the microphone back on', async () => {
    const { result } = await start();
    await act(async () => {
      result.current.stopListening();
      navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
      initialTrack.dispatchEvent(new Event('ended'));
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.getStatus()).toBe('idle');
  });

  it('does not acquire a microphone merely because a device changes before voice starts', async () => {
    renderHook(() => useVoice({}));
    await act(async () => {
      navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it.each(['muted', 'paused'] as VoiceStatus[])('preserves %s capture policy after recovery', async status => {
    const { result, heard } = await start();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(streamFor(new FakeTrack()) as unknown as MediaStream);
    await act(async () => {
      result.current.setStatus(status);
      navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
      await vi.advanceTimersByTimeAsync(2000);
    });
    FakeSocket.latest.send.mockClear();
    const pcm = new ArrayBuffer(16);
    workletPort.onmessage?.({ data: pcm });
    expect(FakeSocket.latest.send).toHaveBeenCalledTimes(status === 'muted' ? 0 : 1);
    expect(result.current.getStatus()).toBe(status);
    expect(heard).not.toHaveBeenCalled();
  });

  it('defers device recovery while hidden and recovers on return', async () => {
    await start();
    const visibility = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(streamFor(new FakeTrack()) as unknown as MediaStream);
    try {
      await act(async () => {
        navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
      await act(async () => {
        visibility.mockReturnValue(false);
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
    } finally { visibility.mockRestore(); }
  });

  it('rebuilds microphone capture when a mobile page is restored from cache', async () => {
    const { result } = await start();
    const socket = FakeSocket.latest;
    const pagehide = new Event('pagehide');
    const pageshow = new Event('pageshow');
    Object.defineProperty(pagehide, 'persisted', { value: true });
    Object.defineProperty(pageshow, 'persisted', { value: true });
    await act(async () => {
      window.dispatchEvent(pagehide);
      window.dispatchEvent(pageshow);
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
    expect(FakeSocket.latest).toBe(socket);
    socket.send.mockClear();
    const pcm = new ArrayBuffer(16);
    workletPort.onmessage?.({ data: pcm });
    expect(socket.send).toHaveBeenCalledExactlyOnceWith(pcm);
    expect(result.current.getStatus()).toBe('listening');
  });

  it('coalesces repeated device events into one pending microphone request', async () => {
    await start();
    let resolve!: (stream: MediaStream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(() => new Promise(done => { resolve = done; }));
    await act(async () => {
      navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
      await vi.advanceTimersByTimeAsync(400);
      navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
    await act(async () => { resolve(streamFor(new FakeTrack()) as unknown as MediaStream); });
    expect(captureSources).toHaveBeenCalledTimes(2);
  });

  it.each(['ended', 'mute', 'devicechange'])('rebinds capture after %s without advancing or interrupting speech', async event => {
    const { result, heard } = await start();
    const socket = FakeSocket.latest;
    const replacement = streamFor(new FakeTrack());
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(replacement as unknown as MediaStream);
    await act(async () => {
      result.current.setStatus('speaking');
      if (event === 'devicechange') navigator.mediaDevices.dispatchEvent(new Event(event));
      else {
        if (event === 'ended') initialTrack.readyState = 'ended';
        else initialTrack.muted = true;
        initialTrack.dispatchEvent(new Event(event));
      }
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(captureSources).toHaveBeenLastCalledWith(replacement);
    expect(captureSources.mock.calls.at(-1)?.[0]).toBe(replacement);
    expect(FakeSocket.latest).toBe(socket);
    expect(result.current.getStatus()).toBe('speaking');
    expect(initialTrack.stop).toHaveBeenCalled();
    expect(heard).not.toHaveBeenCalled();
    expect(cancelSpeech).not.toHaveBeenCalled();
  });

  it('does not replace a microphone that unmutes during the grace period', async () => {
    await start();
    await act(async () => {
      initialTrack.muted = true;
      initialTrack.dispatchEvent(new Event('mute'));
      initialTrack.muted = false;
      initialTrack.dispatchEvent(new Event('unmute'));
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('stops a late replacement stream if the driver stops while permission is pending', async () => {
    const { result } = await start();
    let resolve!: (stream: MediaStream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(() => new Promise(done => { resolve = done; }));
    await act(async () => {
      navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
    const track = new FakeTrack();
    await act(async () => {
      result.current.stopListening();
      resolve(streamFor(track) as unknown as MediaStream);
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(track.stop).toHaveBeenCalledOnce();
    expect(result.current.getStatus()).toBe('idle');
    expect(captureSources).toHaveBeenCalledTimes(1);
  });

  it('reports a recoverable failure when the replacement microphone is denied', async () => {
    const { errors } = await start();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new Error('Device unavailable'));
    await act(async () => {
      initialTrack.readyState = 'ended';
      initialTrack.dispatchEvent(new Event('ended'));
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(errors).toHaveBeenLastCalledWith('Microphone disconnected — tap to reconnect.');
  });
});

describe('real microphone transcript dispatch with fake browser devices', () => {
  it('ignores a final transcript that arrives after Stop', async () => {
    const { result, heard } = await start();
    const socket = FakeSocket.latest;
    await act(async () => { result.current.stopListening(); });
    await act(async () => { socket.transcript('next'); });
    expect(heard).not.toHaveBeenCalled();
    expect(result.current.getStatus()).toBe('idle');
  });

  it('awaits the existing connection attempt instead of reporting a second start as ready', async () => {
    let resolveToken!: (value: { ok: boolean; json: () => Promise<{ token: string; expires_in: number }> }) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { resolveToken = resolve; }));
    const hook = renderHook(() => useVoice({}));
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    let secondSettled = false;
    await act(async () => {
      first = hook.result.current.startListening();
      second = hook.result.current.startListening();
      void second.finally(() => { secondSettled = true; });
      await Promise.resolve();
    });
    expect(secondSettled).toBe(false);
    await act(async () => {
      resolveToken({ ok: true, json: async () => ({ token: 'fake-token', expires_in: 600 }) });
      expect(await first).toBe(true);
      expect(await second).toBe(true);
    });
    expect(FakeSocket.created).toBe(1);
  });

  it('does not let an interrupted announcement replay fallback speech or overwrite newer state', async () => {
    const { result } = await start();
    let rejectTts!: (reason: Error) => void;
    vi.mocked(fetch).mockImplementation((url: string) => {
      if (url.endsWith('/token')) return Promise.resolve({ ok: true, json: async () => ({ token: 'fake-token', expires_in: 600 }) } as Response);
      return new Promise((_, reject) => { rejectTts = reject; });
    });
    let announcement!: Promise<void>;
    await act(async () => {
      announcement = result.current.speak('Proceed to the next machine.');
      await Promise.resolve();
    });
    expect(result.current.getStatus()).toBe('speaking');
    await act(async () => {
      result.current.stopAudio({ keepSpeakingAfter: true });
      result.current.setStatus('thinking');
      rejectTts(new Error('cancelled request'));
      await announcement;
    });
    expect(synthSpeak).not.toHaveBeenCalled();
    expect(result.current.getStatus()).toBe('thinking');
  });

  it('rechecks queued numeric input when picking begins before dispatch', async () => {
    const { result, rerender, heard } = await start();
    rerender({ picking: false });
    await act(async () => {
      result.current.setStatus('error');
      FakeSocket.latest.transcript('12');
    });
    expect(heard).not.toHaveBeenCalled();
    expect(chime).not.toHaveBeenCalled();
    rerender({ picking: true });
    await act(async () => {
      await result.current.resumeListening();
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(heard).not.toHaveBeenCalled();
    expect(chime).not.toHaveBeenCalled();
  });

  it('does not replay a queued command after an explicit stop and restart', async () => {
    const { result, heard } = await start();
    await act(async () => {
      result.current.setStatus('error');
      FakeSocket.latest.transcript('next');
      expect(heard).not.toHaveBeenCalled();
      expect(chime).not.toHaveBeenCalled();
      result.current.stopListening();
      expect(await result.current.startListening()).toBe(true);
      await result.current.resumeListening();
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(heard).not.toHaveBeenCalled();
    expect(chime).not.toHaveBeenCalled();
  });

  it('ignores a segmented count at UtteranceEnd without swallowing the following command', async () => {
    const { heard } = await start();
    await act(async () => {
      FakeSocket.latest.transcript('twenty', false);
      FakeSocket.latest.transcript('two', false);
      FakeSocket.latest.onmessage?.({ data: JSON.stringify({ type: 'UtteranceEnd' }) });
      await vi.advanceTimersByTimeAsync(201);
    });
    expect(heard).not.toHaveBeenCalled();
    expect(chime).not.toHaveBeenCalled();
    await act(async () => { FakeSocket.latest.transcript('next'); });
    expect(heard).toHaveBeenCalledExactlyOnceWith('next', true);
    expect(chime).toHaveBeenCalledOnce();
  });

  it('does not dispatch a command twice when UtteranceEnd follows the fallback timer', async () => {
    const { heard } = await start();
    await act(async () => {
      FakeSocket.latest.transcript('next', false);
      await vi.advanceTimersByTimeAsync(201);
      FakeSocket.latest.onmessage?.({ data: JSON.stringify({ type: 'UtteranceEnd' }) });
      await vi.advanceTimersByTimeAsync(201);
    });
    expect(heard).toHaveBeenCalledExactlyOnceWith('next', true);
    expect(chime).toHaveBeenCalledOnce();
  });

  it.each(['listening', 'speaking', 'thinking', 'error'] as VoiceStatus[])(
    'counting during %s neither interrupts, acknowledges nor replays', async status => {
      const { result, heard } = await start();
      await act(async () => {
        result.current.setStatus(status);
        FakeSocket.latest.transcript('12');
      });
      expect(result.current.getStatus()).toBe(status);
      expect(cancelSpeech).not.toHaveBeenCalled();
      expect(chime).not.toHaveBeenCalled();
      expect(heard).not.toHaveBeenCalled();
      await act(async () => {
        await result.current.resumeListening();
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(chime).not.toHaveBeenCalled();
      expect(heard).not.toHaveBeenCalled();
    },
  );

  it('does not replace a queued next command with a spoken count', async () => {
    const { result, heard } = await start();
    await act(async () => {
      result.current.setStatus('error');
      FakeSocket.latest.transcript('next');
      FakeSocket.latest.transcript('12');
      expect(heard).not.toHaveBeenCalled();
      expect(chime).not.toHaveBeenCalled();
      await result.current.resumeListening();
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(heard).toHaveBeenCalledExactlyOnceWith('next', true);
    expect(chime).toHaveBeenCalledTimes(1);
  });

  it('keeps normal command interruption working', async () => {
    const { result, heard } = await start();
    await act(async () => {
      result.current.setStatus('speaking');
      FakeSocket.latest.transcript('next');
    });
    expect(cancelSpeech).toHaveBeenCalledOnce();
    expect(chime).toHaveBeenCalledOnce();
    expect(heard).toHaveBeenCalledExactlyOnceWith('next', true);
  });

  it('uses current route context after rerender, allowing numeric route/date answers', async () => {
    const { rerender, heard } = await start();
    rerender({ picking: false });
    await act(async () => { FakeSocket.latest.transcript('12'); });
    expect(heard).toHaveBeenCalledExactlyOnceWith('12', true);
  });

  it('ignores counting assembled by the fallback timer', async () => {
    const { heard } = await start();
    await act(async () => {
      FakeSocket.latest.transcript('twelve', false);
      await vi.advanceTimersByTimeAsync(201);
    });
    expect(heard).not.toHaveBeenCalled();
    expect(chime).not.toHaveBeenCalled();
  });
});
