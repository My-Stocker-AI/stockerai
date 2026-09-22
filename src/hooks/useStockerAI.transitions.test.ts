// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/authFetch', () => ({ authFetch: mocks.fetch }));
let useStockerAI: typeof import('./useStockerAI').useStockerAI;
const session = '11111111-1111-4111-8111-111111111111';
const context = { routeId: 'route', currentMachineId: 'machine', pickDirection: 'forward',
  machines: [{ id: 'machine', completedItems: 0, status: 'pending' }] };
const snapshot = { route_id: 'route', current_machine_id: 'machine', pick_direction: 'forward',
  machines: context.machines, picking_revision: 'revision-1' };
const tool = (name: string, args = {}) => ({ id: 'test', function: { name, arguments: JSON.stringify(args) } });
beforeEach(async () => {
  vi.resetModules(); vi.resetAllMocks(); localStorage.clear();
  vi.stubEnv('VITE_API_BACKEND', 'python');
  ({ useStockerAI } = await import('./useStockerAI'));
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it('refuses a reset invented by the model without the dedicated confirmation', async () => {
  const {result}=renderHook(() => useStockerAI());
  result.current.setSession(session,'user');
  const replies=await result.current.executeToolCalls([tool('reset_route')],undefined,false,{...context,pickingRevision:'revision-1'});
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(replies[0].result.error).toContain('confirmation');
});

it.each([['start_machine','start'],['skip_current_machine','skip'],['go_back_to_skipped','back'],['reset_route','reset']])(
  'binds %s to exact session/revision and overrides forged targets', async (name, action) => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ action: 'ok', picking_revision: 'revision-2' })));
    const { result } = renderHook(() => useStockerAI());
    result.current.setSession(session, 'user');
    await result.current.executeToolCalls([tool(name, { direction: 'end', action: 'reset', expected_revision: 'forged',
      expected_machine_id: 'forged', session_id: 'forged' })], undefined, false, { ...context, pickingRevision: 'revision-1' }, name === 'reset_route');
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch.mock.calls[0][0]).toContain('/picking-transition');
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ session_id: session,
      expected_revision: 'revision-1', expected_machine_id: 'machine', action,
      direction: name === 'start_machine' ? 'reverse' : 'forward' });
  });

it('pins the initial revision across a lost response instead of upgrading stale intent', async () => {
  mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify(snapshot)))
    .mockRejectedValueOnce(new Error('response lost'))
    .mockResolvedValueOnce(new Response('{}', { status: 409 }));
  const { result } = renderHook(() => useStockerAI());
  result.current.setSession(session, 'user');
  await result.current.executeToolCalls([tool('start_machine', {direction:'beginning'})], undefined, false, context);
  await result.current.executeToolCalls([tool('skip_current_machine')], undefined, false, context);
  expect(mocks.fetch.mock.calls.map(c => c[0].split('/').pop())).toEqual(['picking-context','picking-transition','picking-transition']);
  expect(JSON.parse(mocks.fetch.mock.calls[2][1].body).expected_revision).toBe('revision-1');
});

it.each(['route_id','current_machine_id','pick_direction','machines'])('rejects changed bootstrap %s without mutation', async field => {
  mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ...snapshot, [field]: field==='machines' ? [] : 'changed' })));
  const { result } = renderHook(() => useStockerAI());
  result.current.setSession(session, 'user');
  const success = vi.fn();
  const replies = await result.current.executeToolCalls([tool('skip_current_machine')], success, false, context);
  expect(mocks.fetch).toHaveBeenCalledOnce();
  expect(success).not.toHaveBeenCalled();
  expect(replies[0].result.error).toBeTruthy();
});

it('uses the revision supplied by an accepted result on the next action', async () => {
  mocks.fetch.mockImplementation(async () => new Response(JSON.stringify({ action: 'offer_go_back', picking_revision:'revision-2' })));
  const {result} = renderHook(() => useStockerAI());
  result.current.setSession(session,'user');
  await result.current.executeToolCalls([tool('skip_current_machine')],undefined,false,{...context,pickingRevision:'revision-1'});
  await result.current.executeToolCalls([tool('go_back_to_skipped')],undefined,false,{...context,pickingRevision:'revision-2'});
  expect(JSON.parse(mocks.fetch.mock.calls[1][1].body).expected_revision).toBe('revision-2');
});
