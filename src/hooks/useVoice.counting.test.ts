// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoice, type VoiceStatus } from './useVoice';
import { isBareNumber } from '@/utils/spokenNumber';

const chime = vi.fn();
const cancelSpeech = vi.fn();
const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() });
class FakeAudioContext {
  state = 'running'; currentTime = 0; destination = {};
  audioWorklet = { addModule: vi.fn(async () => {}) };
  resume = vi.fn(async () => {}); close = vi.fn(async () => {});
  createBuffer = vi.fn(() => ({})); createBufferSource = node;
  createMediaStreamSource = node;
  createOscillator() { chime(); return { ...node(), frequency: { value: 0, setValueAtTime: vi.fn() } }; }
  createGain() { return { ...node(), gain: { value: 0, exponentialRampToValueAtTime: vi.fn() } }; }
}
class FakeSocket {
  static OPEN = 1;
  static latest: FakeSocket;
  readyState = 1;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  send = vi.fn(); close = vi.fn();
  constructor() { FakeSocket.latest = this; queueMicrotask(() => this.onopen?.()); }
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
  vi.stubGlobal('AudioWorkletNode', class { port = { onmessage: null }; connect() {} disconnect() {} });
  vi.stubGlobal('Audio', class { play = vi.fn(async () => {}); pause = vi.fn(); });
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('speechSynthesis', { cancel: cancelSpeech, speaking: false });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (!url.endsWith('/token')) throw new Error('Unexpected network call');
    return { ok: true, json: async () => ({ token: 'fake-token', expires_in: 600 }) };
  }));
  const track = { stop: vi.fn(), readyState: 'live' };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: vi.fn(async () => ({ getTracks: () => [track], getAudioTracks: () => [track] })),
  } });
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
  return { ...hook, heard };
}

describe('real microphone transcript dispatch with fake browser devices', () => {
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
      result.current.setThinking();
      FakeSocket.latest.transcript('next');
      FakeSocket.latest.transcript('12');
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
