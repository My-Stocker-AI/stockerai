import { describe, expect, it } from 'vitest';
import { requireLocalTarget, testDatabase } from './testSafety';

describe('disposable test target boundary', () => {
  it.each([
    undefined, '', 'https://wvtkuposrlvadyeixlke.supabase.co', 'https://staging.supabase.co',
    'http://localhost.evil.test:54321', 'http://localhost:54321@evil.test',
    'http://user:secret@localhost:54321', 'http://localhost',
    'http://127.0.0.1:54321/path', 'http://127.0.0.1:54321?target=production',
  ])('refuses %s before creating a client', target => {
    expect(() => requireLocalTarget(target)).toThrow();
  });
  it.each(['http://localhost:54321', 'http://127.0.0.1:54321/', 'http://[::1]:54321'])(
    'accepts explicit loopback %s', target => expect(requireLocalTarget(target)).toBe(target.replace(/\/$/, '')),
  );
  it('does not inherit normal application credentials', () => {
    expect(() => testDatabase({ VITE_SUPABASE_URL: 'http://localhost:54321', SUPABASE_SERVICE_ROLE_KEY: 'placeholder' })).toThrow();
  });
  it('requires a dedicated key even after opt-in', () => {
    expect(() => testDatabase({ STOCKERAI_DB_TESTS: '1', STOCKERAI_TEST_SUPABASE_URL: 'http://localhost:54321' })).toThrow();
  });
});
