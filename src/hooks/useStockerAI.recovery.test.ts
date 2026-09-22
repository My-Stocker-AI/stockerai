// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/authFetch', () => ({ authFetch: mocks.fetch }));
import { useStockerAI } from './useStockerAI';

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function tool(name = 'skip_current_machine') {
  return { id: `test-${name}`, function: { name, arguments: JSON.stringify({ expected_machine_id: 'm1' }) } };
}

it.each([400, 401, 403, 409, 429, 500])('handles HTTP %s without replaying or reporting success', async status => {
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ detail: 'Machine is already skipped' }), { status }));
  const { result } = renderHook(() => useStockerAI());
  result.current.setSession('session', 'test-user');
  const success = vi.fn();
  let replies: any;
  await act(async () => { replies = await result.current.executeToolCalls([tool(), tool('start_machine')], success); });
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(success).not.toHaveBeenCalled();
  expect(replies[0].result.error).toBeTruthy();
  expect(replies[0].result.status).toBe(status);
  expect(replies[0].result.user_message).toBeTruthy();
  expect(replies[0].result.user_message).not.toMatch(/say that again/i);
  expect(replies).toHaveLength(2);
  expect(replies[1].result.error).toBe('Not executed after earlier failure');
});

it('does not report an HTTP-200 error envelope as success', async () => {
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: 'internal failure' })));
  const { result } = renderHook(() => useStockerAI());
  result.current.setSession('session', 'test-user');
  const success = vi.fn();
  const replies = await result.current.executeToolCalls([tool()], success);
  expect(success).not.toHaveBeenCalled();
  expect(replies[0].result.error).toBeTruthy();
});

it.each(['get_next_item', 'skip_current_machine', 'start_machine'])('does not replay %s after response loss', async name => {
  mocks.fetch.mockRejectedValue(new TypeError('Network response lost after commit'));
  const { result } = renderHook(() => useStockerAI());
  result.current.setSession('session', 'test-user');
  let replies: any;
  await act(async () => { replies = await result.current.executeToolCalls([tool(name)]); });
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(replies[0].result.user_message).toContain('Check your saved route');
});

it('never exposes raw server diagnostics to voice', async () => {
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ detail: 'SQL secret database error' }), { status: 500 }));
  const { result } = renderHook(() => useStockerAI());
  result.current.setSession('session', 'test-user');
  const replies = await result.current.executeToolCalls([tool()]);
  expect(JSON.stringify(replies)).not.toContain('SQL secret');
});

it('passes a successful offer through once with its original target', async () => {
  const response = { action: 'offer_go_back', spoken: 'One skipped machine remains.' };
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify(response)));
  const { result } = renderHook(() => useStockerAI());
  result.current.setSession('session', 'test-user');
  const success = vi.fn();
  const replies = await result.current.executeToolCalls([tool()], success);
  expect(success).toHaveBeenCalledWith('skip_current_machine', response);
  expect(replies[0].result).toEqual(response);
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).expected_machine_id).toBe('m1');
  const duplicate = await result.current.executeToolCalls([tool()], success);
  expect(duplicate[0].result.ignored).toBe(true);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(success).toHaveBeenCalledTimes(1);
});
