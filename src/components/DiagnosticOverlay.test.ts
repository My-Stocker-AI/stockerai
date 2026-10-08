// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authFetch: vi.fn(async () => new Response(null, { status: 204 })),
}));
vi.mock('@/lib/authFetch', () => ({ authFetch: mocks.authFetch }));

import { DiagnosticOverlay } from './DiagnosticOverlay';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('records typed transcript and provider-close diagnostic events', async () => {
  const view = render(React.createElement(DiagnosticOverlay, {
    voiceStatus: 'listening',
    isDeepgramConnected: true,
    isVisible: true,
    onClose: vi.fn(),
  }));

  act(() => {
    window.dispatchEvent(new CustomEvent('voice-diagnostic', {
      detail: { type: 'transcript', data: 'next item' },
    }));
    window.dispatchEvent(new CustomEvent('voice-diagnostic', {
      detail: {
        type: 'deepgram-disconnected',
        data: { code: 1006, reason: 'network', reconnectAttempt: 2 },
      },
    }));
  });

  await waitFor(() => expect(view.getByText('next item')).toBeTruthy());
  expect(view.getByText('DG close 1006 — network (try 2)')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Copy log (2)' })).toBeTruthy();
});

it('ignores malformed diagnostic events without changing the trail', () => {
  const view = render(React.createElement(DiagnosticOverlay, {
    voiceStatus: 'idle',
    isDeepgramConnected: false,
    isVisible: true,
    onClose: vi.fn(),
  }));

  act(() => {
    window.dispatchEvent(new CustomEvent('voice-diagnostic', { detail: { data: 'missing type' } }));
    window.dispatchEvent(new Event('voice-diagnostic'));
  });

  expect(view.getByRole('button', { name: 'Copy log (0)' })).toBeTruthy();
});

it('keeps unsent voice events on the phone and retries them when connectivity returns', async () => {
  vi.useFakeTimers();
  mocks.authFetch.mockRejectedValueOnce(new Error('offline'));
  render(React.createElement(DiagnosticOverlay, {
    voiceStatus: 'listening',
    isDeepgramConnected: true,
    isVisible: false,
    onClose: vi.fn(),
    queueOwner: 'driver-a',
  }));

  act(() => window.dispatchEvent(new CustomEvent('voice-diagnostic', {
    detail: { type: 'voice-recovery', data: { phase: 'attempt-failed', stage: 'capture' } },
  })));
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  const queueKey = 'stocker-voice-diagnostic-queue-v2:driver-a';
  const queued = JSON.parse(localStorage.getItem(queueKey) || '[]');
  expect(queued).toHaveLength(1);
  expect(queued[0].sessionId).toEqual(expect.any(String));
  expect(queued[0].entry.type).toBe('voice-recovery');

  mocks.authFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await act(async () => {
    window.dispatchEvent(new Event('online'));
    await Promise.resolve();
    await Promise.resolve();
  });
  const retryCall = mocks.authFetch.mock.calls.at(-1) as unknown as [string, RequestInit];
  const retryRequest = retryCall[1];
  expect(JSON.parse(String(retryRequest.body)).session_id).toBe(queued[0].sessionId);
  expect(JSON.parse(localStorage.getItem(queueKey) || '[]')).toHaveLength(0);
  vi.useRealTimers();
});

it('keeps queued diagnostics partitioned by driver', () => {
  const driverAQueue = [{
    sessionId: 'original-session',
    entry: { t: Date.now(), type: 'voice-recovery', data: { phase: 'started' } },
  }];
  localStorage.setItem('stocker-voice-diagnostic-queue-v2:driver-a', JSON.stringify(driverAQueue));

  render(React.createElement(DiagnosticOverlay, {
    voiceStatus: 'idle',
    isDeepgramConnected: false,
    isVisible: false,
    onClose: vi.fn(),
    queueOwner: 'driver-b',
  }));

  expect(JSON.parse(localStorage.getItem('stocker-voice-diagnostic-queue-v2:driver-a') || '[]')).toHaveLength(1);
  expect(JSON.parse(localStorage.getItem('stocker-voice-diagnostic-queue-v2:driver-b') || '[]')).toHaveLength(0);
  expect(mocks.authFetch).not.toHaveBeenCalled();
});
