// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams('route=route-fixture&resume=1'),
  fetch: vi.fn(), from: vi.fn(), load: vi.fn(), clear: vi.fn(), setState: vi.fn(), reset: vi.fn(),
  speak: vi.fn(async () => {}), start: vi.fn(async () => true), send: vi.fn(),
  persistence: null as any, voice: null as any, state: null as any,
  user: { id: 'fixture-user' },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useSearchParams: () => [mocks.params] }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user, userProfile: { first_name: 'Tester' }, loading: false }) }));
vi.mock('@/hooks/useVoice', () => ({ useVoice: () => mocks.voice }));
vi.mock('@/hooks/useStockerSession', () => ({ useStockerSession: () => ({
  routeState: mocks.state, sessionId: '', messages: [], messagesRef: { current: [] },
  updateFromTool: vi.fn(), addMessage: vi.fn(), reset: mocks.reset, setRouteState: mocks.setState,
  setMessages: vi.fn(), setSessionId: vi.fn(), generateNewSessionId: vi.fn(() => 'new-browser-session'),
}) }));
vi.mock('@/hooks/useStockerAI', () => ({ useStockerAI: () => ({ setSession: vi.fn(), sendToAI: mocks.send,
  executeToolCalls: vi.fn(), getRoutes: vi.fn(async () => []) }) }));
vi.mock('@/hooks/useSessionPersistence', () => ({ useSessionPersistence: () => mocks.persistence }));
vi.mock('@/hooks/useKeywordLearning', () => ({ useKeywordLearning: () => ({ getUserKeywords: vi.fn(async () => []), trackKeywords: vi.fn() }) }));
vi.mock('@/hooks/useEnvironmentDetection', () => ({ useEnvironmentDetection: () => ({ environment: { endpointing: 300 } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/lib/authFetch', () => ({ authFetch: mocks.fetch }));
import StockerApp from './StockerApp';

const snapshot = () => ({ has_session: true, session_id: 'server-session', picking_revision: 'revision-1',
  route: { id: 'route-fixture', route_name: 'Fixture route', route_date: '2099-01-01', total_machines: 2 },
  current_machine: { id: 'second', name: 'Second fixture', completed_items: 5, total_items: 10 },
  current_machine_index: 2, current_item: { product_name: 'Fixture snack', quantity: 2, slot: 'A5' },
  pick_direction: 'reverse', items_remaining: 5, machines: [], completed_list: [],
});
const saved = () => ({ userId: 'fixture-user', routeId: 'route-fixture', routeName: 'Fixture route', routeDate: '2099-01-01',
  savedAt: Date.now(), completed: false, sessionId: 'server-session', currentMachineId: 'second', currentMachineName: 'Second fixture',
  currentMachineIndex: 2, completedItems: [], machines: [], currentItem: { product: 'Fixture snack', quantity: 2, slot: 'A5' } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = new URLSearchParams('route=route-fixture&resume=1');
  mocks.state = { routeId: null, routeName: null, machines: [], completedItems: [], currentItem: null, currentItem2: null, pendingMachineTransition: null };
  mocks.load.mockResolvedValue(null);
  mocks.send.mockResolvedValue({ content: 'Fixture reply' });
  mocks.persistence = { load: mocks.load, clear: mocks.clear, save: vi.fn(), isValidSession: (value: any) => !!value };
  mocks.voice = { status: 'idle', getStatus: () => 'idle', speak: mocks.speak, startListening: mocks.start,
    stopListening: vi.fn(), stopAudio: vi.fn(), setAwaitingDirection: vi.fn(), setThinking: vi.fn(),
    resumeListening: vi.fn(), playErrorBeep: vi.fn() };
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify(snapshot())));
  const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query),
    limit: vi.fn(async () => ({ data: [{ id: 'route-fixture', route_name: 'Fixture route', delivery_date: '2099-01-01' }], error: null })),
    single: vi.fn(async () => ({ data: { id: 'route-fixture' }, error: null })) };
  mocks.from.mockReturnValue(query);
  window.matchMedia = vi.fn(() => ({ matches: false })) as any;
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Chrome fixture' });
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'navigate' }] as any);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Live network forbidden'); }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['http', 'network', 'missing', 'wrong-route'])('failed explicit resume (%s) never starts or clears a route', async failure => {
  if (failure === 'http') mocks.fetch.mockResolvedValue(new Response('{}', { status: 503 }));
  if (failure === 'network') mocks.fetch.mockRejectedValue(new Error('Fixture network failure'));
  if (failure === 'missing') mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ has_session: false })));
  if (failure === 'wrong-route') mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ ...snapshot(), route: { ...snapshot().route, id: 'other-route' } })));
  const view = render(React.createElement(StockerApp));
  await waitFor(() => expect(view.getByRole('button', { name: 'Retry loading saved route' })).toBeTruthy());
  expect(mocks.clear).not.toHaveBeenCalled();
  expect(mocks.reset).not.toHaveBeenCalled();
  expect(mocks.start).not.toHaveBeenCalled();
  expect(mocks.setState).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

it('retry reloads the saved snapshot without starting a new route', async () => {
  mocks.fetch.mockResolvedValueOnce(new Response('{}', { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(snapshot())));
  const view = render(React.createElement(StockerApp));
  fireEvent.click(await view.findByRole('button', { name: 'Retry loading saved route' }));
  await waitFor(() => expect(mocks.setState).toHaveBeenCalledWith(expect.objectContaining({ currentMachineId: 'second', pickDirection: 'reverse' })));
  expect(mocks.clear).not.toHaveBeenCalled();
  expect(mocks.reset).not.toHaveBeenCalled();
});

it('ordinary reopening with matching saved state offers resume instead of clearing it', async () => {
  mocks.params = new URLSearchParams('route=route-fixture');
  mocks.load.mockResolvedValue(saved());
  const view = render(React.createElement(StockerApp));
  await waitFor(() => expect(view.getByRole('button', { name: 'CONTINUE' })).toBeTruthy());
  expect(mocks.clear).not.toHaveBeenCalled();
  expect(mocks.reset).not.toHaveBeenCalled();
  expect(mocks.start).not.toHaveBeenCalled();
  expect(mocks.from().eq).toHaveBeenCalledWith('id', 'route-fixture');
  expect(mocks.from().eq).not.toHaveBeenCalledWith('user_id', 'fixture-user');
});

it('a saved-route verification error preserves the cache and offers retry', async () => {
  mocks.params = new URLSearchParams('route=route-fixture');
  mocks.load.mockResolvedValue(saved());
  mocks.from().single.mockResolvedValue({ data: null, error: { message: 'Fixture connection failure' } });
  const view = render(React.createElement(StockerApp));
  await view.findByRole('button', { name: 'Retry loading saved route' });
  expect(mocks.clear).not.toHaveBeenCalled();
  expect(mocks.reset).not.toHaveBeenCalled();
});

it('a local storage failure does not masquerade as a route with no saved work', async () => {
  mocks.params = new URLSearchParams('route=route-fixture');
  mocks.load.mockRejectedValue(new Error('Fixture storage unavailable'));
  const view = render(React.createElement(StockerApp));
  await view.findByRole('button', { name: 'Retry loading saved route' });
  expect(mocks.clear).not.toHaveBeenCalled();
  expect(mocks.reset).not.toHaveBeenCalled();
  expect(mocks.start).not.toHaveBeenCalled();
});

it('a genuinely new route with no saved work still starts normally', async () => {
  mocks.params = new URLSearchParams('route=route-fixture');
  mocks.load.mockResolvedValue(null);
  render(React.createElement(StockerApp));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  expect(mocks.clear).toHaveBeenCalledOnce();
  expect(mocks.speak).toHaveBeenCalledWith(expect.stringContaining('Starting Fixture route'));
  // Let the existing delayed route selection finish before unmounting.
  await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
});
