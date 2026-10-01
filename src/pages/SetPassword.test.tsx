// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PASSWORD_FLOW_STORAGE_KEY } from '@/lib/authRecovery';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  updateUser: vi.fn(),
  toastSuccess: vi.fn(),
  user: { id: 'user-1' } as { id: string } | null,
  loading: false,
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...props}>{children}</a>
  ),
  useNavigate: () => mocks.navigate,
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mocks.user, loading: mocks.loading }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { updateUser: mocks.updateUser } },
}));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess } }));

import SetPassword from './SetPassword';

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.user = { id: 'user-1' };
  mocks.loading = false;
  mocks.updateUser.mockResolvedValue({ error: null });
});

afterEach(() => cleanup());

it('refuses the password form for an ordinary authenticated session', async () => {
  render(<SetPassword />);
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(
    '/dashboard', { replace: true },
  ));
});

it('updates the password only for a marked recovery flow and consumes the marker', async () => {
  window.sessionStorage.setItem(PASSWORD_FLOW_STORAGE_KEY, 'recovery');
  render(<SetPassword />);

  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'new-password' } });
  fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'new-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Set Password' }));

  await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'new-password' }));
  expect(window.sessionStorage.getItem(PASSWORD_FLOW_STORAGE_KEY)).toBeNull();
  expect(mocks.navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
});
