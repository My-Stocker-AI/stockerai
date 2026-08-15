import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * THE LOGIN THAT EXPIRES MID-ROUTE.
 *
 * A login lasts about an hour. A route takes longer. So partway down a machine, the stocker's
 * login goes stale and the server stops answering — and he has no idea why, because nothing
 * he did caused it. He just hears an error where the next item should be.
 *
 * The recovery is one quiet renewal and one retry. It is the single most likely thing to
 * strand a driver, and it only happens in a situation nobody recreates by hand. So it is
 * tested here rather than discovered out on a route.
 */

const getSession = vi.fn();
const refreshSession = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: () => getSession(), refreshSession: () => refreshSession() } },
}));

const { authFetch, authHeaders } = await import('./authFetch');

const withToken = (token: string) => ({ data: { session: { access_token: token } }, error: null });
const signedOut = { data: { session: null }, error: null };

function response(status: number) {
  return { status, ok: status < 400 } as Response;
}

function headerOn(call: number): string | undefined {
  const init = (globalThis.fetch as any).mock.calls[call][1] as RequestInit;
  return new Headers(init.headers).get('Authorization') ?? undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  globalThis.fetch = vi.fn();
});

describe('every call carries the driver login', () => {
  it('attaches the login it has', async () => {
    getSession.mockResolvedValue(withToken('tok-abc'));
    (globalThis.fetch as any).mockResolvedValue(response(200));

    await authFetch('https://api/x', { method: 'POST' });

    expect(headerOn(0)).toBe('Bearer tok-abc');
  });

  it('leaves the request alone when nobody is signed in, so the server decides — not the app', async () => {
    getSession.mockResolvedValue(signedOut);
    refreshSession.mockResolvedValue(signedOut);
    (globalThis.fetch as any).mockResolvedValue(response(401));

    const res = await authFetch('https://api/x');

    expect(headerOn(0)).toBeUndefined();
    expect(res.status).toBe(401);
  });

  it('fails cleanly instead of crashing when the phone is offline and the login cannot be read', async () => {
    // A warehouse dead-spot is ordinary. Reading or renewing the login throws outright there,
    // and an escaping crash would look like a broken app rather than a lost signal.
    getSession.mockRejectedValue(new Error('Failed to fetch'));
    (globalThis.fetch as any).mockResolvedValue(response(401));

    const res = await authFetch('https://api/x');
    expect(res.status).toBe(401);
  });

  it('fails cleanly when the renewal itself throws mid-route', async () => {
    getSession.mockResolvedValue(withToken('stale-token'));
    refreshSession.mockRejectedValue(new Error('Failed to fetch'));
    (globalThis.fetch as any).mockResolvedValue(response(401));

    const res = await authFetch('https://api/get-next-item', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    expect((globalThis.fetch as any).mock.calls).toHaveLength(1);
  });

  it('keeps the method, body and any other headers exactly as given', async () => {
    getSession.mockResolvedValue(withToken('tok-abc'));
    (globalThis.fetch as any).mockResolvedValue(response(200));

    await authFetch('https://api/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Trace': 'keep-me' },
      body: '{"session_id":"s1"}',
    });

    const init = (globalThis.fetch as any).mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"session_id":"s1"}');
    expect(new Headers(init.headers).get('X-Trace')).toBe('keep-me');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('never sets a content type of its own, so a PDF upload keeps its own boundary', async () => {
    getSession.mockResolvedValue(withToken('tok-abc'));
    (globalThis.fetch as any).mockResolvedValue(response(200));

    await authFetch('https://api/upload-pdf', { method: 'POST', body: new FormData() });

    const init = (globalThis.fetch as any).mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('Content-Type')).toBeNull();
  });
});

describe('a login that expires halfway down a machine', () => {
  it('renews it and retries once, so the stocker hears the next item instead of an error', async () => {
    getSession.mockResolvedValue(withToken('stale-token'));
    refreshSession.mockResolvedValue(withToken('fresh-token'));
    (globalThis.fetch as any)
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200));

    const res = await authFetch('https://api/get-next-item', { method: 'POST', body: '{}' });

    expect(res.status).toBe(200);
    expect((globalThis.fetch as any).mock.calls).toHaveLength(2);
    expect(headerOn(0)).toBe('Bearer stale-token');
    expect(headerOn(1)).toBe('Bearer fresh-token');
  });

  it('sends the same body on the retry — the command must not be lost', async () => {
    getSession.mockResolvedValue(withToken('stale-token'));
    refreshSession.mockResolvedValue(withToken('fresh-token'));
    (globalThis.fetch as any)
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200));

    await authFetch('https://api/skip-machine', { method: 'POST', body: '{"session_id":"s1"}' });

    const [, first] = (globalThis.fetch as any).mock.calls[0];
    const [, second] = (globalThis.fetch as any).mock.calls[1];
    expect(second.body).toBe(first.body);
    expect(second.method).toBe('POST');
  });

  it('tries exactly once more and then stops, so a signed-out driver fails fast instead of hammering', async () => {
    getSession.mockResolvedValue(withToken('stale-token'));
    refreshSession.mockResolvedValue(withToken('fresh-token'));
    (globalThis.fetch as any).mockResolvedValue(response(401));

    const res = await authFetch('https://api/x');

    expect(res.status).toBe(401);
    expect((globalThis.fetch as any).mock.calls).toHaveLength(2);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('gives back the original refusal when the login cannot be renewed at all', async () => {
    getSession.mockResolvedValue(withToken('stale-token'));
    refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'refresh failed' } });
    (globalThis.fetch as any).mockResolvedValue(response(401));

    const res = await authFetch('https://api/x');

    expect(res.status).toBe(401);
    expect((globalThis.fetch as any).mock.calls).toHaveLength(1);
  });

  it('does not renew on any other failure — a server error is not a login problem', async () => {
    getSession.mockResolvedValue(withToken('tok-abc'));
    (globalThis.fetch as any).mockResolvedValue(response(500));

    const res = await authFetch('https://api/x');

    expect(res.status).toBe(500);
    expect(refreshSession).not.toHaveBeenCalled();
    expect((globalThis.fetch as any).mock.calls).toHaveLength(1);
  });

  it('does not renew on a refusal that means "not your account" — retrying cannot fix that', async () => {
    getSession.mockResolvedValue(withToken('tok-abc'));
    (globalThis.fetch as any).mockResolvedValue(response(403));

    const res = await authFetch('https://api/x');

    expect(res.status).toBe(403);
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

describe('the headers-only helper', () => {
  it('hands back the login for a call site that builds its own request', async () => {
    getSession.mockResolvedValue(withToken('tok-abc'));
    expect(await authHeaders()).toEqual({ Authorization: 'Bearer tok-abc' });
  });

  it('hands back nothing when nobody is signed in', async () => {
    getSession.mockResolvedValue(signedOut);
    expect(await authHeaders()).toEqual({});
  });
});
