import { describe, expect, it, vi } from 'vitest';
import { legacyPickingHandler } from '../../supabase/functions/_shared/legacy-picking';

const request = (body: unknown = {}, authorization = 'Bearer test-login') => new Request('https://edge.invalid/function', {
  method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const transition = { session_id: 'session', operation_id: 'operation', expected_revision: 'revision',
  expected_machine_id: 'machine', expected_state: { completed_items: 1 }, user_id: 'forged', action: 'reset' };

describe('legacy picking authorization boundary', () => {
  it.each(['status', 'next'] as const)('rejects missing login before contacting %s backend', async kind => {
    const send = vi.fn();
    expect((await legacyPickingHandler(kind, send)(request({}, ''))).status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });
  it('discards body identity and target on read-only status', async () => {
    const send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ progress: '1/3' })));
    const response = await legacyPickingHandler('status', send)(request({ user_id: 'another-user', session_id: 'foreign' }));
    const [url, init] = send.mock.calls[0];
    expect(url).toBe('https://stockerai-api.onrender.com/api/get-current-status');
    expect(init.headers).toEqual({ Authorization: 'Bearer test-login', 'Content-Type': 'application/json' });
    expect(init.body).toBe('{}');
    expect(init.redirect).toBe('error');
    expect(await response.json()).toEqual({ progress: '1/3' });
  });
  it('refuses old untargeted mutation without guessing a session or forwarding', async () => {
    const send = vi.fn();
    expect((await legacyPickingHandler('next', send)(request({ user_id: 'any', count: 1 }))).status).toBe(409);
    expect(send).not.toHaveBeenCalled();
  });
  it('forwards versioned mutation only as next with the original login', async () => {
    const send = vi.fn().mockResolvedValue(new Response('{}'));
    await legacyPickingHandler('next', send)(request(transition));
    expect(send.mock.calls[0][0]).toContain('/api/picking-transition');
    expect(JSON.parse(send.mock.calls[0][1].body)).toEqual({ ...transition, action: 'next' });
  });
  it.each([401, 403, 409, 422, 500])('preserves refusal %s without exposing upstream error details', async status => {
    const send = vi.fn().mockResolvedValue(new Response('PRIVATE ERROR', { status }));
    const response = await legacyPickingHandler('status', send)(request());
    expect(response.status).toBe(status === 500 ? 503 : status);
    expect(await response.text()).not.toContain('PRIVATE ERROR');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not retry an uncertain mutation', async () => {
    const send = vi.fn().mockRejectedValue(new Error('timeout after commit'));
    expect((await legacyPickingHandler('next', send)(request(transition))).status).toBe(503);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('keeps CORS preflight public but refuses other methods', async () => {
    const send = vi.fn(); const handle = legacyPickingHandler('status', send);
    expect((await handle(new Request('https://edge.invalid', { method: 'OPTIONS' }))).status).toBe(200);
    expect((await handle(new Request('https://edge.invalid'))).status).toBe(405);
    expect(send).not.toHaveBeenCalled();
  });
  it.each([null, [], 'text'])('rejects non-object JSON %j', async value => {
    const send = vi.fn();
    expect((await legacyPickingHandler('status', send)(request(value))).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
});
