// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { useSessionPersistence } from './useSessionPersistence';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('does not report an unreadable local database as an empty saved session', async () => {
  vi.stubGlobal('indexedDB', { open: () => { throw new Error('Fixture storage unavailable'); } });
  const { result } = renderHook(useSessionPersistence);
  await expect(result.current.load('fixture-user')).rejects.toThrow('Fixture storage unavailable');
});
