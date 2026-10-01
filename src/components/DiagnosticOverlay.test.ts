// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authFetch: vi.fn(async () => new Response(null, { status: 204 })),
}));
vi.mock('@/lib/authFetch', () => ({ authFetch: mocks.authFetch }));

import { DiagnosticOverlay } from './DiagnosticOverlay';

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
