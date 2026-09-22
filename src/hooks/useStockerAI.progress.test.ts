// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/authFetch', () => ({ authFetch: mocks.fetch }));
let useStockerAI: typeof import('./useStockerAI').useStockerAI;
const session = '11111111-1111-4111-8111-111111111111';
const context = { routeId: 'route-a', pickingRevision: 'revision-a', currentMachineId: 'machine-a', pickDirection: 'forward',
  machines: [{ id: 'machine-a', completedItems: 4, status: 'in_progress' }] };
const tool = (name = 'get_next_item', args = {}) => ({ id: 'tool-1', function: { name, arguments: JSON.stringify(args) } });

beforeEach(async () => {
  vi.resetModules(); vi.resetAllMocks(); localStorage.clear();
  vi.stubEnv('VITE_API_BACKEND', 'python');
  ({ useStockerAI } = await import('./useStockerAI'));
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it.each([false, true])('binds progress to application state in two-item mode=%s', async two => {
  localStorage.setItem('stocker-call-two-items', String(two));
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ action: 'next_item' })));
  const { result } = renderHook(() => useStockerAI());
  result.current.setSession(session, 'caller');
  await result.current.executeToolCalls([tool('get_next_item', {
    session_id: 'invented', user_id: 'outsider', expected_machine_id: 'wrong',
    expected_completed_items: 99, expected_direction: 'reverse', operation_id: 'invented', count: 2,
  })], undefined, false, context);
  expect(mocks.fetch.mock.calls[0][0]).toBe('https://stockerai-api.onrender.com/api/picking-transition');
  const sent = JSON.parse(mocks.fetch.mock.calls[0][1].body);
  expect(sent).toMatchObject({ session_id: session, user_id: 'caller', expected_machine_id: 'machine-a',
    expected_revision: 'revision-a', action: 'next', direction: 'forward', count: two ? 2 : 1 });
  expect(sent.operation_id).toMatch(/^[0-9a-f-]{36}$/);
});

it('adopts the database session returned by route selection', async () => {
  mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ action: 'machine_ready', session_id: session })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ action: 'next_item' })));
  const { result } = renderHook(() => useStockerAI());
  result.current.setSession('browser-session', 'caller');
  await result.current.executeToolCalls([tool('set_route_sequence')]);
  await result.current.executeToolCalls([tool()], undefined, false, context);
  expect(JSON.parse(mocks.fetch.mock.calls[1][1].body).session_id).toBe(session);
});

it.each([409, 503])('does not fall back or report success after HTTP %s', async status => {
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ detail: 'state changed' }), { status }));
  const { result } = renderHook(() => useStockerAI());
  result.current.setSession(session, 'caller');
  const success = vi.fn();
  const replies = await result.current.executeToolCalls([tool()], success, false, context);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(success).not.toHaveBeenCalled();
  expect(replies[0].result.error).toBeTruthy();
});

it.each([undefined, { ...context, machines: [] }])('refuses missing progress context without sending a mutation: %s', async missing => {
  const { result } = renderHook(() => useStockerAI());
  result.current.setSession(session, 'caller');
  const replies = await result.current.executeToolCalls([tool()], undefined, false, missing);
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(replies[0].result.error).toBeTruthy();
});

it('does not apply an old response after the user changes session', async () => {
  let finish!: (value: Response) => void;
  mocks.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { result } = renderHook(() => useStockerAI());
  result.current.setSession(session, 'caller');
  const success = vi.fn();
  const pending = result.current.executeToolCalls([tool()], success, false, context);
  result.current.setSession('different-session', 'caller');
  finish(new Response(JSON.stringify({ action: 'next_item' })));
  const replies = await pending;
  expect(success).not.toHaveBeenCalled();
  expect(replies[0].result.ignored).toBe(true);
});

it.each([true, false])('resolves an old browser session only if its displayed target matches: %s', async matches => {
  mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ has_session: true, session_id: session,
    route: { id: matches ? 'route-a' : 'different-route' },
    current_machine: { id: 'machine-a', completed_items: 4 }, pick_direction: 'forward',
  }))).mockResolvedValueOnce(new Response(JSON.stringify({ action: 'next_item', session_id: session })));
  const { result } = renderHook(() => useStockerAI());
  result.current.setSession('old-browser-session', 'caller');
  const success = vi.fn();
  const replies = await result.current.executeToolCalls([tool()], success, false, { ...context, routeId: 'route-a' });
  expect(mocks.fetch.mock.calls[0][0]).toContain('/resume-state');
  expect(mocks.fetch).toHaveBeenCalledTimes(matches ? 2 : 1);
  if (matches) {
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body).session_id).toBe(session);
    expect(success).toHaveBeenCalledOnce();
  } else {
    expect(replies[0].result.error).toBeTruthy();
    expect(success).not.toHaveBeenCalled();
  }
});
