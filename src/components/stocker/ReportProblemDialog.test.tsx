// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReportProblemDialog } from './ReportProblemDialog';

const mocks = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock('@/lib/authFetch', () => ({ authFetch: mocks.authFetch }));

const props = {
  isOpen: true,
  onClose: vi.fn(),
  userId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002',
  routeId: '00000000-0000-4000-8000-000000000003',
  context: { route: { name: 'Test route' }, device: { standalone: true } },
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  vi.stubGlobal('crypto', {
    ...globalThis.crypto,
    randomUUID: () => '00000000-0000-4000-8000-000000000004',
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('submits the report without including diagnostic event payloads', async () => {
  mocks.authFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 201 }));
  const view = render(<ReportProblemDialog {...props} />);
  act(() => window.dispatchEvent(new CustomEvent('voice-diagnostic', {
    detail: { type: 'recognition-final', data: { transcript: 'private words' } },
  })));
  fireEvent.change(view.getByLabelText('What happened?'), { target: { value: 'The item repeated.' } });
  fireEvent.click(view.getByRole('button', { name: 'Send report' }));
  await waitFor(() => expect(view.getByText('Report received.')).toBeTruthy());
  const request = mocks.authFetch.mock.calls[0][1];
  const body = JSON.parse(request.body);
  expect(body.context.recent_voice_events).toEqual([
    expect.objectContaining({ type: 'recognition-final' }),
  ]);
  expect(JSON.stringify(body)).not.toContain('private words');
});

it('queues an offline report without changing route progress', async () => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
  const view = render(<ReportProblemDialog {...props} />);
  fireEvent.change(view.getByLabelText('What happened?'), { target: { value: 'The connection stopped.' } });
  fireEvent.click(view.getByRole('button', { name: 'Send report' }));
  await waitFor(() => expect(view.getByText('Saved on this phone.')).toBeTruthy());
  expect(mocks.authFetch).not.toHaveBeenCalled();
  const queue = JSON.parse(localStorage.getItem(`stockerai:incident-queue:${props.userId}`) || '[]');
  expect(queue).toHaveLength(1);
  expect(queue[0].description).toBe('The connection stopped.');
});
