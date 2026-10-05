// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PASSWORD_FLOW_STORAGE_KEY } from '@/lib/authRecovery';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  getSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [new URLSearchParams(window.location.search)],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
  },
}));

import AuthCallback from './AuthCallback';

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/auth/callback?type=recovery');
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null });
  mocks.exchangeCodeForSession.mockResolvedValue({
    data: { session: { user: { id: 'user-1' } } },
    error: null,
  });
});

afterEach(() => cleanup());

it('marks an authenticated recovery flow before opening the password form', async () => {
  render(<AuthCallback />);

  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(
    '/set-password', { replace: true },
  ));
  expect(window.sessionStorage.getItem(PASSWORD_FLOW_STORAGE_KEY)).toBe('recovery');
});

it('exchanges a PKCE code when the callback has no session yet', async () => {
  window.history.replaceState({}, '', '/auth/callback?type=recovery&code=fixture-code');
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });

  render(<AuthCallback />);

  await waitFor(() => expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('fixture-code'));
  expect(mocks.navigate).toHaveBeenCalledWith('/set-password', { replace: true });
});

it('sends a confirmed new company to card-required billing setup', async () => {
  window.history.replaceState({}, '', '/auth/callback?type=signup');

  render(<AuthCallback />);

  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(
    '/dashboard/billing?setup=required', { replace: true },
  ));
});

it('does not open the password form without a recovery session', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  render(<AuthCallback />);

  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(
    '/login?error=recovery_session_missing', { replace: true },
  ));
  expect(window.sessionStorage.getItem(PASSWORD_FLOW_STORAGE_KEY)).toBeNull();
});

it('offers retry instead of spinning forever when session completion fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.getSession
    .mockRejectedValueOnce(new Error('network unavailable'))
    .mockResolvedValueOnce({ data: { session: { user: { id: 'user-1' } } }, error: null });

  render(<AuthCallback />);

  expect(await screen.findByText('We could not finish signing you in')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(
    '/set-password', { replace: true },
  ));
});
