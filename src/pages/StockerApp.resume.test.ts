// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RouteState } from '@/hooks/useStockerSession';
import type { useSessionPersistence } from '@/hooks/useSessionPersistence';
import type { useVoice } from '@/hooks/useVoice';

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams('route=route-fixture&resume=1'),
  fetch: vi.fn(), from: vi.fn(), load: vi.fn(), clear: vi.fn(), setState: vi.fn(), reset: vi.fn(),
  speak: vi.fn(async () => {}), start: vi.fn(async () => true), send: vi.fn(),
  persistence: null as Partial<ReturnType<typeof useSessionPersistence>> | null,
  voice: null as Partial<ReturnType<typeof useVoice>> | null,
  state: null as Partial<RouteState> | null,
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

const snapshot = () => ({ has_session: true, resume_window_version: 1, session_id: 'server-session', picking_revision: 'revision-1',
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
  mocks.persistence = { load: mocks.load, clear: mocks.clear, save: vi.fn(), isValidSession: (value: unknown) => !!value };
  mocks.voice = { status: 'idle', getStatus: () => 'idle', speak: mocks.speak, startListening: mocks.start,
    stopListening: vi.fn(), stopAudio: vi.fn(), setAwaitingDirection: vi.fn(), setThinking: vi.fn(),
    resumeListening: vi.fn(), playErrorBeep: vi.fn() };
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify(snapshot())));
  type QueryMock = { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn>; single: ReturnType<typeof vi.fn> };
  const query: QueryMock = { select: vi.fn(() => query), eq: vi.fn(() => query),
    limit: vi.fn(async () => ({ data: [{ id: 'route-fixture', route_name: 'Fixture route', delivery_date: '2099-01-01' }], error: null })),
    single: vi.fn(async () => ({ data: { id: 'route-fixture' }, error: null })) };
  mocks.from.mockReturnValue(query);
  window.matchMedia = vi.fn(() => ({ matches: false } as MediaQueryList));
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Chrome fixture' });
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'navigate' }] as unknown as PerformanceEntryList);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Live network forbidden'); }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['http', 'network', 'missing', 'wrong-route', 'old-server'])('failed explicit resume (%s) never starts or clears a route', async failure => {
  if (failure === 'http') mocks.fetch.mockResolvedValue(new Response('{}', { status: 503 }));
  if (failure === 'network') mocks.fetch.mockRejectedValue(new Error('Fixture network failure'));
  if (failure === 'missing') mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ has_session: false })));
  if (failure === 'old-server') mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ ...snapshot(), resume_window_version: undefined })));
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

it.each([false, true])('restores both unfinished items independently of current two-item preference (%s)', async two => {
  localStorage.setItem('stocker-call-two-items', String(two));
  const snap = { ...snapshot(), confirmed_items: 3,
    current_item2: { product_name: 'Second unfinished snack', quantity: 4, slot: 'A6' },
    completed_list: [{ product_name: 'Already finished', quantity: 1, slot: 'A1' }] };
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify(snap)));
  render(React.createElement(StockerApp));
  await waitFor(() => expect(mocks.setState).toHaveBeenCalledWith(expect.objectContaining({
    currentItem: expect.objectContaining({ product: 'Fixture snack', machineName: 'Second fixture' }),
    currentItem2: expect.objectContaining({ product: 'Second unfinished snack', quantity: 4, machineName: 'Second fixture' }),
    completedItems: [expect.objectContaining({ product: 'Already finished' })],
    pickingRevision: 'revision-1', pickDirection: 'reverse',
  })));
  expect(mocks.speak).toHaveBeenCalledWith(expect.stringContaining('3 of 10 confirmed'));
  expect(mocks.speak).toHaveBeenCalledWith(expect.stringContaining('and 4 Second unfinished snack'));
  expect(mocks.clear).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

it('restores the direction prompt when interrupted between machines', async () => {
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ ...snapshot(), current_item: null,
    current_item2: null, confirmed_items: 0, awaiting_direction: true })));
  render(React.createElement(StockerApp));
  await waitFor(() => expect(mocks.setState).toHaveBeenCalledWith(expect.objectContaining({
    currentItem: null, currentItem2: null,
    pendingMachineTransition: { nextMachineId: 'second', nextMachineName: 'Second fixture', nextMachineIndex: 2 },
  })));
  expect(mocks.speak).toHaveBeenCalledWith(expect.stringContaining('Top or bottom?'));
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
