// @vitest-environment jsdom
import React, { PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

type AuthCallback = (event: string, session: Session | null) => void;

const mocks = vi.hoisted(() => ({
  authCallback: null as AuthCallback | null,
  getSession: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  roleLoads: new Map<string, ReturnType<typeof deferred>>(),
  profileLoads: new Map<string, ReturnType<typeof deferred>>(),
}));

function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const query = (table: string) => {
  let userId = '';
  const builder = {
    select: () => builder,
    eq: (_column: string, value: string) => {
      userId = value;
      return builder;
    },
    single: () => {
      const loads = table === 'account_users' ? mocks.roleLoads : mocks.profileLoads;
      if (!loads.has(userId)) loads.set(userId, deferred());
      return loads.get(userId)!.promise;
    },
  };
  return builder;
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => query(table),
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: (callback: AuthCallback) => {
        mocks.authCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      signInWithPassword: mocks.signInWithPassword,
      signUp: vi.fn(),
      signOut: mocks.signOut,
    },
  },
}));

import { AuthProvider, useAuth } from './useAuth';

const session = (id: string) => ({ user: { id } } as Session);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authCallback = null;
  mocks.roleLoads.clear();
  mocks.profileLoads.clear();
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  window.sessionStorage.clear();
});

afterEach(() => cleanup());

const createWrapper = (queryClient: QueryClient) => (
  ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
);

it('ignores stale role/profile responses after a rapid identity change', async () => {
  const queryClient = new QueryClient();
  const clear = vi.spyOn(queryClient, 'clear');
  const { result } = renderHook(useAuth, { wrapper: createWrapper(queryClient) });
  await waitFor(() => expect(result.current.loading).toBe(false));

  act(() => mocks.authCallback?.('SIGNED_IN', session('user-a')));
  await waitFor(() => expect(mocks.roleLoads.has('user-a')).toBe(true));

  act(() => mocks.authCallback?.('SIGNED_IN', session('user-b')));
  await waitFor(() => expect(mocks.roleLoads.has('user-b')).toBe(true));

  await act(async () => {
    mocks.roleLoads.get('user-b')!.resolve({
      data: { role: 'driver', can_view_all_routes: false, account_id: 'account-b' },
      error: null,
    });
    mocks.profileLoads.get('user-b')!.resolve({
      data: { first_name: 'User', last_name: 'B', email: 'b@example.invalid' },
      error: null,
    });
  });
  await waitFor(() => expect(result.current.userRole?.account_id).toBe('account-b'));

  await act(async () => {
    mocks.roleLoads.get('user-a')!.resolve({
      data: { role: 'primary_admin', can_view_all_routes: true, account_id: 'account-a' },
      error: null,
    });
    mocks.profileLoads.get('user-a')!.resolve({
      data: { first_name: 'User', last_name: 'A', email: 'a@example.invalid' },
      error: null,
    });
  });

  expect(result.current.user?.id).toBe('user-b');
  expect(result.current.userRole?.account_id).toBe('account-b');
  expect(result.current.userProfile?.email).toBe('b@example.invalid');
  expect(clear).toHaveBeenCalledTimes(2);
});

it('does not let a slow initial empty-session snapshot overwrite a newer sign-in', async () => {
  const initialSession = deferred<{ data: { session: Session | null } }>();
  mocks.getSession.mockReturnValue(initialSession.promise);
  const queryClient = new QueryClient();
  const { result } = renderHook(useAuth, { wrapper: createWrapper(queryClient) });

  act(() => mocks.authCallback?.('SIGNED_IN', session('new-user')));
  await waitFor(() => expect(mocks.roleLoads.has('new-user')).toBe(true));
  await act(async () => {
    mocks.roleLoads.get('new-user')!.resolve({
      data: { role: 'driver', can_view_all_routes: false, account_id: 'new-account' },
      error: null,
    });
    mocks.profileLoads.get('new-user')!.resolve({
      data: { first_name: 'New', last_name: 'User', email: 'new@example.invalid' },
      error: null,
    });
  });
  await waitFor(() => expect(result.current.userRole?.account_id).toBe('new-account'));

  await act(async () => initialSession.resolve({ data: { session: null } }));

  expect(result.current.user?.id).toBe('new-user');
  expect(result.current.userRole?.account_id).toBe('new-account');
});

it('sends reset links to the recovery callback instead of the login redirect', async () => {
  const queryClient = new QueryClient();
  const { result } = renderHook(useAuth, { wrapper: createWrapper(queryClient) });
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.resetPassword('driver@example.invalid');
  });

  expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
    'driver@example.invalid',
    { redirectTo: `${window.location.origin}/auth/callback?type=recovery` },
  );
});
