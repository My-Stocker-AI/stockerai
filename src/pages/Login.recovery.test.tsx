// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PASSWORD_FLOW_STORAGE_KEY } from '@/lib/authRecovery';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  location: { search: '', hash: '#access_token=fixture&type=recovery' },
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...props}>{children}</a>
  ),
  useLocation: () => mocks.location,
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [new URLSearchParams()],
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    loading: false,
    signIn: vi.fn(),
    resetPassword: vi.fn(),
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

import Login from './Login';

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.location = { search: '', hash: '#access_token=fixture&type=recovery' };
});

afterEach(() => cleanup());

it('recovers legacy login-targeted reset links instead of redirecting to the dashboard', async () => {
  render(<Login />);

  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(
    '/set-password', { replace: true },
  ));
  expect(mocks.navigate).not.toHaveBeenCalledWith('/dashboard');
  expect(window.sessionStorage.getItem(PASSWORD_FLOW_STORAGE_KEY)).toBe('recovery');
});
