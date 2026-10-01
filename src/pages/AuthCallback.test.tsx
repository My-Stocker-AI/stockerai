// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
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

it('does not open the password form without a recovery session', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  render(<AuthCallback />);

  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(
    '/login?error=recovery_session_missing', { replace: true },
  ));
  expect(window.sessionStorage.getItem(PASSWORD_FLOW_STORAGE_KEY)).toBeNull();
});
